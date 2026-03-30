import type { StatementRowDTO } from './api'
import { parseStatementAmount } from './money'

export type CategoryAggregate = {
  name: string
  linhas: number
  valorTotal: number
}

/** Agrega linhas e soma de valores por categoria (crédito + débito + overrides). */
export function buildCategoryAggregates(
  creditRows: StatementRowDTO[],
  debitRows: StatementRowDTO[],
  overrides: Record<string, string>,
): CategoryAggregate[] {
  const map = new Map<string, { linhas: number; valor: number }>()

  function add(cat: string, valorStr: string) {
    const v = parseStatementAmount(valorStr)
    const prev = map.get(cat) ?? { linhas: 0, valor: 0 }
    map.set(cat, { linhas: prev.linhas + 1, valor: prev.valor + v })
  }

  creditRows.forEach((r, i) => {
    const cat = (overrides[`credito:${i}`] ?? r.categoria).trim() || r.categoria
    add(cat, r.valor)
  })
  debitRows.forEach((r, i) => {
    const cat = (overrides[`debito:${i}`] ?? r.categoria).trim() || r.categoria
    add(cat, r.valor)
  })

  return [...map.entries()]
    .map(([name, { linhas, valor }]) => ({
      name,
      linhas,
      valorTotal: valor,
    }))
    .sort((a, b) => b.linhas - a.linhas)
}

/** Dados para pizza: `value` = número de linhas (Recharts). */
export function aggregatesToPieData(aggregates: CategoryAggregate[]) {
  return aggregates.map((a) => ({
    name: a.name,
    value: a.linhas,
    valorTotal: a.valorTotal,
  }))
}

/** Dados para barras por valor absoluto (torres). */
export function aggregatesToBarData(aggregates: CategoryAggregate[]) {
  return [...aggregates]
    .map((a) => ({
      name: a.name,
      valorTotal: a.valorTotal,
      linhas: a.linhas,
    }))
    .sort((a, b) => Math.abs(b.valorTotal) - Math.abs(a.valorTotal))
}
