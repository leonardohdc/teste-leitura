/** Interpreta Valor vindo de CSV (pt-BR, en-US, Nubank, etc.). */
export function parseStatementAmount(raw: string): number {
  let t = (raw ?? '').trim()
  if (!t) return 0
  t = t.replace(/\u00a0/g, ' ').replace(/R\$/gi, '').replace(/\s/g, '')
  if (!t) return 0

  const sign = t.startsWith('-') ? -1 : 1
  if (t.startsWith('-')) t = t.slice(1)
  t = t.replace(/^\+/, '')

  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  let normalized = t

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? t.replace(/\./g, '').replace(',', '.')
        : t.replace(/,/g, '')
  } else if (lastComma >= 0) {
    const dec = t.slice(lastComma + 1)
    normalized = /^\d{1,2}$/.test(dec)
      ? t.slice(0, lastComma).replace(/\./g, '') + '.' + dec
      : t.replace(/,/g, '')
  } else if (lastDot >= 0) {
    const firstDot = t.indexOf('.')
    if (firstDot === lastDot && /^\d+\.\d+$/.test(t)) {
      normalized = t
    } else {
      normalized = t.replace(/\./g, '')
    }
  }

  const n = parseFloat(normalized)
  if (Number.isNaN(n)) return 0
  return sign * Math.abs(n)
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
