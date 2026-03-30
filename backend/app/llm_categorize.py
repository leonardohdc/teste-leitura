"""Classificação em lote via OpenAI (descrições normalizadas)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from .constants import ALLOWED_CATEGORIES, ALLOWED_CATEGORIES_SET
from .categorize import UNCATEGORIZED, normalize_description

logger = logging.getLogger(__name__)


def _confidence_min() -> float:
    raw = os.getenv("LLM_CONFIDENCE_MIN", "0.7")
    try:
        return max(0.0, min(1.0, float(raw)))
    except ValueError:
        return 0.7


def _parse_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and "items" in payload:
        raw = payload["items"]
    elif isinstance(payload, list):
        raw = payload
    else:
        return []
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for x in raw:
        if isinstance(x, dict):
            out.append(x)
    return out


def _validate_item(
    item: dict[str, Any],
    expected_norm: str,
) -> tuple[str | None, float]:
    """Retorna (categoria permitida ou None, confidence)."""
    nd = item.get("normalized_description")
    if not isinstance(nd, str) or normalize_description(nd) != expected_norm:
        return None, 0.0
    conf_raw = item.get("confidence", 0.0)
    try:
        confidence = float(conf_raw)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))
    cat = item.get("category")
    if cat is None:
        return None, confidence
    if not isinstance(cat, str):
        return None, confidence
    cat_stripped = cat.strip()
    if cat_stripped not in ALLOWED_CATEGORIES_SET:
        return None, confidence
    return cat_stripped, confidence


def batch_categorize_normalized(
    normalized_unique: list[str],
) -> dict[str, tuple[str | None, float]]:
    """
    Para cada descrição normalizada única, retorna (categoria ou None, confidence).
    Se não houver API key ou falhar a requisição, retorna dict vazio.
    """
    if not normalized_unique:
        return {}

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return {}

    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()

    try:
        from openai import OpenAI
    except ImportError:
        logger.warning("openai SDK não instalado; a ignorar LLM.")
        return {}

    allowed_json = json.dumps(list(ALLOWED_CATEGORIES), ensure_ascii=False)
    lines_block = "\n".join(f"- {n}" for n in normalized_unique)

    system = (
        "Classifique descrições de movimentos bancários. "
        "Responda APENAS com JSON válido, sem markdown. "
        f'Formato: {{"items":[{{"normalized_description":"<exata>","category":"<uma das permitidas ou null>","confidence":0.0-1.0}}]}}. '
        f"Categorias permitidas (exatas): {allowed_json}. "
        "Se não tiver certeza, use category null e confidence baixa. "
        "normalized_description na resposta deve coincidir exatamente com uma das entradas solicitadas."
    )
    user = f"Classifique cada uma destas descrições normalizadas (uma linha = uma entrada):\n{lines_block}"

    client = OpenAI(api_key=api_key)
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.warning("Pedido OpenAI falhou: %s", e)
        return {}

    content = (completion.choices[0].message.content or "").strip()
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Resposta LLM não é JSON válido.")
        return {}

    items = _parse_items(payload)
    by_norm: dict[str, tuple[str | None, float]] = {}
    for norm in normalized_unique:
        by_norm[norm] = (None, 0.0)

    for item in items:
        nd = item.get("normalized_description")
        if not isinstance(nd, str):
            continue
        key = normalize_description(nd)
        if key not in by_norm:
            continue
        cat, conf = _validate_item(item, key)
        by_norm[key] = (cat, conf)

    return by_norm


def apply_llm_categories(
    normalized_to_result: dict[str, tuple[str | None, float]],
    min_confidence: float | None = None,
) -> dict[str, tuple[str, float, bool]]:
    """
    A partir dos resultados LLM, retorna por normalizado:
    (categoria final ou UNCATEGORIZED, confidence, needs_review).
    """
    if min_confidence is None:
        min_confidence = _confidence_min()
    out: dict[str, tuple[str, float, bool]] = {}
    for norm, (cat, conf) in normalized_to_result.items():
        if cat is not None and conf >= min_confidence:
            out[norm] = (cat, conf, False)
        elif cat is not None:
            out[norm] = (UNCATEGORIZED, conf, True)
        else:
            out[norm] = (UNCATEGORIZED, conf, True)
    return out
