import csv
import io
import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

DB_PATH = Path(__file__).parent / "data" / "inventory.db"

app = FastAPI()

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


