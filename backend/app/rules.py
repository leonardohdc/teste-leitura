"""Regras fixas: apenas as categorias permitidas (extratos Nubank e similares)."""

from typing import Callable, Optional, Tuple

from .constants import ALLOWED_CATEGORIES_SET

Rule = Tuple[str, Callable[[str], bool]]


def _contains(sub: str) -> Callable[[str], bool]:
    sub_l = sub.lower()

    def check(text: str) -> bool:
        return sub_l in text.lower()

    return check


# Ordem importa: primeira regra que casa vence. Todas as categorias ∈ ALLOWED_CATEGORIES_SET.
FIXED_RULES: list[tuple[str, Rule]] = [
    # credito (ex.: fatura do cartão, crédito em conta)
    ("credito", ("pagamento de fatura", _contains("pagamento de fatura"))),
    ("credito", ("fatura cartao", _contains("fatura cart"))),
    ("credito", ("credito em conta", _contains("credito em conta"))),
    # investimentos (ex.: aplicação / devolução em produtos Nu ou similares)
    ("investimentos", ("aplicacao em investimento", _contains("aplicacao em investimento"))),
    # mercado
    ("mercado", ("ifood", _contains("ifood"))),
    ("mercado", ("supermercado", _contains("supermercado"))),
    ("mercado", ("atacad", _contains("atacad"))),
    ("mercado", ("carrefour", _contains("carrefour"))),
    ("mercado", ("extra ", _contains("extra "))),
    ("mercado", ("nupay", _contains("nupay"))),
    ("mercado", ("compra no debito", _contains("compra no debito"))),
    # posto de combustível (título sem prefixo "Compra no débito", ex.: extrato de crédito)
    ("mercado", ("auto posto", _contains("auto posto"))),
    ("mercado", ("farmacia", _contains("farmacia"))),
    ("mercado", ("drogaria", _contains("drogaria"))),
    # padaria
    ("padaria", ("padaria", _contains("padaria"))),
    ("padaria", ("pao ", _contains("pao"))),
    ("padaria", ("pao queijo", _contains("pao queijo"))),
    ("padaria", ("coffee", _contains("coffee"))),
    # Jogos virtuais
    ("Jogos virtuais", ("steam", _contains("steam"))),
    ("Jogos virtuais", ("playstation", _contains("playstation"))),
    ("Jogos virtuais", ("psn", _contains("psn"))),
    ("Jogos virtuais", ("xbox", _contains("xbox"))),
    ("Jogos virtuais", ("epic games", _contains("epic games"))),
    ("Jogos virtuais", ("riot", _contains("riot"))),
    ("Jogos virtuais", ("nintendo", _contains("nintendo"))),
    # transferências pessoais (PIX / transferências entre pessoas)
    ("transferências pessoais", ("pix recebida", _contains("transferencia recebida pelo pix"))),
    ("transferências pessoais", ("pix recebida 2", _contains("transferencia recebida -"))),
    ("transferências pessoais", ("pix enviada", _contains("transferencia enviada pelo pix"))),
    ("transferências pessoais", ("pix qrcode", _contains("pix qrcode"))),
    ("transferências pessoais", ("envio pix", _contains("envio pix"))),
    ("transferências pessoais", ("recebimento pix", _contains("recebimento pix"))),
    # livros / educação próxima de livraria
    ("livros", ("livraria", _contains("livraria"))),
    ("livros", ("amazon livro", _contains("amazon liv"))),
    ("livros", ("kindle", _contains("kindle"))),
    ("livros", ("sebo", _contains("sebo"))),
]


def match_fixed_rule(normalized_text: str) -> Optional[str]:
    """Retorna categoria permitida se alguma regra fixa casar; senão None."""
    for category, (_name, predicate) in FIXED_RULES:
        if category not in ALLOWED_CATEGORIES_SET:
            continue
        if predicate(normalized_text):
            return category
    return None
