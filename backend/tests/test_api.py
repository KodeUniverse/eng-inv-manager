import sqlite3

import pytest
from fastapi.testclient import TestClient

import main

HTTP_422 = 422


def test_health_and_missing_database(api, monkeypatch, tmp_path):
    assert api.get("/health").json() == "Healthy!"
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "missing.db")
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/parts").status_code == 503


def test_parts_paging_and_validation(api):
    all_rows = api.get("/parts").json()
    assert len(all_rows) == 35
    assert api.get("/parts", params={"limit": 5}).json()[0]["part"] == "P1"
    assert api.get("/parts", params={"limit": 1001}).status_code == HTTP_422


def test_parts_export(api):
    response = api.get("/parts/export")
    lines = response.text.splitlines()
    assert response.headers["content-type"].startswith("text/csv")
    assert lines[0].startswith("type,part,")
    assert len(lines) == 36


def test_parts_sold_margins(api):
    rows = api.get("/parts/sold").json()
    assert len(rows) == 25
    assert rows[0]["part"] == "P2"
    priced = [row for row in rows if row["part"] == "P8"]
    assert priced[0]["margin"] == 0.4 and priced[0]["margin_note"] is None
    notes = [row["margin_note"] for row in rows if row["part"] == "P7"]
    assert set(notes) == {"No repair cost recorded", "Non-positive sales price"}
    assert all(row["margin"] is None for row in rows if row["part"] == "P7")


def test_parts_inventory_groups(api):
    rows = api.get("/parts/inventory").json()
    assert len(rows) == 7
    core = rows[0]
    assert core == {"module": "CORE", "sub_type": "Airfoils", "whse": "MDT", "condition": "R", "parts": 1, "qty": 5}
    blank_qty = [row for row in rows if row["module"] == "Non-HVM" and row["whse"] == "MDT" and row["condition"] == "R"]
    assert blank_qty[0]["qty"] is None


def test_sellthrough_summary(api):
    summary = api.get("/sellthrough/summary").json()
    modules = {row["name"]: row for row in summary["module"]}
    assert list(modules) == ["FAN", "CORE", "LPT"]
    assert summary["module"][0]["count"] == 10
    assert summary["module"][0]["median_days"] == 150.5
    assert summary["module"][0]["median_actual_days"] == 180.5
    assert summary["module"][0]["median_expected_days"] == 30
    core = modules["CORE"]
    assert core["count"] == 4 and core["mean_days"] == 71.0 and core["median_days"] == 71.0
    lpt = modules["LPT"]
    assert lpt["median_days"] == -10 and lpt["median_expected_days"] == 20
    assert all(row["name"] != "Non-HVM" for row in summary["module"])
    sub_types = {row["name"]: row for row in summary["sub_type"]}
    assert sub_types["Airfoils"]["count"] == 14 and sub_types["Airfoils"]["median_days"] == 150.0
    assert sub_types["LLPs"]["median_days"] == -10


def test_parts_scrapped(api):
    rows = api.get("/parts/scrapped").json()
    assert [row["part"] for row in rows] == ["P4", "P1"]
    assert rows[0]["scrap_rate"] == 0.2 and rows[0]["total"] == 5 and rows[0]["enough_records"] is True
    assert rows[1]["scrap_rate"] == 0.1429 and rows[1]["total"] == 7
    low = api.get("/parts/scrapped", params={"min_records": 8}).json()
    assert all(row["enough_records"] is False for row in low)
    assert [row["part"] for row in rows if row["part"] not in ("P4", "P1")] == []


def test_parts_scrapped_summary(api):
    summary = api.get("/parts/scrapped/summary").json()
    modules = {row["name"]: row for row in summary["module"]}
    assert list(modules) == ["Non-HVM", "CORE", "FAN", "LPT"]
    assert modules["Non-HVM"]["scrap_rate"] == 0.1429 and modules["Non-HVM"]["total"] == 7
    assert modules["CORE"] == {"name": "CORE", "scrapped": 1, "total": 10, "share_of_scrap": 0.5, "scrap_rate": 0.1}
    assert modules["FAN"]["scrapped"] == 0 and modules["LPT"]["total"] == 6
    sub_types = {row["name"]: row for row in summary["sub_type"]}
    assert list(sub_types) == ["Non-HVM", "Airfoils", "LLPs"]


def test_parts_review_ranking(api):
    rows = api.get("/parts/review").json()
    by_part = {row["part"]: row for row in rows}
    assert len(rows) == 5
    assert "P5" not in by_part and "P6" not in by_part
    assert [row["part"] for row in rows] == ["P3", "P9", "P4", "P1", "P2"]


def test_parts_review_flags_and_actions(api):
    by_part = {row["part"]: row for row in api.get("/parts/review").json()}

    p2 = by_part["P2"]
    assert p2["median_margin"] == 0.2 and p2["weak_margin"] is False and p2["flags"] == 0
    assert p2["action"] == "Repair & sell" and p2["exposure"] == 240 and p2["days_sampled"] is True

    p9 = by_part["P9"]
    assert p9["median_days_to_sell"] == 180 and p9["slow"] is False
    assert p9["weak_margin"] is True and p9["flags"] == 1 and p9["action"] == "Pricing review"

    p3 = by_part["P3"]
    assert p3["median_days_to_sell"] == 181 and p3["slow"] is True and p3["flags"] == 1
    assert p3["exposure"] == 160 and p3["action"] == "Repair & sell"

    p4 = by_part["P4"]
    assert p4["scrap_rate"] == 0.2 and p4["high_scrap"] is True and p4["flags"] == 1
    assert p4["margin_sampled"] is False and p4["action"] == "Manual review"
    assert p4["median_days_to_sell"] is None and p4["exposure"] == 50

    p1 = by_part["P1"]
    assert p1["sales"] == 4 and p1["margin_sampled"] is False and p1["days_sampled"] is False
    assert p1["scrap_sampled"] is True and p1["high_scrap"] is False and p1["flags"] == 0
    assert p1["action"] == "Manual review" and p1["exposure"] == 400


@pytest.mark.skipif(not main.DB_PATH.exists(), reason="real database not built by cleaning.py")
def test_real_database_smoke():
    with sqlite3.connect(f"file:{main.DB_PATH}?mode=ro", uri=True) as conn:
        count = conn.execute("SELECT COUNT(*) FROM parts_clean").fetchone()[0]
    assert count == 35289
    with TestClient(main.app) as client:
        for path in [
            "/parts/sold",
            "/parts/inventory",
            "/sellthrough/summary",
            "/parts/review",
            "/parts/scrapped",
            "/parts/scrapped/summary",
        ]:
            assert client.get(path).status_code == 200
