import type { StatementRowDTO } from './api'
import { ALLOWED_CATEGORIES, UNCATEGORIZED } from './constants'

const ALLOWED = ALLOWED_CATEGORIES as readonly string[]

export function effectiveCategory(
  row: StatementRowDTO,
  key: string,
  overrides: Record<string, string>,
): string {
  const o = overrides[key]?.trim()
  if (o) return o
  return (row.categoria ?? '').trim()
}

/** Linha ainda impede o merge no servidor (sem categoria permitida). */
export function rowBlocksExport(
  row: StatementRowDTO,
  key: string,
  overrides: Record<string, string>,
): boolean {
  const cat = effectiveCategory(row, key, overrides)
  if (!cat || cat === UNCATEGORIZED) return true
  return !ALLOWED.includes(cat)
}

export function countRowsBlockingExport(
  creditRows: StatementRowDTO[],
  debitRows: StatementRowDTO[],
  overrides: Record<string, string>,
): number {
  let n = 0
  creditRows.forEach((r, i) => {
    if (rowBlocksExport(r, `credito:${i}`, overrides)) n += 1
  })
  debitRows.forEach((r, i) => {
    if (rowBlocksExport(r, `debito:${i}`, overrides)) n += 1
  })
  return n
}

export function countBlockingOnSide(
  rows: StatementRowDTO[],
  side: 'credito' | 'debito',
  overrides: Record<string, string>,
): number {
  let n = 0
  rows.forEach((r, i) => {
    if (rowBlocksExport(r, `${side}:${i}`, overrides)) n += 1
  })
  return n
}
