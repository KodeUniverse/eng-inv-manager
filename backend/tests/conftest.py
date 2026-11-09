import sqlite3

from fastapi.testclient import TestClient
import pytest

import main
from cleaning import COLUMNS, NUMERIC_COLUMNS

ALL_COLUMNS = list(COLUMNS.values())


def base_record(**overrides):
    record = {name: None for name in ALL_COLUMNS}
    record.update(overrides)
    return record


def invoiced(part, module, sub_type, price, cost, invoice_date, oh_date, avg_sales_days):
    return base_record(
        type="Invoiced",
        part=part,
        module=module,
        sub_type=sub_type,
        unit_sales_price=price,
        repair_unit_cost=cost,
        invoice_date=invoice_date,
        oh_date=oh_date,
        avg_sales_days=avg_sales_days,
    )


def scrapped(part, module, sub_type):
    return base_record(type="Scrapped", part=part, module=module, sub_type=sub_type)


def inventory(part, module, sub_type, whse, condition, qty):
    return base_record(
        type="Inventory",
        part=part,
        module=module,
        sub_type=sub_type,
        whse=whse,
        condition=condition,
        qty=qty,
    )


# Rows crafted to hit every threshold boundary in main.py exactly:
# P1 = 1 scrap of 5 records (scrap flag), P2 = margin exactly at 20%,
# P3 = 181 days to sell (slow), P9 = exactly 180 days (not slow),
# P4 = thin samples only, P5/P6 = blank and zero quantities.
RECORDS = [
    *[invoiced("P1", "CORE", "Airfoils", 100, 80, "2024-01-10", "10/1/2023", 30) for _ in range(4)],
    scrapped("P1", "CORE", "Airfoils"),
    inventory("P1", "CORE", "Airfoils", "MDT", "R", 2),
    inventory("P1", "CORE", "Airfoils", "MDT", "R", 3),
    *[invoiced("P2", "LPT", "LLPs", 100, 80, "2024-01-11", "01/01/2024", 20) for _ in range(5)],
    inventory("P2", "LPT", "LLPs", "MDT", "R", 3),
    *[invoiced("P3", "FAN", "Airfoils", 100, 40, "2024-01-01", "07/04/2023", 30) for _ in range(5)],
    inventory("P3", "FAN", "Airfoils", "HAJ", "O", 4),
    *[invoiced("P9", "FAN", "Airfoils", 100, 90, "2024-01-01", "07/05/2023", 30) for _ in range(5)],
    inventory("P9", "FAN", "Airfoils", "WDL", "X", 1),
    *[invoiced("P4", "Non-HVM", "Non-HVM", 100, 50, "2023-12-01", "NULL", 30) for _ in range(3)],
    scrapped("P4", "Non-HVM", "Non-HVM"),
    inventory("P4", "Non-HVM", "Non-HVM", "MDT", "S", 1),
    inventory("P5", "Non-HVM", "Non-HVM", "MDT", "R", None),
    inventory("P6", "Non-HVM", "Non-HVM", "HAJ", "R", 0),
    invoiced("P7", "CORE", "Airfoils", 100, 0, "2024-01-05", None, 30),
    invoiced("P7", "CORE", "Airfoils", 0, 50, "2024-01-05", None, 30),
    invoiced("P8", "CORE", "Airfoils", 100, 60, "2024-01-05", "NULL", 30),
]


@pytest.fixture
def api(monkeypatch, tmp_path) -> TestClient:
    db_path = tmp_path / "inventory.db"
    with sqlite3.connect(db_path) as conn:
        column_defs = ", ".join(
            f"{name} {'REAL' if name in NUMERIC_COLUMNS else 'TEXT'}" for name in ALL_COLUMNS
        )
        conn.execute(f"CREATE TABLE parts_clean ({column_defs})")
        for record in RECORDS:
            values = [record[name] for name in ALL_COLUMNS]
            placeholders = ", ".join(["?"] * len(ALL_COLUMNS))
            conn.execute(f"INSERT INTO parts_clean ({', '.join(ALL_COLUMNS)}) VALUES ({placeholders})", values)
    monkeypatch.setattr(main, "DB_PATH", db_path)
    return TestClient(main.app)
