import csv
import io
import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

DB_PATH = Path(__file__).parent / "data" / "inventory.db"

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

