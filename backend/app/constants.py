"""Categorias permitidas (única fonte de verdade no backend)."""

# Exatamente estas strings (capitalização conforme pedido para o CSV).
ALLOWED_CATEGORIES: tuple[str, ...] = (
    "Jogos virtuais",
    "padaria",
    "mercado",
    "transferências pessoais",
    "livros",
    "credito",
    "investimentos",
)

ALLOWED_CATEGORIES_SET = frozenset(ALLOWED_CATEGORIES)

ORIGEM_CREDITO = "Crédito"
ORIGEM_DEBITO = "Débito"

FORM_ORIGEM_CREDITO = "credito"
FORM_ORIGEM_DEBITO = "debito"
