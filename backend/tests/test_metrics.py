import main


def test_margin_computes_price_minus_cost_over_price():
    assert main._record_margin(100, 80) == (0.2, None)
    assert main._record_margin(100, 250) == (-1.5, None)


def test_margin_is_blank_without_repair_cost():
    assert main._record_margin(100, 0) == (None, "No repair cost recorded")


def test_margin_is_blank_for_non_positive_price():
    assert main._record_margin(0, 50) == (None, "Non-positive sales price")
    assert main._record_margin(-10, 5) == (None, "Non-positive sales price")


def test_days_between_parses_m_d_yyyy():
    assert main._days_between("2024-01-10", "10/1/2023") == 101


def test_days_between_is_none_for_unparseable_dates():
    assert main._days_between("2024-01-05", None) is None
    assert main._days_between("2024-01-05", "NULL") is None
    assert main._days_between("2024-01-05", "58828") is None
    assert main._days_between("not a date", "1/1/2024") is None


def test_summarize_days_counts_and_sorts_worst_first():
    groups = {
        "slow": [(100, 30), (200, 30)],
        "fast": [(10, 30), (20, 30), (40, 30)],
    }
    summary = main._summarize_days(groups)
    assert [row["name"] for row in summary] == ["slow", "fast"]
    assert summary[0]["count"] == 2
    assert summary[0]["median_days"] == 120
    assert summary[0]["mean_days"] == 120.0
    assert summary[0]["median_actual_days"] == 150
    assert summary[0]["median_expected_days"] == 30
    assert summary[1]["median_days"] == -10
