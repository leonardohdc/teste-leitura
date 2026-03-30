import type { ProcessResponse, StatementRowDTO } from './api'

const KEY_CREDIT = 'extrato_credit_bundle'
const KEY_DEBIT = 'extrato_debit_bundle'
const KEY_OVERRIDES = 'extrato_category_overrides'

export type SideBundle = {
  filename_suggested: string
  stats: ProcessResponse['stats']
  pending_descriptions: string[]
  rows: StatementRowDTO[]
}

export function saveCreditBundle(bundle: SideBundle): void {
  sessionStorage.setItem(KEY_CREDIT, JSON.stringify(bundle))
}

export function saveDebitBundle(bundle: SideBundle): void {
  sessionStorage.setItem(KEY_DEBIT, JSON.stringify(bundle))
}

export function loadCreditBundle(): SideBundle | null {
  try {
    const raw = sessionStorage.getItem(KEY_CREDIT)
    if (!raw) return null
    return JSON.parse(raw) as SideBundle
  } catch {
    return null
  }
}

export function loadDebitBundle(): SideBundle | null {
  try {
    const raw = sessionStorage.getItem(KEY_DEBIT)
    if (!raw) return null
    return JSON.parse(raw) as SideBundle
  } catch {
    return null
  }
}

export function saveOverrides(overrides: Record<string, string>): void {
  sessionStorage.setItem(KEY_OVERRIDES, JSON.stringify(overrides))
}

export function loadOverrides(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(KEY_OVERRIDES)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      )
    }
    return {}
  } catch {
    return {}
  }
}

export function setOverrideKey(key: string, category: string): void {
  const o = loadOverrides()
  o[key] = category
  saveOverrides(o)
}

/** Remove crédito, débito e overrides salvos na aba (sessionStorage). */
export function clearExtratoSession(): void {
  sessionStorage.removeItem(KEY_CREDIT)
  sessionStorage.removeItem(KEY_DEBIT)
  sessionStorage.removeItem(KEY_OVERRIDES)
}
