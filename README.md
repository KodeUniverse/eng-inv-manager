# Aviation Part Inventory Manager

![Screenshot of front page](./screenshots/scrap.png)

A web app that helps discover insights for aircraft engine inventory management. It turns a raw parts export into clean data and shows where value is made or lost, and which parts on hand to repair, sell, or scrap.

## Setup and run

Requirements: Docker with Compose.

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080 (interactive docs at `/docs`)

Rebuild with `docker compose down -v && docker compose up --build` after changing `pyproject.toml` or `package.json`; the `-v` flag clears the container's stored dependencies.

The backend runs `cleaning.py` before starting FastAPI, so `docker compose up --build` rebuilds `backend/data/inventory.db` from the raw export and then serves it. If cleaning stops on bad data, the backend container fails at startup instead of serving a stale database. This takes a few seconds on boot. Rebuilding locally without Docker:

```bash
cd backend && uv run python cleaning.py
```

Backend tests run outside Docker:

```bash
cd backend && uv run pytest
```

## Data

The raw file is `backend/data/data.csv` (39,338 rows, 25 columns) and is never edited. The cleaning script reads it and writes `parts_clean` and `cleaning_log` tables to `backend/data/inventory.db`.

Cleaning impact: 39,338 raw → 35,289 clean, so 4,049 rows (about 10.3%) are dropped and the cleaned dataset keeps about 89.7% of the raw rows. The drops account for 2,333 misaligned rows, 204 invoiced rows without a sales price, and 1,512 exact duplicates.

### Data issues and how they were handled

| Issue | Rows | Handling |
| --- | --- | --- |
| Encoding is latin-1, not UTF-8 | All | Read as latin-1. |
| Columns shifted: `Type` holds a number (for example `1`, `2`) and values are moved left | 2,333 | Dropped. A shifted row is missing a field, and the missing field can't be identified reliably, so rebuilding it would mean guessing. |
| `Invoiced` rows with no sales price | 204 | Dropped. Sold parts need a price for the margin view. |
| Exact duplicate rows | 1,512 | Dropped. Counted after the two rules above. |
| `Module` / `SubType` blank or `NULL` | 1,012 | Labelled `Unclassified`. |
| `Condition` blank | 863 | Labelled `Unclassified`. |
| `WHSE` blank (mostly scrapped parts, which have no warehouse) | 12,691 | Labelled `Unclassified`. |
| `QTY` blank on inventory rows | 863 | Left as `NULL`. Not filled with 0 or 1. |
| `Invoice Date` in mixed formats | Invoiced rows | Parsed as `m/d/yyyy` and stored as `YYYY-MM-DD`. The script stops if a date fails to parse. Excel serial numbers and codes such as `F0301` appear only in dropped rows. |
| `OH_DATE` that doesn't parse as `m/d/yyyy` | 1 non-placeholder value | Set to `NULL`; the row is kept because `OH_DATE` is only needed for sell-through. Blank and `NULL` values are also left as `NULL`. |
| Sold (`Invoiced`) rows with a repair cost of 0 | 1,265 | Kept. Margin is blank and the row is labelled "No repair cost recorded". A zero cost would otherwise show as a 100% margin. |
| Sold rows with a sales price of 0 or less | 152 | Kept. Margin is blank and the row is labelled "Non-positive sales price". These include negative prices, probably credits or reversals. |
| Sold rows where the price is at or below the repair cost | 358 | Kept and included in margins, since they are real losses. |

Unpriced inventory and scrapped rows are kept — they have no price because they aren't sold, so dropping them would remove the on-hand and scrap views.

### Known data issues not yet handled

- `OrderNo` contains decimal values and should be treated as unreliable.
- `Condition` mixes letter codes with numbers such as `0` and `870`.
- Placeholders such as `NULL` and `N/A` remain in text columns the cleaning rules don't touch, including `SN`, `FSC`, `PO_No`, and `OrderNo`.

## Tables in the app

Every table is using AG Grid, sorting and filtering in the browser, 15 rows per page. Click column headers to sort ascending/descending; use a column's filter icon for text or numeric filters. Parts with too few records to judge (<5) are listed last with a "Low sample" badge in every view.

## Scrap view

- **Scrap rate (per Module or SubType):** scrapped records ÷ all records in that group. The main scrap metric, because it answers how often parts handled in a group end up scrapped.
- **Scrap rate (per part number):** scrapped records ÷ all records for that `PART`. Parts with fewer than 5 records rank last, because one scrapped record out of one record would show as 100%.
- **Share of scrap:** scrapped records in a group ÷ all scrapped records. Where scrap volume is concentrated.
- Shown as bar charts (% rate) and pie charts (share) by Module and SubType — `GET /parts/scrapped/summary` — plus a per-part table ranked by scrap rate — `GET /parts/scrapped?min_records=5` (default 5). Hovering shows the scrapped count and total records.
- The part table shows the raw `description`. Where a part number has more than one description, the alphabetically last one is shown.

## Repair economics view

- **Margin:** (unit sales price − unit repair cost) ÷ unit sales price, on unit values only, so quantity does not change it.
- **Blank margin:** a sale with no repair cost or a non-positive sales price has none; both are labelled and kept in the record list.
- **Weak margin:** a repair margin below 20%, including negatives. Negative margins show in red, 0% to below 20% in yellow, and 20% or more in green.
- Margin by Module and SubType as box plots — median and middle half of sales, whiskers at the 10th and 90th percentiles so a few extreme sales don't stretch the −100% to 100% axis; sales beyond the axis are not drawn and the chart says how many. Hovering shows the sales count, median, middle 50% range, and whisker values.
- A "Per-part margin" tab with one row per part — sales count, median repair margin across that part's sales with a margin, share of those sales below 20%; parts with fewer than 5 sales list last (`GET /parts/sold` backs both tabs).
- A "Sold part records" tab listing each sold (`Invoiced`) record with sales price, repair cost, margin, and the reason a margin is blank. A switch hides sales without a margin; another shows only weak margins, lowest first.
- Limits: margin is sale price minus repair cost only — the dataset has no acquisition or lease cost, so this is not profit. Each sale counts once in the box plots, so a part that sells often weighs more than one that sells rarely.

## Inventory and sell-through view

- **Actual days to sell:** invoice date − on-hand date (`OH_DATE`, parsed as `m/d/yyyy`) on the same sold record.
- **Expected days to sell:** the record's `AvgNoofSalesDays`, rounded to a whole day before medians are taken. `median_expected_days` is the counted records' median expectation, not an average of the field across parts.
- **Days over expected:** actual − expected per record. Bars show the median of the per-record differences, so it is not the same as median actual − median expected (CORE's median difference is −18 days while its separate medians imply −24).
- Funnel: of 7,277 sold records, 1,212 have no on-hand date and 1 has an unparseable one (set to `NULL` in cleaning), leaving 6,064 counted. Every figure for a group is computed from the same counted records, one `(actual, expected)` pair per sold record.
- Two bar charts of actual-vs-expected median days by Module and SubType, sorted worst difference first — `GET /sellthrough/summary`; hovering shows the sales count, the mean and median difference, and the median actual and expected days. Outliers are kept.
- One table of on-hand inventory grouped by Module, SubType, warehouse, and condition with summed `QTY` and distinct part counts — 201 groups — `GET /parts/inventory`, sorted by part count descending on open.
- Limits: quantities are a snapshot sum of `QTY`, and one group has no recorded quantity (blank). Part numbers are not visible at this grouping level. `OH_DATE`'s format is validated, but its business meaning is not — it may be arrival, listing, or repair completion. Sell-through exists only where the field is populated, and figures are computed only there. Almost every group shows a negative median: parts sell faster than `AvgNoofSalesDays` predicts, so either the field is not calibrated to this definition or parts are expected to sit longer than they do.

## Decision-support view: parts to review

- Every part with stock on hand (2,867 parts with a positive on-hand quantity — `GET /parts/review`) is scored on three checks and ranked by how many it fails, so the parts worst on several axes come first.
- **High scrap:** scrap rate at or above 20%, counted only when the part has at least 5 records.
- **Weak margin:** median repair margin below 20%, counted only when the part has at least 5 sales with a margin.
- **Slow:** median days from on-hand date to invoice above 180, counted only when the part has at least 5 such sales.
- A check with too little evidence is shown as a dash with a "Low sample" badge and does not count against the part — deliberately not treated as a failure or as unknown-good.
- **Ranking:** flagged checks first (worst first), ties ordered by estimated total repair cost: `on-hand qty × average unit repair cost`, the repair work the stock would likely need if history repeats.
- **Suggested action:** median margin at or above 20% = "Repair & sell", 0–20% = "Pricing review", below 0% = "Scrap candidate", and fewer than 5 margin samples = "Manual review".
- Limits: 2,024 on-hand parts have never sold, so they carry no margin or days evidence, fail at most the scrap check, and sink toward the bottom — reviews there stay manual. The estimated repair cost assumes past repair costs repeat and measures work in dollars, not profit lost (no acquisition, lease, or scrap-proceeds data). `OH_DATE` semantics are unvalidated. The thresholds (20% scrap, 20% margin, 180 days, minimum sample of 5) are constants in `backend/main.py`; changing one is a one-line edit and shifts the ranking.

## What I would do with more time

- Re-align the 2,333 shifted rows where the missing field can be identified, instead of dropping them.
- Check whether any part numbers appear only in dropped rows, so the app doesn't silently miss them.
- Validate the business meaning of `OH_DATE` and the remaining text columns.
- Add CSV export for the scrap and margin views, not just the full table.

## How AI tools were used
I used AI tools to help me quickly investigate the data through scripts, test the backend by generating test data, generating code segments to review, and automating installation of dependencies. I also used to run testing loops and make quick changes to the visual color-scheme and layout.
