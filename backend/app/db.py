import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Optional


def _db_path() -> Path:
    raw = os.getenv("SQLITE_PATH", "data/app.db")
    p = Path(raw)
    return p if p.is_absolute() else Path.cwd() / p


def ensure_data_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def init_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS description_categories (
            normalized_description TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            created_at TEXT
        )
        """
    )
    conn.commit()


def get_connection() -> sqlite3.Connection:
    path = _db_path()
    ensure_data_dir(path)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_session() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def get_category_for_normalized(conn: sqlite3.Connection, normalized: str) -> Optional[str]:
    row = conn.execute(
        "SELECT category FROM description_categories WHERE normalized_description = ?",
        (normalized,),
    ).fetchone()
    return str(row["category"]) if row else None


def upsert_mapping(conn: sqlite3.Connection, normalized: str, category: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO description_categories (normalized_description, category, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(normalized_description) DO UPDATE SET
            category = excluded.category,
            created_at = excluded.created_at
        """,
        (normalized, category, now),
    )
    conn.commit()


def list_mappings(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT normalized_description, category, created_at FROM description_categories ORDER BY normalized_description"
    ).fetchall()
    return [dict(r) for r in rows]
