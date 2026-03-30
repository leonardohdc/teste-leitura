"""Lista de categorias permitidas = padrão (código) + extras gravadas na SQLite."""

from __future__ import annotations

import sqlite3

from .constants import DEFAULT_ALLOWED_CATEGORIES
from .db import list_user_category_names


def merged_allowed_categories(conn: sqlite3.Connection) -> tuple[str, ...]:
    extras = list_user_category_names(conn)
    merged: list[str] = []
    seen: set[str] = set()
    for x in DEFAULT_ALLOWED_CATEGORIES:
        if x not in seen:
            seen.add(x)
            merged.append(x)
    for x in extras:
        if x not in seen:
            seen.add(x)
            merged.append(x)
    return tuple(sorted(merged, key=str.lower))
