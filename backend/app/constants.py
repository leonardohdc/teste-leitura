"""Categorias padrão (sempre disponíveis). Extras ficam em SQLite (`user_categories`)."""

# Strings exatas; ordem aqui não importa — a lista final é ordenada alfabeticamente ao servir.
DEFAULT_ALLOWED_CATEGORIES: tuple[str, ...] = (
    "carro/mecanico",
    "credito",
    "investimentos",
    "Jogos virtuais",
    "livros",
    "mercado",
    "outros",
    "padaria",
    "petshop/animais",
    "posto de gasolina",
    "transferências pessoais",
)

ORIGEM_CREDITO = "Crédito"
ORIGEM_DEBITO = "Débito"

FORM_ORIGEM_CREDITO = "credito"
FORM_ORIGEM_DEBITO = "debito"
