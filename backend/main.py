import csv
import io
import sqlite3
import statistics
from contextlib import closing
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

DB_PATH = Path(__file__).parent / "data" / "inventory.db"

MIN_EVIDENCE = 5
WEAK_MARGIN_THRESHOLD = 0.20
SCRAP_FLAG_THRESHOLD = 0.20
SLOW_SELL_DAYS = 180

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["GET"])

@app.get("/")
def root():
    return [
        {"path": route.path, "name": route.name, "methods": sorted(route.methods)}
        for route in app.routes
        if hasattr(route, "methods")
    ]

@app.get("/health")
def health():
    return "Healthy!"

@app.get("/parts")
def list_parts(limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)):
    """Return cleaned part records, paged with limit and offset."""
    if not DB_PATH.exists():
        raise HTTPException(status_code=503, detail="Cleaned data not found. Run cleaning.py first.")
    with closing(sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM parts_clean ORDER BY rowid LIMIT ? OFFSET ?", (limit, offset)
        ).fetchall()
    return [dict(row) for row in rows]

@app.get("/parts/export")
def export_parts():
    """Download the full cleaned dataset as a CSV file."""
    if not DB_PATH.exists():
        raise HTTPException(status_code=503, detail="Cleaned data not found. Run cleaning.py first.")

    def rows_as_csv():
        with closing(sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)) as conn:
            cursor = conn.execute("SELECT * FROM parts_clean ORDER BY rowid")
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(col[0] for col in cursor.description)
            yield buffer.getvalue()
            for row in cursor:
                buffer.seek(0)
                buffer.truncate()
                writer.writerow(row)
                yield buffer.getvalue()

    return StreamingResponse(
        rows_as_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="parts_clean.csv"'},
    )


def _read_rows(sql: str, params: tuple = ()) -> list[dict]:
    """Run a read-only query against the cleaned database and return rows as dicts."""
    if not DB_PATH.exists():
        raise HTTPException(status_code=503, detail="Cleaned data not found. Run cleaning.py first.")
    with closing(sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def _days_between(invoice_date: str, oh_date: str) -> int | None:
    """Days from an m/d/yyyy on-hand date (OH_DATE) to an ISO invoice date, or None if unparseable."""
    try:
        return (datetime.strptime(invoice_date, "%Y-%m-%d") - datetime.strptime(oh_date, "%m/%d/%Y")).days
    except (ValueError, TypeError):
        return None


def _record_margin(price: float, cost: float) -> tuple[float | None, str | None]:
    """Margin for a sold record, or None with a note where it can't be computed."""
    if cost == 0:
        return None, "No repair cost recorded"
    if price <= 0:
        return None, "Non-positive sales price"
    return round((price - cost) / price, 4), None


@app.get("/parts/sold")
def sold_parts():
    """Invoiced parts with unit margin. Margin is null where it can't be computed."""
    rows = _read_rows(
        """
        SELECT part, description, module, sub_type, invoice_date, destination_country,
               qty, unit_sales_price, repair_unit_cost
        FROM parts_clean WHERE type = 'Invoiced' ORDER BY invoice_date DESC
        """
    )
    for row in rows:
        row["margin"], row["margin_note"] = _record_margin(row["unit_sales_price"], row["repair_unit_cost"])
    return rows


@app.get("/parts/inventory")
def inventory_groups():
    """On-hand quantity and distinct part count by Module, SubType, warehouse, and condition."""
    rows = _read_rows(
        """
        SELECT module, sub_type, whse, condition, COUNT(DISTINCT part) AS parts, SUM(qty) AS qty
        FROM parts_clean
        WHERE type = 'Inventory'
        GROUP BY module, sub_type, whse, condition
        ORDER BY module, sub_type, whse, condition
        """
    )
    return rows


def _summarize_days(groups: dict[str, list[tuple[int, int]]]):
    """Count and median/mean days per group from (actual, expected) pairs, sorted worst first."""
    result = []
    for name, records in groups.items():
        actual = [pair[0] for pair in records]
        expected = [pair[1] for pair in records]
        diffs = [a - e for a, e in records]
        result.append(
            {
                "name": name,
                "count": len(records),
                "mean_days": round(statistics.mean(diffs), 1),
                "median_days": statistics.median(diffs),
                "median_actual_days": statistics.median(actual),
                "median_expected_days": statistics.median(expected),
            }
        )
    result.sort(key=lambda row: row["median_days"], reverse=True)
    return result


@app.get("/sellthrough/summary")
def sellthrough_summary():
    """Median and mean days to sell over (or under) expected, by Module and SubType."""
    rows = _read_rows(
        """
        SELECT module, sub_type, invoice_date, oh_date, avg_sales_days
        FROM parts_clean
        WHERE type = 'Invoiced' AND oh_date IS NOT NULL AND oh_date NOT IN ('', 'NULL')
        """
    )
    by_module: dict[str, list[tuple[int, int]]] = {}
    by_sub_type: dict[str, list[tuple[int, int]]] = {}
    for row in rows:
        actual = _days_between(row["invoice_date"], row["oh_date"])
        if actual is None or actual < 0 or row["avg_sales_days"] is None:
            continue
        expected = round(row["avg_sales_days"])
        by_module.setdefault(row["module"], []).append((actual, expected))
        by_sub_type.setdefault(row["sub_type"], []).append((actual, expected))
    return {"module": _summarize_days(by_module), "sub_type": _summarize_days(by_sub_type)}


@app.get("/parts/review")
def parts_review():
    """On-hand parts ranked for review: scrap rate, repair margin, and days to sell flags."""
    on_hand = {
        row["part"]: row
        for row in _read_rows(
            """
            SELECT part, MAX(description) AS description, module, sub_type, SUM(qty) AS qty
            FROM parts_clean
            WHERE type = 'Inventory'
            GROUP BY part HAVING SUM(qty) > 0
            """
        )
    }
    sold_rows = _read_rows(
        "SELECT part, unit_sales_price, repair_unit_cost, invoice_date, oh_date FROM parts_clean WHERE type = 'Invoiced'"
    )
    scrap = {
        row["part"]: row
        for row in _read_rows(
            "SELECT part, SUM(type = 'Scrapped') AS scrapped, COUNT(*) AS total FROM parts_clean GROUP BY part"
        )
    }

    history: dict[str, dict] = {}
    for row in sold_rows:
        part = row["part"]
        h = history.setdefault(part, {"prices": [], "costs": [], "margins": [], "days": []})
        price, cost = row["unit_sales_price"], row["repair_unit_cost"]
        h["prices"].append(price)
        if cost > 0:
            h["costs"].append(cost)
        margin, _ = _record_margin(price, cost)
        if margin is not None:
            h["margins"].append(margin)
        days = _days_between(row["invoice_date"], row["oh_date"])
        if days is None or days < 0:
            continue
        h["days"].append(days)

    result = []
    for part, on in on_hand.items():
        h = history.get(part, {"prices": [], "costs": [], "margins": [], "days": []})
        sc = scrap.get(part, {"scrapped": 0, "total": 0})
        scrap_rate = round(sc["scrapped"] / sc["total"], 4) if sc["total"] else 0.0
        median_margin = statistics.median(h["margins"]) if h["margins"] else None
        median_days = round(statistics.median(h["days"]), 1) if h["days"] else None
        avg_cost = round(statistics.mean(h["costs"]), 2) if h["costs"] else None
        price_avg = round(statistics.mean(h["prices"]), 2) if h["prices"] else None
        scrap_sampled = sc["total"] >= MIN_EVIDENCE
        margin_sampled = len(h["margins"]) >= MIN_EVIDENCE
        days_sampled = len(h["days"]) >= MIN_EVIDENCE
        high_scrap = scrap_sampled and scrap_rate >= SCRAP_FLAG_THRESHOLD
        weak_margin = margin_sampled and median_margin < WEAK_MARGIN_THRESHOLD
        slow = days_sampled and median_days > SLOW_SELL_DAYS
        flags = int(high_scrap) + int(weak_margin) + int(slow)
        if not margin_sampled:
            action = "Manual review"
        elif median_margin >= WEAK_MARGIN_THRESHOLD:
            action = "Repair & sell"
        elif median_margin >= 0:
            action = "Pricing review"
        else:
            action = "Scrap candidate"
        exposure = round(on["qty"] * avg_cost, 2) if avg_cost is not None else None
        result.append(
            {
                "part": part,
                "description": on["description"],
                "module": on["module"],
                "sub_type": on["sub_type"],
                "qty_on_hand": on["qty"],
                "sales": len(h["prices"]),
                "median_margin": median_margin,
                "avg_unit_repair_cost": avg_cost,
                "avg_unit_sales_price": price_avg,
                "median_days_to_sell": median_days,
                "scrap_rate": scrap_rate,
                "scrapped": sc["scrapped"],
                "high_scrap": high_scrap,
                "weak_margin": weak_margin,
                "slow": slow,
                "scrap_sampled": scrap_sampled,
                "margin_sampled": margin_sampled,
                "days_sampled": days_sampled,
                "flags": flags,
                "exposure": exposure,
                "action": action,
            }
        )
    result.sort(key=lambda row: (-row["flags"], -(row["exposure"] or 0)))
    return result


@app.get("/parts/scrapped/summary")
def scrapped_summary():
    """Scrap counts by Module and SubType, with share of all scrap and scrap rate."""
    summary = {}
    for column in ("module", "sub_type"):
        rows = _read_rows(
            f"""
            SELECT {column} AS name, SUM(type = 'Scrapped') AS scrapped, COUNT(*) AS total
            FROM parts_clean GROUP BY name
            """
        )
        total_scrapped = sum(row["scrapped"] for row in rows)
        for row in rows:
            row["share_of_scrap"] = round(row["scrapped"] / total_scrapped, 4) if total_scrapped else 0
            row["scrap_rate"] = round(row["scrapped"] / row["total"], 4)
        summary[column] = sorted(rows, key=lambda row: row["scrap_rate"], reverse=True)
    return summary


@app.get("/parts/scrapped")
def scrapped_parts(min_records: int = Query(5, ge=1)):
    """Parts with a scrapped record, ranked by scrap rate. Parts under min_records go last."""
    rows = _read_rows(
        """
        SELECT part, MAX(description) AS description, SUM(type = 'Scrapped') AS scrapped, COUNT(*) AS total
        FROM parts_clean GROUP BY part HAVING scrapped > 0
        """
    )
    for row in rows:
        row["scrap_rate"] = round(row["scrapped"] / row["total"], 4)
        row["enough_records"] = row["total"] >= min_records
    # Sorting order: enough_records == True first, then the highest scrap rates, then amt scrapped.
    rows.sort(key=lambda row: (not row["enough_records"], -row["scrap_rate"], -row["scrapped"]))
    return rows

