# eng-inv-manager

A web app that helps discover insights for aircraft engine inventory management. It turns a raw parts export into clean data and shows where value is made or lost, and which parts on hand to repair, sell, or scrap.

## Setup and run

Requirements: Docker with Compose.

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080 (interactive docs at `/docs`)

After changing `pyproject.toml` or `package.json`, rebuild with `docker compose down -v && docker compose up --build`. The `-v` flag clears the container's stored dependencies.

The app reads `backend/data/inventory.db`, which is built from the raw export. To rebuild it:

```bash
cd backend && uv run python cleaning.py
```

Run the cleaning script again whenever the raw export changes. It replaces the database and writes a row count for each rule.

## Data

The raw file is `backend/data/data.csv` (39,338 rows, 25 columns). It is never edited. The cleaning script reads it and writes `parts_clean` and `cleaning_log` tables to `backend/data/inventory.db`.

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
| `Updated_Description` holds taxonomy labels such as `Non-HVM` | 12,340 | Not used. The app shows the raw `description` column instead. |
| Sold (`Invoiced`) rows with a repair cost of 0 | 1,265 | Kept. Margin is blank and the row is labelled "No repair cost recorded". A zero cost would otherwise show as a 100% margin. |
| Sold rows with a sales price of 0 or less | 152 | Kept. Margin is blank and the row is labelled "Non-positive sales price". These include negative prices, probably credits or reversals. |
| Sold rows where the price is at or below the repair cost | 358 | Kept and included in margins, since they are real losses. |

Unpriced inventory and scrapped rows are kept. They have no price because they aren't sold, so dropping them would remove the on-hand and scrap views.

Row counts: 39,338 raw → 35,289 clean.

### Known data issues not yet handled

- `OrderNo` contains decimal values and should be treated as unreliable.
- `Condition` mixes letter codes with numbers such as `0` and `870`.
- Placeholders such as `NULL` and `N/A` remain in text columns that the cleaning rules don't touch, including `SN`, `FSC`, `PO_No`, and `OrderNo`.
- `OH_DATE` has not been validated the way `Invoice Date` has.

## Definitions

- **Scrap rate (per Module or SubType):** scrapped records ÷ all records in that group. This is the main scrap metric, because it answers how often parts handled in a group end up scrapped.
- **Scrap rate (per part number):** scrapped records ÷ all records for that `PART`. Parts with fewer than 5 records are ranked below the others, because one scrapped record out of one would show as 100%.
- **Share of scrap:** scrapped records in a group ÷ all scrapped records. This shows where scrap volume is concentrated, and it's shown as pie charts.

### Limits

- The export is a snapshot. Inventory records haven't been resolved yet, so a part still on the shelf might be scrapped later. Scrap rates for groups with a lot of inventory are lower bounds.
- Sell-through (`AvgNoofSalesDays`) exists only for some record types, so averages are computed only where the field is populated.

## Scrap view

The scrap view is built. It shows:

- Scrap rate by Module and by SubType, as bar charts. Hovering shows the scrapped count and total records.
- Share of all scrap by Module and by SubType, as pie charts. Hovering shows the scrapped count.
- A table of parts with at least one scrapped record, ranked by scrap rate. Parts with fewer than 5 records are listed last and marked "Low sample".
- The table starts in rank order: scrap rate, with parts under 5 records last. Click a column header once for ascending, twice for descending, and a third time to return to rank order. Under a scrap rate sort, parts under 5 records stay last.
- Use the filter icon on a column header to filter: text contains for part number and description, and numeric comparisons for total records, scrapped count, and scrap rate (%). Sorting and filtering apply to all rows before paging.
- The table uses AG Grid Community (MIT). It sorts and filters the full dataset in the browser.

API endpoints:

- `GET /parts/scrapped/summary` returns the Module and SubType figures.
- `GET /parts/scrapped?min_records=5` returns the part table. `min_records` defaults to 5.

The part table shows the raw `description`. The `Updated_Description` column is not used (see the data issues above). Where a part number has more than one description, the table shows the alphabetically last one.

## Repair economics view

The repair economics view is built. It shows:

- Margin by Module and by SubType, as box plots. Each box shows the median, the middle half of sales, and whiskers at the 10th and 90th percentiles. Hovering over a box shows the sales count, median, middle 50% range, and whisker values. The whiskers are percentiles, not the true minimum and maximum, so a few extreme sales do not stretch the axis. Sales beyond the −100% to 100% axis are not drawn. The axis is limited to −100% to 100%, and the chart says how many sales fall outside that range.
- Two tabs. The "Per-part margin" tab has one row per part number. It shows the sales count, the median repair margin across that part's sales with a margin, and the share of those sales below 20%. Parts with fewer than 5 sales are listed last, the same rule as the scrap view.
- The "Sold part records" tab lists each sold (`Invoiced`) record, with sales price, repair cost, margin, and the reason a margin is blank. Sorting and filtering work as in the scrap view. A switch above the table hides sales without a margin, and another shows only weak margins. The box plots always use only sales with a margin.
- **Weak margin:** a repair margin below 20%, including negative margins. In the table, negative margins are shown in red, margins from 0% to below 20% in yellow, and margins of 20% or more in green. The weakest-margins switch lists these sales with the lowest margin first.

Definitions:

- **Margin:** (unit sales price − unit repair cost) ÷ unit sales price. Unit values are used, so quantity does not change the margin.
- **Blank margin:** a sale with no repair cost or a non-positive sales price has no margin.

Limits:

- Margin is sale price minus repair cost only. The dataset has no acquisition or lease cost, so this is not profit.
- Each sale counts once in the box plots, so a part that sells often has more weight than one that sells rarely.

## Planned decision-support feature

Not built yet. The planned feature is a ranked list of parts to review, using the scrap and margin data.

## What I would do with more time

- Re-align the 2,333 shifted rows where the missing field can be identified, instead of dropping them.
- Add tests for the cleaning rules and metric calculations.
- Check whether any part numbers appear only in dropped rows, so the app doesn't silently miss them.
- Validate `OH_DATE` and the remaining text columns.
- Add CSV export for the scrap and margin views, not just the full table.

## How AI tools were used

TODO: to be completed by the author.
