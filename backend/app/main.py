import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .categorize import UNCATEGORIZED, normalize_description
from .constants import (
    ALLOWED_CATEGORIES_SET,
    FORM_ORIGEM_CREDITO,
    FORM_ORIGEM_DEBITO,
    ORIGEM_CREDITO,
    ORIGEM_DEBITO,
)
from .db import get_connection, init_schema, list_mappings, upsert_mapping
from .ingest import (
    merged_statement_rows,
    parse_csv_bytes,
    parse_excel_bytes,
    rows_to_statement_rows,
    statement_row_to_public_dict,
    statement_rows_to_csv_string,
    StatementRow,
)

_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI):
    conn = get_connection()
    try:
        init_schema(conn)
    finally:
        conn.close()
    yield


app = FastAPI(title="API de categorização de extratos", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


REQUIRED_COLUMNS = ("Data", "Valor", "Identificador", "Descrição")


def _validate_rows(rows: list[dict]) -> None:
    if not rows:
        return
    for col in REQUIRED_COLUMNS:
        if col not in rows[0]:
            raise ValueError(f"Falta a coluna obrigatória: {col}")


def _suggested_filename(original: str) -> str:
    p = Path(original or "extrato.csv")
    stem = p.stem if p.suffix else str(p)
    return f"{stem}_categorizado.csv"


def _form_origem_to_label(origem: str | None) -> str:
    if origem is None or origem == "":
        return ORIGEM_DEBITO
    o = origem.strip().lower()
    if o == FORM_ORIGEM_CREDITO:
        return ORIGEM_CREDITO
    if o == FORM_ORIGEM_DEBITO:
        return ORIGEM_DEBITO
    raise ValueError("origem precisa ser 'credito' ou 'debito'.")


class MappingIn(BaseModel):
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)


class RowOut(BaseModel):
    data: str = ""
    valor: str = ""
    identificador: str = ""
    descricao: str = ""
    categoria: str = ""
    origem: str = ""
    needs_review: bool = False
    llm_confidence: float | None = None


class ProcessOut(BaseModel):
    csv_content: str
    filename_suggested: str
    stats: dict
    pending_descriptions: list[str]
    rows: list[RowOut]


class MergedRowIn(BaseModel):
    data: str = ""
    valor: str = ""
    identificador: str = ""
    descricao: str = ""
    categoria: str = ""
    origem: str = ""
    needs_review: bool = False
    llm_confidence: float | None = None


class MergedExportIn(BaseModel):
    credit_rows: list[MergedRowIn] = Field(default_factory=list)
    debit_rows: list[MergedRowIn] = Field(default_factory=list)
    overrides: dict[str, str] = Field(default_factory=dict)


class MergedExportOut(BaseModel):
    csv_content: str
    filename_suggested: str


def _merged_row_in_to_statement(r: MergedRowIn) -> StatementRow:
    origem = r.origem.strip() if r.origem else ORIGEM_DEBITO
    if origem not in (ORIGEM_CREDITO, ORIGEM_DEBITO):
        origem = ORIGEM_DEBITO
    return StatementRow(
        data=r.data,
        valor=r.valor,
        identificador=r.identificador,
        descricao=r.descricao,
        categoria=r.categoria,
        origem=origem,
        needs_review=r.needs_review,
        llm_confidence=r.llm_confidence,
    )


def _apply_overrides_and_validate(
    credit: list[StatementRow],
    debit: list[StatementRow],
    overrides: dict[str, str],
) -> tuple[list[StatementRow], list[str]]:
    """Aplica overrides (chaves credito:i / debito:j). Retorna (merged, erros)."""
    errors: list[str] = []

    def apply_list(rows: list[StatementRow], prefix: str) -> None:
        for i, row in enumerate(rows):
            key = f"{prefix}:{i}"
            if key not in overrides:
                continue
            cat = overrides[key].strip()
            if cat not in ALLOWED_CATEGORIES_SET:
                errors.append(f"Override inválido em {key!r}: categoria não permitida.")
            else:
                row.categoria = cat
                row.needs_review = False

    apply_list(credit, "credito")
    apply_list(debit, "debito")

    merged = merged_statement_rows(credit, debit)
    for idx, row in enumerate(merged):
        if row.categoria == UNCATEGORIZED:
            errors.append(
                f"Linha {idx + 1} ({row.origem}): ainda está como '{UNCATEGORIZED}'.",
            )
        elif row.categoria not in ALLOWED_CATEGORIES_SET:
            errors.append(
                f"Linha {idx + 1} ({row.origem}): categoria inválida {row.categoria!r}.",
            )
    return merged, errors


@app.post("/process", response_model=ProcessOut)
async def process_upload(
    file: UploadFile = File(...),
    origem: str | None = Form(None),
) -> ProcessOut:
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="O arquivo excede o limite configurado.")

    name = file.filename or "extrato.csv"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    try:
        origem_label = _form_origem_to_label(origem)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    try:
        if ext == "csv":
            rows = parse_csv_bytes(raw)
        elif ext in ("xlsx", "xls"):
            rows = parse_excel_bytes(raw, name)
        else:
            raise HTTPException(
                status_code=400,
                detail="Formato não suportado. Use .csv, .xlsx ou .xls.",
            )
        _validate_rows(rows)
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV deve estar em UTF-8.") from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler o arquivo: {e}") from e

    conn = get_connection()
    try:
        stmt_rows, pending_set = rows_to_statement_rows(conn, rows, origem_label)
    finally:
        conn.close()

    csv_out = statement_rows_to_csv_string(stmt_rows)
    total = len(stmt_rows)
    categorized = sum(1 for r in stmt_rows if r.categoria != UNCATEGORIZED)
    stats = {
        "total_rows": total,
        "categorized_count": categorized,
        "pending_count": len(pending_set),
    }
    pending_list = sorted(pending_set)
    row_models = [RowOut(**statement_row_to_public_dict(r)) for r in stmt_rows]

    return ProcessOut(
        csv_content=csv_out,
        filename_suggested=_suggested_filename(name),
        stats=stats,
        pending_descriptions=pending_list,
        rows=row_models,
    )


@app.post("/mappings")
def post_mapping(body: MappingIn) -> dict:
    cat = body.category.strip()
    if cat not in ALLOWED_CATEGORIES_SET:
        raise HTTPException(
            status_code=400,
            detail=f"Categoria não permitida. Use uma destas: {sorted(ALLOWED_CATEGORIES_SET)}.",
        )
    conn = get_connection()
    try:
        key = normalize_description(body.description)
        if not key:
            raise HTTPException(status_code=400, detail="Descrição inválida.")
        upsert_mapping(conn, key, cat)
    finally:
        conn.close()
    return {"ok": True}


@app.get("/mappings")
def get_mappings() -> list[dict]:
    conn = get_connection()
    try:
        return list_mappings(conn)
    finally:
        conn.close()


@app.post("/export/merged", response_model=MergedExportOut)
def export_merged(body: MergedExportIn) -> MergedExportOut:
    if not body.credit_rows and not body.debit_rows:
        raise HTTPException(status_code=400, detail="Não há linhas para exportar.")

    for k, v in body.overrides.items():
        if v.strip() not in ALLOWED_CATEGORIES_SET:
            raise HTTPException(
                status_code=400,
                detail=f"Override {k!r}: categoria não permitida.",
            )

    credit = [_merged_row_in_to_statement(r) for r in body.credit_rows]
    debit = [_merged_row_in_to_statement(r) for r in body.debit_rows]

    merged, errors = _apply_overrides_and_validate(credit, debit, body.overrides)
    if errors:
        raise HTTPException(status_code=400, detail={"pendencias": errors})

    csv_out = statement_rows_to_csv_string(merged)
    return MergedExportOut(
        csv_content=csv_out,
        filename_suggested="extrato_compilado.csv",
    )
