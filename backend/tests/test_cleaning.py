import pandas as pd

from cleaning import COLUMNS, clean


def _row(**overrides):
    row = {name: "" for name in COLUMNS.values()}
    row.update(type="Inventory", part="P1", invoice_date="", unit_sales_price="")
    row.update(overrides)
    return row


def test_cleaning_sets_unreadable_oh_dates_to_null():
    raw = pd.DataFrame(
        [
            _row(part="P1", oh_date="10/1/2023"),
            _row(part="P2", oh_date="0222-02-17"),
            _row(part="P3", oh_date="N/A"),
            _row(part="P4", oh_date="NULL"),
        ]
    )

    df, steps = clean(raw)

    assert df["oh_date"].isna().tolist() == [False, True, True, True]
    assert dict(steps)["set to NULL: unreadable oh_date"] == 2
