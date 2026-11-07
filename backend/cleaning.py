"""Clean the raw parts export and write it to SQLite."""

import sqlite3
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).parent
RAW_PATH = BASE_DIR / "data" / "data.csv"
DB_PATH = BASE_DIR / "data" / "inventory.db"

COLUMNS = {
    "Type": "type",
    "PART": "part",
    "Invoice Date": "invoice_date",
    "SN": "serial_number",
    "Description": "description",
    "QTY": "qty",
    "Condition": "condition",
    "TAG_NO": "tag_no",
    "FSC": "fsc",
    "OH_DATE": "oh_date",
    "Rep Order No": "rep_order_no",
    "WHSE": "whse",
    "Repair Unit Cost": "repair_unit_cost",
    "Repair Ext Cost": "repair_ext_cost",
    "Unit Sales Price": "unit_sales_price",
    "Extended Sales Price": "extended_sales_price",
    "PO_No": "po_no",
    "Misc_PONO": "misc_pono",
    "BackLog": "backlog",
    "OrderNo": "order_no",
    "Ultimate_Destination_Country": "destination_country",
    "Updated_Description": "updated_description",
    "Module": "module",
    "SubType": "sub_type",
    "AvgNoofSalesDays": "avg_sales_days",
}
VALID_TYPES = ["Inventory", "Invoiced", "Scrapped"]
PLACEHOLDERS = ["", "NULL"]
UNCLASSIFIED_COLUMNS = ["module", "sub_type", "condition", "whse"]
NUMERIC_COLUMNS = [
    "qty",
    "repair_unit_cost",
    "repair_ext_cost",
    "unit_sales_price",
    "extended_sales_price",
    "avg_sales_days",
]


def load_raw(path: Path) -> pd.DataFrame:
    """Read the raw export as text with whitespace stripped and columns renamed."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="latin-1")
    missing = set(COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"raw file is missing columns: {sorted(missing)}")
    df = df[list(COLUMNS)].apply(lambda col: col.str.strip())
    return df.rename(columns=COLUMNS)


def clean(raw: pd.DataFrame) -> tuple[pd.DataFrame, list[tuple[str, int]]]:
    """Apply the cleaning rules and return the clean table with a count per rule."""
    steps = [("raw rows", len(raw))]

    df = raw[raw["type"].isin(VALID_TYPES)]
    steps.append(("dropped: invalid type", len(raw) - len(df)))

    no_price = (df["type"] == "Invoiced") & pd.to_numeric(
        df["unit_sales_price"], errors="coerce"
    ).isna()
    steps.append(("dropped: invoiced row without sales price", int(no_price.sum())))
    df = df[~no_price]

    before = len(df)
    df = df.drop_duplicates()
    steps.append(("dropped: exact duplicates", before - len(df)))

    df = df.copy()
    for col in UNCLASSIFIED_COLUMNS:
        unclassified = df[col].isin(PLACEHOLDERS)
        steps.append((f"unclassified: {col}", int(unclassified.sum())))
        df[col] = df[col].mask(unclassified, "Unclassified")

    invoiced = df["type"] == "Invoiced"
    invoice_date = pd.to_datetime(df["invoice_date"].where(invoiced), format="%m/%d/%Y")
    df["invoice_date"] = invoice_date.dt.strftime("%Y-%m-%d")

    for col in NUMERIC_COLUMNS:
        values = pd.to_numeric(df[col], errors="coerce")
        unreadable = values.isna() & ~df[col].isin(PLACEHOLDERS)
        steps.append((f"set to NULL: unreadable {col}", int(unreadable.sum())))
        df[col] = values

    return df, steps


def write_db(df: pd.DataFrame, steps: list[tuple[str, int]], path: Path) -> None:
    """Write the clean table and the cleaning log, replacing any previous run."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        df.to_sql("parts_clean", conn, if_exists="replace", index=False)
        pd.DataFrame(steps, columns=["step", "rows"]).to_sql(
            "cleaning_log", conn, if_exists="replace", index=False
        )


def main() -> None:
    raw = load_raw(RAW_PATH)
    df, steps = clean(raw)
    write_db(df, steps, DB_PATH)
    for step, rows in steps:
        print(f"{step}: {rows}")


if __name__ == "__main__":
    main()
