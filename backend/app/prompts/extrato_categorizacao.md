# Instruções para classificação de linhas de extrato

Você recebe **descrições já normalizadas**: minúsculas, **sem acentos**, espaços colapsados. Muitas começam com `compra no debito - ` ou `compra no credito - ` seguido do **nome do estabelecimento**.

## Obrigatório: campo `normalized_description` no JSON

- Cada item da lista do usuário é uma **string exata** (ex.: `compra no debito - mercado ideal`).
- No JSON, **`normalized_description` tem de ser a mesma string que a linha da lista** (copie e cole mentalmente a linha inteira). **Não** devolva só o nome do estabelecimento sem o prefixo — isso quebra o pareamento.
- O `category` deve ser **uma** das strings permitidas no JSON do sistema, com **capitalização idêntica** (ex.: `petshop/animais`, `Jogos virtuais`).

## Como decidir a categoria

1. **Ignore o prefixo** `compra no debito`, `compra no credito`, `compra no debito via nupay`, etc., **para interpretar** o negócio — mas **mantenha a linha completa** no campo `normalized_description`.
2. **Foque no texto depois do último ` - `** (nome do estabelecimento / serviço).
3. Use **palavras-chave** e o **tipo** de negócio (tabela abaixo). Quando encaixar, use **`confidence` entre 0,88 e 0,97** — estes casos são rotineiros em extratos BR, não são “chute”.

## Padrões fortes (Brasil) — alta confiança

| Sinais no nome (após o hífen) | Categoria |
|------------------------------|-----------|
| `estacionamento`, `parking` | `outros` |
| `shopp`, `plaza shopp`, shopping genérico (não supermercado) | `outros` |
| `mercado ` no nome, `superdia`, `atacado`, nomes de rede tipo `taruma` (supermercado) | `mercado` |
| `vet`, `veter`, `hospital` + contexto animal, `rei dos animais`, `aupetmia`, `pet` no nome | `petshop/animais` |
| `farma` ligada à mesma rede que clínica vet (ex.: `nivo farma` com `hospital vet nivo` no extrato) | `petshop/animais` |
| `cafe`, padaria típica, `doces`, `familia` + nome de padaria/lanchonete | `padaria` |
| `uber`, corrida app (`*trip`, `help.u`) | `outros` |
| Cinema, streaming de bilhete, locação genérica | `outros` |

## Tabela de referência — linhas como aparecem no extrato normalizado

Use estas correspondências quando a linha da lista **coincidir** (ou for igual após a mesma normalização):

| Linha normalizada típica (exemplo) | `category` |
|------------------------------------|------------|
| `compra no debito - estacionamento jockey` | `outros` |
| `compra no debito - taruma` | `mercado` |
| `compra no debito - hospital vet nivo auff` | `petshop/animais` |
| `compra no debito - nivo farma ltda` | `petshop/animais` |
| `compra no debito - joc jockey plaza shopp` | `outros` |
| `compra no debito - jc cafe` | `padaria` |
| `compra no debito - familia kituti` | `padaria` |
| `compra no debito - uber uber *trip help.u` | `outros` |
| `compra no debito - mercado ideal` | `mercado` |
| `compra no debito - aupetmia ltda` | `petshop/animais` |
| `compra no debito - jim.com* divino doces` | `padaria` |
| `compra no debito - rei dos animais` | `petshop/animais` |
| `compra no debito - superdia taruma` | `mercado` |

Outros exemplos úteis:

| Trecho relevante | `category` |
|------------------|------------|
| Nuuvem, jogos digitais | `Jogos virtuais` |
| Cinepolis, cinema | `outros` |
| Ednovacultura, livros | `livros` |
| Pagamento recebido, pix entre pessoas | `transferências pessoais` |

## Quando usar `null`

Use **`category`: `null`** só quando:

- o texto for vazio, só números/códigos sem nome, ou ilegível; ou
- for **impossível** inferir tipo de gasto (sem palavra-chave nem contexto).

**Não** use `null` para linhas como as da tabela de referência acima — elas têm padrão claro.

## Lista de categorias válidas

**Não há lista fixa neste ficheiro.** As categorias em que pode classificar são **só** as que aparecem no **array JSON** nas “Regras técnicas” da mesma mensagem do sistema (inclui categorias padrão e **quaisquer categorias extra** criadas pelo usuário na aplicação). O valor de `category` tem de ser **uma dessas strings, caractere a caractere** (maiúsculas/minúsculas incluídas).

Para categorias novas que não estão nos exemplos abaixo, use a mesma lógica: encaixe pelo **significado** do estabelecimento e escolha a etiqueta da lista JSON que melhor descreve o gasto.

## Confiança

- Padrões da tabela de referência / palavras-chave: **`confidence` 0,88–0,97**.
- Caso limítrofe entre duas categorias: escolha a mais provável com **`confidence` 0,70–0,82**, ou `null` se realmente não der.
- Evite `confidence` muito baixo com categoria preenchida — prefira `null` se for pura dúvida.

## Formato de saída

Responda **somente** com o JSON acordado (`items` com `normalized_description`, `category`, `confidence`). **`normalized_description` = linha exata da lista do usuário.**
