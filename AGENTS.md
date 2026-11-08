# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

Parts Inventory Decision-Support App. An internal tool for an aviation parts business that leases, repairs, and sells jet engine parts. It turns a raw inventory export into trustworthy numbers and helps the inventory manager decide what to do with parts on hand: repair, sell, or scrap.

The business question: where is value being made or lost, and what should we do with the parts we hold?

The full requirements are in `docs/requirements.md`. Read it before starting any feature, data, or README work. The "Required features" section below is a summary of it, and the requirements file is the source of truth if the two ever differ.

## Stack

- **Backend:** FastAPI, Python 3.13, managed with `uv` (`backend/pyproject.toml`, `backend/uv.lock`).
- **Frontend:** React 19, TypeScript, Vite (`frontend/`). Linting with `oxlint`.
- **Data work:** Python and SQL. Choose one SQL engine (DuckDB or SQLite) and document the choice in the README.
- **Run:** `docker compose up --build` from the repo root. Backend on `:8080`, frontend on `:5173`.

Repository layout:

```
backend/
  main.py              FastAPI app
  data/data.csv        raw export (read-only, never edit)
  Dockerfile, .dockerignore
frontend/
  src/                 React app
  Dockerfile, .dockerignore
compose.yaml
```

## Source data

Raw file: `backend/data/data.csv`. 39,338 rows, 25 columns, latin-1 encoded (not UTF-8). The raw file must stay unchanged. All cleaning writes to a separate output.

Columns:

| Column | Notes |
| --- | --- |
| `Type` | Record type: `Inventory`, `Invoiced`, or `Scrapped` in valid rows |
| `PART` | Part number (about 5,500 distinct) |
| `Invoice Date` | Populated only for `Invoiced` rows |
| `SN` | Serial number. Placeholders such as `NULL`, `N/A`, `NSI` |
| `Description` | Free text, often inconsistent |
| `QTY` | Quantity |
| `Condition` | Condition code: `R`, `O`, `X`, `S`, `B`, `A`, `N`, and others |
| `TAG_NO` | Tag number |
| `FSC` | Field service code, mostly `NULL` |
| `OH_DATE` | On-hand date |
| `Rep Order No` | Repair order number |
| `WHSE` | Warehouse code: `MDT`, `HAJ`, `WDL`, `SGP`, and others |
| `Repair Unit Cost`, `Repair Ext Cost` | Repair cost, per unit and extended |
| `Unit Sales Price`, `Extended Sales Price` | Sales price, per unit and extended |
| `PO_No`, `Misc_PONO`, `BackLog`, `OrderNo` | Purchase and order references. Mostly unused |
| `Ultimate_Destination_Country` | Destination country for sold parts |
| `Updated_Description` | Cleaned description |
| `Module` | Business grouping: `Non-HVM`, `CORE`, `QEC / LRU`, `FAN`, `LPT`. Some rows are blank or `NULL` |
| `SubType` | Finer grouping: `Non-HVM`, `Airfoils`, `HVM`, `LLPs`, and others |
| `AvgNoofSalesDays` | Expected days to sell |

### Known data problems

These were found by profiling the file. Confirm them again when the export changes.

1. **Encoding.** The file is latin-1, not UTF-8. Reading it as UTF-8 fails.
2. **Column misalignment.** About 2,333 rows have a `Type` value that is not a record type (for example `1`, `2`, `4`). Their values are shifted into the wrong columns: prices appear in `Condition`, dates in `Invoice Date`, and country names in price fields. These rows need to be re-aligned or excluded, and the choice documented. Do not guess silently.
3. **Exact duplicates.** About 1,545 rows are exact duplicates of other rows.
4. **Placeholder strings.** `NULL`, `N/A`, and empty strings are used interchangeably for missing values.
5. **Excel date serials.** Some dates appear as numbers such as `58828` instead of dates. These only occur in misaligned rows, so dropping those rows removes them. Valid `Invoiced` rows all use `m/d/yyyy`.
6. **Inconsistent taxonomy.** `Non-HVM` appears as both a `Module` and a `SubType` value. Some rows have blank or `NULL` `Module`/`SubType`.
7. **Corrupted order numbers.** `OrderNo` contains decimals such as `0.845546`. Treat the column as unreliable.
8. **Mixed condition codes.** `Condition` mixes letters with numeric values such as `0` and `870`.
9. **Sparse fields.** `Invoice Date`, sales prices, and `AvgNoofSalesDays` are populated only for some record types. Do not compute averages across record types that lack the field.

## Required features

Build all of the following. Each view can be simple: a chart, a table, and filters. Logic quality matters more than visual design.

1. **Data layer.** Load the raw file and produce a clean dataset. Document each data problem and how it was handled. Make cleaning reproducible, so running it on a new export works without manual steps. Include a cleaning script and a short note in the README on each decision.
2. **Scrap view.** Show scrap volume and share by `Module` and `SubType`, and the most frequently scrapped parts. Define "scrap rate" explicitly in the README and explain the choice.
3. **Repair economics view.** For sold parts, compare sales price with repair cost. Show margin by `Module` and `SubType`, and list parts with weak or negative margin.
4. **Inventory and sell-through view.** Show on-hand inventory by `Module`, `SubType`, warehouse, and condition. Compare actual time to sell with the expected time (`AvgNoofSalesDays`).
5. **One decision-support feature.** Pick one that helps the inventory manager act: a repair-or-scrap flag, a slow-mover watchlist, or a ranked list of parts to review. Explain the logic and its limits in the README.

Stretch goals, only if time allows: a simple scrap-risk baseline, automated tests for cleaning and calculation logic, CSV export.

### README requirements

The README is 1–2 pages and must cover:

- Setup and run instructions (single command)
- Data issues found and how each was handled
- Definitions and assumptions (scrap rate, margin, sell-through)
- Limits of the data and what would be done with more time
- How AI tools were used

## Coding standards

These rules apply to all code in this repo.

- **Simple and explainable.** Code should be easy for a new engineer to follow and explain in an interview.
- **Production-ready.** Handle errors at the edges (bad files, missing columns). Keep dependencies minimal.
- **No over-abstraction.** No base classes, factories, or generic frameworks for a small app. Prefer plain functions.
- **Minimal comments.** Only comment non-obvious logic. Do not narrate the code.
- **Brief docstrings.** One or two lines explaining what a function does and any non-obvious input or output. No long argument lists unless needed.
- **No mention of the project's origin.** Do not write "case study", "assignment", "interview", "take-home", or similar in code, docs, comments, or commit messages. Describe the project as an internal product.
- **Keep the raw data untouched.** Never write to `backend/data/data.csv`.
- **Match existing style.** Follow the patterns already in `backend/main.py` and `frontend/src/`.
- **No implicit string concatenation.** Do not split one string across adjacent literals. Use a single literal, a triple-quoted string for multi-line SQL, or an f-string.

## Commands

Run from the repo root unless noted.

```bash
docker compose up --build        # run both services with hot reload
docker compose down -v           # stop and remove named volumes (needed after dependency changes)

cd backend && uv sync            # install backend deps locally
cd backend && uv run fastapi dev main.py
cd backend && uv run python cleaning.py   # rebuild data/inventory.db from data/data.csv

cd frontend && npm ci
cd frontend && npm run dev
cd frontend && npm run lint
cd frontend && npm run build
```

## Working rules for agents

- **Re-read the "Coding standards" section before every code change.** Do not rely on memory of it from earlier in the session. Re-read it at the start of each task and again before you report back.
- **Check your diff against the coding standards before finishing.** Confirm each changed file: no comments that narrate the code, docstrings of one or two lines, no abstraction that is not needed yet, no origin wording, and the style of the surrounding file.
- Read the existing code before changing it. Do not refactor files that are not part of the task.
- Verify changes: run the service, check the endpoint or page, and run lint or build for the touched package.
- Do not add new dependencies without a clear reason. Mention any new dependency in the summary.
- Do not commit or push unless asked.
- When a data decision is ambiguous, state the assumption in the README and in the summary to the user. Do not hide it in code.
- If the data cannot answer a question, say what is missing instead of inventing a number.
- **Keep the README current as you work.** Update `README.md` in the same change as any feature, data rule, or definition. Do not leave it for the end. It must cover the sections listed under "README requirements" in `docs/requirements.md`.
- Record every data decision in the README when it is made: the rule, the rows affected, and the reason.
- Record every metric definition in the README when it is added, including its denominator and its limits.
