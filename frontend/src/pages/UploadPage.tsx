import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type StatementRowDTO, postMergedExport, postProcess } from '../api'
import CategoryPieChart from '../components/CategoryPieChart'
import { UNCATEGORIZED } from '../constants'
import {
  countBlockingOnSide,
  countRowsBlockingExport,
} from '../exportReadiness'
import { useAllowedCategories } from '../hooks/useAllowedCategories'
import type { SideBundle } from '../storage'
import {
  clearExtratoSession,
  loadCreditBundle,
  loadDebitBundle,
  loadOverrides,
  saveCreditBundle,
  saveDebitBundle,
} from '../storage'

type Side = 'credito' | 'debito'

const EMPTY_ROWS: StatementRowDTO[] = []

export default function UploadPage() {
  const { categories } = useAllowedCategories()
  const [loadingCredit, setLoadingCredit] = useState(false)
  const [loadingDebit, setLoadingDebit] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditMsg, setCreditMsg] = useState<string | null>(null)
  const [debitMsg, setDebitMsg] = useState<string | null>(null)

  const [creditBundle, setCreditBundle] = useState<SideBundle | null>(() => loadCreditBundle())
  const [debitBundle, setDebitBundle] = useState<SideBundle | null>(() => loadDebitBundle())

  const creditCount = creditBundle?.rows?.length ?? 0
  const debitCount = debitBundle?.rows?.length ?? 0
  const mergeTotal = creditCount + debitCount
  const creditRows = creditBundle?.rows ?? EMPTY_ROWS
  const debitRows = debitBundle?.rows ?? EMPTY_ROWS
  const showWorkspace =
    creditCount > 0 || debitCount > 0 || !!creditMsg || !!debitMsg

  function clearSession() {
    if (
      !window.confirm(
        'Limpar os extratos salvos nesta aba? Isso remove crédito, débito e categorias escolhidas na revisão (overrides).',
      )
    ) {
      return
    }
    clearExtratoSession()
    setCreditBundle(null)
    setDebitBundle(null)
    setCreditMsg(null)
    setDebitMsg(null)
    setError(null)
  }

  async function onFile(side: Side, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (side === 'credito') {
      setCreditMsg(null)
      setLoadingCredit(true)
    } else {
      setDebitMsg(null)
      setLoadingDebit(true)
    }
    try {
      const data = await postProcess(file, side)
      const bundle: SideBundle = {
        filename_suggested: data.filename_suggested,
        stats: data.stats,
        pending_descriptions: data.pending_descriptions,
        rows: data.rows,
      }
      if (side === 'credito') {
        saveCreditBundle(bundle)
        setCreditBundle(bundle)
        setCreditMsg(
          `${data.stats.categorized_count}/${data.stats.total_rows} linhas categorizadas; ${data.stats.pending_count} com sugestão de revisão.`,
        )
      } else {
        saveDebitBundle(bundle)
        setDebitBundle(bundle)
        setDebitMsg(
          `${data.stats.categorized_count}/${data.stats.total_rows} linhas categorizadas; ${data.stats.pending_count} com sugestão de revisão.`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar')
    } finally {
      if (side === 'credito') setLoadingCredit(false)
      else setLoadingDebit(false)
    }
  }

  const canMerge =
    creditCount > 0 &&
    debitCount > 0 &&
    !loadingCredit &&
    !loadingDebit

  async function downloadMerged() {
    const c = loadCreditBundle()
    const d = loadDebitBundle()
    if (!c?.rows?.length || !d?.rows?.length) return
    setError(null)
    setMerging(true)
    try {
      const overrides = loadOverrides()
      const out = await postMergedExport(c.rows, d.rows, overrides)
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

  const rowNeedsReview = (r: { needs_review: boolean; categoria: string }) =>
    r.needs_review || r.categoria === UNCATEGORIZED

  const overrides = loadOverrides()
  const creditBlocking = countBlockingOnSide(creditRows, 'credito', overrides, categories)
  const debitBlocking = countBlockingOnSide(debitRows, 'debito', overrides, categories)
  const blockingTotal = countRowsBlockingExport(creditRows, debitRows, overrides, categories)
  const anyBlocking = blockingTotal > 0

  const creditSuggested =
    creditBundle?.rows.filter(rowNeedsReview).length ?? 0
  const debitSuggested =
    debitBundle?.rows.filter(rowNeedsReview).length ?? 0

  const isBusy = loadingCredit || loadingDebit || merging
  const canDownload = canMerge && blockingTotal === 0 && !isBusy

  let downloadBlockedTitle = ''
  if (merging) downloadBlockedTitle = 'Gerando o arquivo…'
  else if (loadingCredit || loadingDebit)
    downloadBlockedTitle = 'Aguarde o processamento do extrato terminar.'
  else if (!canMerge)
    downloadBlockedTitle =
      'Envie e processe os extratos de crédito e de débito para habilitar o download.'
  else if (blockingTotal > 0)
    downloadBlockedTitle = `Conclua a revisão: ${blockingTotal} linha(s) ainda sem categoria permitida. Abra Revisão e selecione as categorias.`

  return (
    <div className="page">
      <h1>Extrato bancário</h1>
      <p className="lead">
        Envie o extrato de <strong>crédito</strong> e o de <strong>débito</strong> (CSV ou Excel).
        O servidor classifica com regras, base local e, opcionalmente, OpenAI. O{' '}
        <strong>CSV compilado</strong> junta as linhas do último crédito processado com as do
        último débito — ficam <strong>salvos nesta aba do navegador</strong> até você substituir ou
        limpar. Enviar só um arquivo <strong>não apaga</strong> o outro lado.
      </p>

      <div className="dual-upload">
        <label className={`file-label ${isBusy ? 'file-label-disabled' : ''}`}>
          <span className="btn primary">
            {loadingCredit ? 'Processando crédito…' : 'Extrato crédito'}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={isBusy}
            onChange={(e) => onFile('credito', e)}
            hidden
          />
        </label>
        <label className={`file-label ${isBusy ? 'file-label-disabled' : ''}`}>
          <span className="btn primary">
            {loadingDebit ? 'Processando débito…' : 'Extrato débito'}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={isBusy}
            onChange={(e) => onFile('debito', e)}
            hidden
          />
        </label>
      </div>

      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}

      {showWorkspace && (
        <div className="panel session-panel">
          <h2 className="session-heading">Salvo nesta aba</h2>
          <p className="muted session-explainer">
            Cada botão substitui apenas o seu lado. O arquivo baixado no final usa <strong>ambos</strong>{' '}
            os blocos abaixo, então o número de linhas é a soma dos dois.
          </p>
          <ul className="session-list">
            <li>
              <strong>Crédito:</strong>{' '}
              {creditCount > 0
                ? `${creditCount} linha(s) · ${creditBundle?.filename_suggested ?? ''}`
                : 'ainda não enviado nesta sessão'}
              {creditCount > 0 && creditBlocking > 0 && (
                <span className="session-pending">
                  {' '}
                  · {creditBlocking} sem categoria válida (revise antes de baixar)
                </span>
              )}
            </li>
            <li>
              <strong>Débito:</strong>{' '}
              {debitCount > 0
                ? `${debitCount} linha(s) · ${debitBundle?.filename_suggested ?? ''}`
                : 'ainda não enviado nesta sessão'}
              {debitCount > 0 && debitBlocking > 0 && (
                <span className="session-pending">
                  {' '}
                  · {debitBlocking} sem categoria válida (revise antes de baixar)
                </span>
              )}
            </li>
          </ul>
          {creditCount > 0 && debitCount > 0 && (
            <p className="session-total">
              <strong>Total no CSV compilado:</strong> {mergeTotal} linhas (crédito + débito; depois,
              ordenadas no servidor).
            </p>
          )}
          {mergeTotal > 0 && (
            <CategoryPieChart creditRows={creditRows} debitRows={debitRows} />
          )}
          <p className="session-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={isBusy}
              title={isBusy ? 'Aguarde o processamento ou o download terminar.' : undefined}
              onClick={clearSession}
            >
              Limpar extratos salvos
            </button>
          </p>

          {creditMsg && (
            <p className="msg ok">
              <strong>Último envio — Crédito</strong> ({creditBundle?.filename_suggested}):{' '}
              {creditMsg}
            </p>
          )}
          {debitMsg && (
            <p className="msg ok">
              <strong>Último envio — Débito</strong> ({debitBundle?.filename_suggested}):{' '}
              {debitMsg}
            </p>
          )}

          {anyBlocking && (
            <div className="hint review-hint">
              {creditBlocking > 0 && (
                <p>
                  <strong>Crédito</strong> (bloco salvo): {creditBlocking} linha(s) precisam de
                  categoria na revisão.
                </p>
              )}
              {debitBlocking > 0 && (
                <p>
                  <strong>Débito</strong> (bloco salvo): {debitBlocking} linha(s) precisam de
                  categoria na revisão.
                </p>
              )}
              <p className="review-hint-actions">
                <Link className="btn secondary" to="/revisao">
                  Abrir revisão
                </Link>
              </p>
            </div>
          )}
          {debitMsg && debitSuggested === 0 && creditBlocking > 0 && (
            <p className="hint muted">
              O último débito não tem pendências neste envio; as da revisão vêm do bloco de{' '}
              <strong>crédito</strong> ainda salvo. Envie novamente o arquivo em &quot;Extrato
              crédito&quot; ou limpe os dados e processe os dois de novo.
            </p>
          )}
          {creditMsg && creditSuggested === 0 && debitBlocking > 0 && (
            <p className="hint muted">
              O último crédito não tem pendências; as da revisão vêm do bloco de{' '}
              <strong>débito</strong> salvo. Envie novamente em &quot;Extrato débito&quot; ou limpe os
              dados da sessão.
            </p>
          )}
          {canMerge && anyBlocking && (
            <div className="review-required-banner" role="alert">
              <span className="review-required-icon" aria-hidden>
                !
              </span>
              <div>
                <strong>Revisão obrigatória</strong>
                <p>
                  {blockingTotal} linha(s) ainda sem categoria permitida. Abra{' '}
                  <Link to="/revisao">Revisão</Link> e selecione as categorias para habilitar o
                  download.
                </p>
              </div>
            </div>
          )}
          <div className="actions download-actions">
            <span
              className="download-btn-wrap"
              title={!canDownload ? downloadBlockedTitle : undefined}
            >
              <button
                type="button"
                className="btn primary"
                disabled={!canDownload}
                onClick={downloadMerged}
              >
                {merging ? 'Gerando…' : 'Baixar CSV compilado'}
              </button>
            </span>
            {!canMerge && (
              <span className="hint">
                Processe os dois lados (ou limpe e envie os dois de novo) para habilitar o download.
              </span>
            )}
            {canMerge && anyBlocking && !isBusy && (
              <span className="hint download-blocked-hint">
                Passe o mouse sobre o botão acima para ver o motivo. O download só libera quando não
                houver linhas bloqueadas.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
