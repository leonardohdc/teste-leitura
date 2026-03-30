import re
import sqlite3
import unicodedata

from .categories_registry import merged_allowed_categories
from .rules import match_fallback_rule

UNCATEGORIZED = "Não classificado"


def normalize_description(text: str) -> str:
    s = (text or "").strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s)
    return s


def categorize_sqlite_only(
    conn: sqlite3.Connection,
    raw_description: str,
    allowed_set: frozenset[str],
) -> str:
    """Só mapeamentos gravados pelo usuário; sem regras nem LLM."""
    normalized = normalize_description(raw_description)
    if not normalized:
        return UNCATEGORIZED

    row = conn.execute(
        "SELECT category FROM description_categories WHERE normalized_description = ?",
        (normalized,),
    ).fetchone()
    if row:
        cat = str(row["category"])
        if cat in allowed_set:
            return cat

    return UNCATEGORIZED


def categorize_local(conn: sqlite3.Connection, raw_description: str) -> str:
    """SQLite + regras de fallback (sem LLM). Útil para testes ou chamadas pontuais."""
    allowed_set = frozenset(merged_allowed_categories(conn))
    normalized = normalize_description(raw_description)
    if not normalized:
        return UNCATEGORIZED

    row = conn.execute(
        "SELECT category FROM description_categories WHERE normalized_description = ?",
        (normalized,),
    ).fetchone()
    if row:
        cat = str(row["category"])
        if cat in allowed_set:
            return cat

    fixed = match_fallback_rule(normalized, allowed_set)
    if fixed:
        return fixed

    return UNCATEGORIZED


def categorize(
    conn: sqlite3.Connection,
    raw_description: str,
) -> str:
    """Compatível com código legado: SQLite + fallback por regras (sem LLM)."""
    return categorize_local(conn, raw_description)
