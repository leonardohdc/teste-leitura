import re
import sqlite3
import unicodedata

from .constants import ALLOWED_CATEGORIES_SET
from .rules import match_fixed_rule

UNCATEGORIZED = "Não classificado"


def normalize_description(text: str) -> str:
    s = (text or "").strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s)
    return s


def categorize_local(conn: sqlite3.Connection, raw_description: str) -> str:
    """Regras fixas + SQLite; sem LLM."""
    normalized = normalize_description(raw_description)
    if not normalized:
        return UNCATEGORIZED

    fixed = match_fixed_rule(normalized)
    if fixed:
        return fixed

    row = conn.execute(
        "SELECT category FROM description_categories WHERE normalized_description = ?",
        (normalized,),
    ).fetchone()
    if row:
        cat = str(row["category"])
        if cat in ALLOWED_CATEGORIES_SET:
            return cat

    return UNCATEGORIZED


def categorize(
    conn: sqlite3.Connection,
    raw_description: str,
) -> str:
    """Compatível com código que espera um único `categorize` (apenas regras + SQLite)."""
    return categorize_local(conn, raw_description)
