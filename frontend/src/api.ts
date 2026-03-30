import { ALLOWED_CATEGORIES } from './constants'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type StatementRowDTO = {
  data: string
  valor: string
  identificador: string
  descricao: string
  categoria: string
  origem: string
  needs_review: boolean
  llm_confidence: number | null
}

export type ProcessResponse = {
  csv_content: string
  filename_suggested: string
  stats: {
    total_rows: number
    categorized_count: number
    pending_count: number
  }
  pending_descriptions: string[]
  rows: StatementRowDTO[]
}

export type MappingRow = {
  normalized_description: string
  category: string
  created_at: string | null
}

export type MergedExportResponse = {
  csv_content: string
  filename_suggested: string
}

function parseErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  if (detail && typeof detail === 'object' && 'pendencias' in detail) {
    const p = (detail as { pendencias: string[] }).pendencias
    if (Array.isArray(p)) return p.join('\n')
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: string }).message)
  }
  return 'A solicitação falhou'
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json()
    return parseErrorDetail(j.detail ?? j)
  } catch {
    return res.statusText || 'Erro desconhecido'
  }
}

export type OrigemForm = 'credito' | 'debito'

export async function postProcess(file: File, origem: OrigemForm): Promise<ProcessResponse> {
  const body = new FormData()
  body.append('file', file)
  body.append('origem', origem)
  const res = await fetch(`${API_BASE}/process`, { method: 'POST', body })
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<ProcessResponse>
}

export async function postMergedExport(
  creditRows: StatementRowDTO[],
  debitRows: StatementRowDTO[],
  overrides: Record<string, string>,
): Promise<MergedExportResponse> {
  const res = await fetch(`${API_BASE}/export/merged`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credit_rows: creditRows,
      debit_rows: debitRows,
      overrides,
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<MergedExportResponse>
}

export async function postMapping(description: string, category: string): Promise<void> {
  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error('Categoria inválida para o servidor.')
  }
  const res = await fetch(`${API_BASE}/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, category }),
  })
  if (!res.ok) throw new Error(await readError(res))
}

export async function getMappings(): Promise<MappingRow[]> {
  const res = await fetch(`${API_BASE}/mappings`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<MappingRow[]>
}
