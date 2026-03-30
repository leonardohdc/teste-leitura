import csv
import io
import re
from dataclasses import dataclass, field
from typing import List, Optional

import pandas as pd

from .categorize import UNCATEGORIZED, categorize_sqlite_only, normalize_description
from .constants import ORIGEM_CREDITO, ORIGEM_DEBITO
from .categories_registry import merged_allowed_categories
from .llm_categorize import apply_llm_categories, batch_categorize_normalized
from .rules import match_fallback_rule

EXPECTED_ALIASES = {
    "data": "Data",
    "date": "Data",
    "valor": "Valor",
    "amount": "Valor",
    "identificador": "Identificador",
    "id": "Identificador",
    "descrição": "Descrição",
    "descricao": "Descrição",
    "description": "Descrição",
    "title": "Descrição",
}


@dataclass
class StatementRow:
    data: str
    valor: str
    identificador: str
    descricao: str
    categoria: str
    origem: str
    needs_review: bool = False
    llm_confidence: Optional[float] = None
    _norm_cache: str = field(default="", repr=False, compare=False)

    def normalized_description(self) -> str:
        if not self._norm_cache:
            self._norm_cache = normalize_description(self.descricao)
        return self._norm_cache


def _normalize_header(name: str) -> str:
    key = name.strip().lower()
    return EXPECTED_ALIASES.get(key, name.strip())


def _coerce_statement_row_dicts(rows: List[dict]) -> List[dict]:
    """
    Garante as quatro colunas canónicas. Identificador vazio (ex.: CSV date,title,amount)
    recebe id sintético estável por linha.
    """
    out: List[dict] = []
    for i, r in enumerate(rows):
        ident = str(r.get("Identificador", "")).strip()
        if not ident:
            ident = f"csv-{i}"
        out.append(
            {
                "Data": str(r.get("Data", "")).strip(),
                "Valor": str(r.get("Valor", "")).strip(),
                "Identificador": ident,
                "Descrição": str(r.get("Descrição", "")).strip(),
            }
        )
    return out


def _excel_cell_str(val) -> str:
    if pd.isna(val):
        return ""
    if hasattr(val, "strftime"):
        try:
            return val.strftime("%Y-%m-%d")
        except (ValueError, OSError):
            return str(val).strip()
    s = str(val).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    return s


def _row_dict_to_statement(
    d: dict,
    category: str,
    origem: str,
    needs_review: bool = False,
    llm_confidence: Optional[float] = None,
) -> StatementRow:
    return StatementRow(
        data=str(d.get("Data", "")),
        valor=str(d.get("Valor", "")),
        identificador=str(d.get("Identificador", "")),
        descricao=str(d.get("Descrição", "")),
        categoria=category,
        origem=origem,
        needs_review=needs_review,
        llm_confidence=llm_confidence,
    )


def parse_csv_bytes(data: bytes) -> List[dict]:
    text = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    fieldmap = {fn: _normalize_header(fn) for fn in reader.fieldnames}
    rows: List[dict] = []
    for raw in reader:
        row = {fieldmap[k]: (v or "").strip() for k, v in raw.items() if k in fieldmap}
        rows.append(row)
    return _coerce_statement_row_dicts(rows)


def parse_excel_bytes(data: bytes, filename: str) -> List[dict]:
    lower = filename.lower()
    bio = io.BytesIO(data)
    if lower.endswith(".xls") and not lower.endswith(".xlsx"):
        engine = "xlrd"
    else:
        engine = "openpyxl"
    df = pd.read_excel(bio, engine=engine, sheet_name=0)
    if df.empty:
        return []
    df.columns = [_normalize_header(str(c)) for c in df.columns]
    required_min = ["Data", "Valor", "Descrição"]
    for col in required_min:
        if col not in df.columns:
            raise ValueError(
                "Faltam colunas obrigatórias: Data, Valor e Descrição "
                "(também aceitos os nomes em inglês: date, amount, title)."
            )
    has_id = "Identificador" in df.columns
    rows: List[dict] = []
    for i, (_, ser) in enumerate(df.iterrows()):
        data_s = _excel_cell_str(ser.get("Data"))
        valor_raw = ser.get("Valor")
        valor_s = "" if pd.isna(valor_raw) else str(valor_raw).strip()
        desc_raw = ser.get("Descrição")
        desc_s = "" if pd.isna(desc_raw) else str(desc_raw).strip()
        if has_id:
            id_raw = ser.get("Identificador")
            ident = "" if pd.isna(id_raw) else str(id_raw).strip()
        else:
            ident = ""
        if not ident:
            ident = f"xlsx-{i}"
        rows.append(
            {
                "Data": data_s,
                "Valor": valor_s,
                "Identificador": ident,
                "Descrição": desc_s,
            }
        )
    return rows


def rows_to_statement_rows(
    conn,
    rows: List[dict],
    origem_label: str,
) -> tuple[List[StatementRow], set[str]]:
    """
    origem_label: ORIGEM_CREDITO ou ORIGEM_DEBITO.
    Pipeline: SQLite (mapeamentos do usuário) → LLM em lote → regras de fallback.
    """
    if origem_label not in (ORIGEM_CREDITO, ORIGEM_DEBITO):
        origem_label = ORIGEM_DEBITO

    allowed_tuple = merged_allowed_categories(conn)
    allowed_set = frozenset(allowed_tuple)

    out: List[StatementRow] = []
    norms_to_llm: list[str] = []
    seen_norm: set[str] = set()

    for d in rows:
        desc = str(d.get("Descrição", ""))
        cat = categorize_sqlite_only(conn, desc, allowed_set)
        out.append(_row_dict_to_statement(d, cat, origem_label))
        if cat == UNCATEGORIZED and desc.strip():
            n = normalize_description(desc)
            if n and n not in seen_norm:
                seen_norm.add(n)
                norms_to_llm.append(n)

    llm_raw = batch_categorize_normalized(norms_to_llm, allowed_tuple)
    llm_applied = apply_llm_categories(llm_raw)

    for row in out:
        if row.categoria != UNCATEGORIZED:
            continue
        n = row.normalized_description()
        if not n or n not in llm_applied:
            continue
        cat, conf, needs = llm_applied[n]
        row.categoria = cat
        row.llm_confidence = conf if conf > 0 else None
        row.needs_review = needs

    for row in out:
        if row.categoria != UNCATEGORIZED:
            continue
        n = row.normalized_description()
        if not n:
            continue
        fixed = match_fallback_rule(n, allowed_set)
        if fixed:
            row.categoria = fixed
            row.llm_confidence = None
            row.needs_review = False

    pending = set()
    for row in out:
        if row.categoria == UNCATEGORIZED and row.descricao.strip():
            pending.add(row.descricao.strip())
        elif row.needs_review and row.descricao.strip():
            pending.add(row.descricao.strip())

    return out, pending


def statement_row_to_public_dict(r: StatementRow) -> dict:
    return {
        "data": r.data,
        "valor": r.valor,
        "identificador": r.identificador,
        "descricao": r.descricao,
        "categoria": r.categoria,
        "origem": r.origem,
        "needs_review": r.needs_review,
        "llm_confidence": r.llm_confidence,
    }


def statement_rows_to_csv_string(rows: List[StatementRow]) -> str:
    buf = io.StringIO()
    fieldnames = ["Data", "Valor", "Identificador", "Descrição", "Categoria", "Origem"]
    w = csv.DictWriter(buf, fieldnames=fieldnames, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow(
            {
                "Data": r.data,
                "Valor": r.valor,
                "Identificador": r.identificador,
                "Descrição": r.descricao,
                "Categoria": r.categoria,
                "Origem": r.origem,
            }
        )
    return buf.getvalue()


def parse_sort_date(data_str: str) -> tuple[int, int, int]:
    """Ordenação best-effort: (ano, mês, dia) ou (0,0,0) se falhar."""
    from datetime import datetime

    s = (data_str or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d"):
        chunk = s[:10] if fmt == "%Y-%m-%d" and len(s) >= 10 else s
        try:
            dt = datetime.strptime(chunk, fmt)
            return (dt.year, dt.month, dt.day)
        except ValueError:
            continue
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return (y, mo, d)
    return (0, 0, 0)


def merged_statement_rows(
    credit_rows: List[StatementRow],
    debit_rows: List[StatementRow],
) -> List[StatementRow]:
    """
    Crédito primeiro, débito a seguir; dentro de cada grupo, por data ascendente.
    """
    credit_sorted = sorted(credit_rows, key=lambda r: parse_sort_date(r.data))
    debit_sorted = sorted(debit_rows, key=lambda r: parse_sort_date(r.data))
    return credit_sorted + debit_sorted
