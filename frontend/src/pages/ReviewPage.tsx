import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { postMergedExport } from '../api'
import { ALLOWED_CATEGORIES, UNCATEGORIZED } from '../constants'
import { countRowsBlockingExport } from '../exportReadiness'
import {
  loadCreditBundle,
  loadDebitBundle,
  loadOverrides,
  saveOverrides,
} from '../storage'

type ReviewLine = {
  key: string
  origemLabel: 'credito' | 'debito'
  index: number
  descricao: string
  categoriaAtual: string
  data: string
  valor: string
}

function buildReviewLines(): ReviewLine[] {
  const credit = loadCreditBundle()
  const debit = loadDebitBundle()
  const out: ReviewLine[] = []
  credit?.rows.forEach((r, index) => {
    if (r.needs_review || r.categoria === UNCATEGORIZED) {
      out.push({
        key: `credito:${index}`,
        origemLabel: 'credito',
        index,
        descricao: r.descricao,
        categoriaAtual: r.categoria,
        data: r.data,
        valor: r.valor,
      })
    }
  })
  debit?.rows.forEach((r, index) => {
    if (r.needs_review || r.categoria === UNCATEGORIZED) {
      out.push({
        key: `debito:${index}`,
        origemLabel: 'debito',
        index,
        descricao: r.descricao,
        categoriaAtual: r.categoria,
        data: r.data,
        valor: r.valor,
      })
    }
  })
  return out
}

export default function ReviewPage() {
  const [lines, setLines] = useState<ReviewLine[]>([])
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, bump] = useState(0)

  useEffect(() => {
    setLines(buildReviewLines())
  }, [])

  function selectedForKey(key: string): string {
    const overrides = loadOverrides()
    if (overrides[key]) return overrides[key]
    const line = lines.find((l) => l.key === key)
    if (!line) return ''
    if (
      line.categoriaAtual !== UNCATEGORIZED &&
      (ALLOWED_CATEGORIES as readonly string[]).includes(line.categoriaAtual)
    ) {
      return line.categoriaAtual
    }
    return ''
  }

  function onSelectChange(key: string, value: string) {
    const next = { ...loadOverrides() }
    if (value) next[key] = value
    else delete next[key]
    saveOverrides(next)
    bump((n) => n + 1)
  }

  const credit = loadCreditBundle()
  const debit = loadDebitBundle()
  const overridesForExport = loadOverrides()
  const blockingExport = countRowsBlockingExport(
    credit?.rows ?? [],
    debit?.rows ?? [],
    overridesForExport,
  )
  const isBusyReview = merging
  const canDownloadReview =
    !!credit?.rows?.length && !!debit?.rows?.length && blockingExport === 0 && !isBusyReview

  let downloadReviewTitle = ''
  if (merging) downloadReviewTitle = 'Gerando o arquivo…'
  else if (blockingExport > 0)
    downloadReviewTitle = `Selecione uma categoria permitida nas ${blockingExport} linha(s) listada(s) antes de baixar.`

  async function downloadMerged() {
    if (!credit?.rows?.length || !debit?.rows?.length) return
    setError(null)
    setMerging(true)
    try {
      const o = loadOverrides()
      const out = await postMergedExport(credit.rows, debit.rows, o)
      const blob = new Blob([`\uFEFF${out.csv_content}`], {
        type: 'text/csv;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = out.filename_suggested
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao baixar o arquivo')
    } finally {
      setMerging(false)
    }
  }

  const canMerge = !!credit?.rows?.length && !!debit?.rows?.length

  const pendingCreditOnly =
    lines.length > 0 && lines.every((l) => l.origemLabel === 'credito')
  const pendingDebitOnly =
    lines.length > 0 && lines.every((l) => l.origemLabel === 'debito')

  return (
    <div className="page">
      <h1>Revisão de categorias</h1>
      {!credit && !debit && (
        <p className="msg">
          Ainda não há extratos na sessão. <Link to="/">Processar na página inicial</Link>.
        </p>
      )}

      {lines.length === 0 && canMerge && (
        <p className="msg ok">Nenhuma linha pendente de revisão nesta sessão.</p>
      )}

      {lines.length > 0 && (
        <>
          {pendingCreditOnly && (
            <p className="muted">
              Só há pendências no extrato de <strong>crédito</strong> salvo na sessão (último
              envio nesse botão). Se o débito já estiver atualizado, envie de novo o mesmo CSV em
              &quot;Extrato crédito&quot; para aplicar as regras atuais sem preencher manualmente.
            </p>
          )}
          {pendingDebitOnly && (
            <p className="muted">
              Só há pendências no extrato de <strong>débito</strong> salvo na sessão. Envie de novo o
              arquivo em &quot;Extrato débito&quot; se quiser recalcular no servidor.
            </p>
          )}
          <p className="lead">
            Escolha uma das {ALLOWED_CATEGORIES.length} categorias permitidas para cada linha. As
            escolhas são enviadas como ajustes (overrides) no CSV compilado.
          </p>
          <ul className="pending-list">
            {lines.map((line) => (
              <li key={line.key} className="pending-item">
                <p className="desc-text">
                  <span className="muted">{line.data}</span> · {line.valor} ·{' '}
                  <strong>{line.origemLabel === 'credito' ? 'Crédito' : 'Débito'}</strong>
                </p>
                <p className="desc-text">{line.descricao}</p>
                <div className="row">
                  <select
                    className="cat-input"
                    aria-label={`Categoria para ${line.descricao.slice(0, 40)}`}
                    value={selectedForKey(line.key)}
                    onChange={(e) => onSelectChange(line.key, e.target.value)}
                  >
                    <option value="">— selecione —</option>
                    {ALLOWED_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}

      {canMerge && blockingExport > 0 && (
        <div className="review-required-banner" role="alert" style={{ marginTop: '1rem' }}>
          <span className="review-required-icon" aria-hidden>
            !
          </span>
          <div>
            <strong>Termine a revisão</strong>
            <p>
              {lines.length > 0 ? (
                <>
                  Faltam categorias em {blockingExport} linha(s) no total do extrato. Preencha os
                  campos acima para liberar o download.
                </>
              ) : (
                <>
                  Ainda há {blockingExport} linha(s) sem categoria permitida. Volte ao{' '}
                  <Link to="/">início</Link> e use a revisão se necessário.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {canMerge && (
        <div className="actions download-actions" style={{ marginTop: '1rem' }}>
          <span
            className="download-btn-wrap"
            title={!canDownloadReview ? downloadReviewTitle : undefined}
          >
            <button
              type="button"
              className="btn primary"
              disabled={!canDownloadReview}
              onClick={downloadMerged}
            >
              {merging ? 'Gerando…' : 'Baixar CSV compilado'}
            </button>
          </span>
          {blockingExport > 0 && !merging && (
            <span className="hint download-blocked-hint">
              Passe o mouse sobre o botão para ver o que falta.
            </span>
          )}
        </div>
      )}

      <p style={{ marginTop: '1.5rem' }}>
        <Link to="/">← Voltar ao upload</Link>
      </p>
    </div>
  )
}
