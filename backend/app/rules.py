"""Regras de fallback depois da LLM (sem chave, falha da API ou descrição sem resposta útil)."""

from typing import Callable, Optional, Tuple

Rule = Tuple[str, Callable[[str], bool]]


def _contains(sub: str) -> Callable[[str], bool]:
    sub_l = sub.lower()

    def check(text: str) -> bool:
        return sub_l in text.lower()

    return check


# Ordem importa. Usadas só após SQLite + LLM no fluxo principal.
FALLBACK_RULES: list[tuple[str, Rule]] = [
    # credito
    ("credito", ("pagamento de fatura", _contains("pagamento de fatura"))),
    ("credito", ("fatura cartao", _contains("fatura cart"))),
    ("credito", ("credito em conta", _contains("credito em conta"))),
    # investimentos
    ("investimentos", ("aplicacao em investimento", _contains("aplicacao em investimento"))),
    # posto de gasolina (antes de mercado genérico)
    ("posto de gasolina", ("auto posto", _contains("auto posto"))),
    ("posto de gasolina", ("posto shell", _contains("posto shell"))),
    ("posto de gasolina", ("posto ipiranga", _contains("posto ipiranga"))),
    ("posto de gasolina", ("posto br", _contains("posto br"))),
    ("posto de gasolina", ("combustivel", _contains("combustivel"))),
    # petshop / animais
    ("petshop/animais", ("petlove", _contains("petlove"))),
    ("petshop/animais", ("petz", _contains("petz"))),
    ("petshop/animais", ("cobasi", _contains("cobasi"))),
    ("petshop/animais", ("veterin", _contains("veterin"))),
    ("petshop/animais", ("pet shop", _contains("pet shop"))),
    ("petshop/animais", ("petshop", _contains("petshop"))),
    ("petshop/animais", ("pet saud", _contains("pet saud"))),
    # carro / mecânico
    ("carro/mecanico", ("oficina", _contains("oficina"))),
    ("carro/mecanico", ("mecanica", _contains("mecanica"))),
    ("carro/mecanico", ("mecanico", _contains("mecanico"))),
    ("carro/mecanico", ("auto center", _contains("auto center"))),
    ("carro/mecanico", ("troca de oleo", _contains("troca de oleo"))),
    ("carro/mecanico", ("troca oleo", _contains("troca oleo"))),
    ("carro/mecanico", ("pneu", _contains("pneu"))),
    ("carro/mecanico", ("borracharia", _contains("borracharia"))),
    # mercado
    ("mercado", ("ifood", _contains("ifood"))),
    ("mercado", ("supermercado", _contains("supermercado"))),
    ("mercado", ("atacad", _contains("atacad"))),
    ("mercado", ("carrefour", _contains("carrefour"))),
    ("mercado", ("extra ", _contains("extra "))),
    ("mercado", ("nupay", _contains("nupay"))),
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
    # transferências pessoais
    ("transferências pessoais", ("pix recebida", _contains("transferencia recebida pelo pix"))),
    ("transferências pessoais", ("pix recebida 2", _contains("transferencia recebida -"))),
    ("transferências pessoais", ("pix enviada", _contains("transferencia enviada pelo pix"))),
    ("transferências pessoais", ("pix qrcode", _contains("pix qrcode"))),
    ("transferências pessoais", ("envio pix", _contains("envio pix"))),
    ("transferências pessoais", ("recebimento pix", _contains("recebimento pix"))),
    # livros
    ("livros", ("livraria", _contains("livraria"))),
    ("livros", ("amazon livro", _contains("amazon liv"))),
    ("livros", ("kindle", _contains("kindle"))),
    ("livros", ("sebo", _contains("sebo"))),
]


def match_fallback_rule(
    normalized_text: str,
    allowed_set: frozenset[str],
) -> Optional[str]:
    """Retorna categoria permitida se alguma regra de fallback casar; senão None."""
    for category, (_name, predicate) in FALLBACK_RULES:
        if category not in allowed_set:
            continue
        if predicate(normalized_text):
            return category
    return None
