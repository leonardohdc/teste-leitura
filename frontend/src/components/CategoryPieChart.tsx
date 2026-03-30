import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { StatementRowDTO } from '../api'
import {
  aggregatesToBarData,
  aggregatesToPieData,
  buildCategoryAggregates,
  type CategoryAggregate,
} from '../categoryTotals'
import { formatBRL } from '../money'
import { loadOverrides } from '../storage'

const SLICE_COLORS = [
  '#5b4bdb',
  '#0d7a4f',
  '#2563eb',
  '#c2410c',
  '#7c3aed',
  '#0d9488',
  '#b45309',
  '#db2777',
  '#4f46e5',
  '#15803d',
  '#0369a1',
  '#a21caf',
]

function colorByCategoryName(aggregates: CategoryAggregate[]): Map<string, string> {
  const names = [...new Set(aggregates.map((a) => a.name))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  const m = new Map<string, string>()
  names.forEach((n, i) => m.set(n, SLICE_COLORS[i % SLICE_COLORS.length]))
  return m
}

type Props = {
  creditRows: StatementRowDTO[]
  debitRows: StatementRowDTO[]
}

type PieDatumPayload = { name: string; value: number; valorTotal: number }

function CategoryPieTooltip({
  active,
  payload,
  totalLinhas,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: PieDatumPayload }>
  totalLinhas: number
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  if (!row) return null
  const n = row.value
  const pct = totalLinhas > 0 ? ((n / totalLinhas) * 100).toFixed(1) : '0'
  return (
    <div className="pie-tooltip">
      <div className="pie-tooltip-class">{row.name}</div>
      <div className="pie-tooltip-meta">
        {formatBRL(row.valorTotal)} · {n} linha(s) · {pct}% das linhas
      </div>
    </div>
  )
}

type BarDatum = { name: string; valorTotal: number; linhas: number }

function CategoryBarTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: BarDatum }>
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  if (!row) return null
  return (
    <div className="pie-tooltip">
      <div className="pie-tooltip-class">{row.name}</div>
      <div className="pie-tooltip-meta">
        {formatBRL(row.valorTotal)} · {row.linhas} linha(s)
      </div>
    </div>
  )
}

export default function CategoryPieChart({ creditRows, debitRows }: Props) {
  const overrides = loadOverrides()
  const overrideKey = JSON.stringify(overrides)

  const aggregates = useMemo(() => {
    return buildCategoryAggregates(creditRows, debitRows, loadOverrides())
  }, [creditRows, debitRows, overrideKey])

  const pieData = useMemo(() => aggregatesToPieData(aggregates), [aggregates])
  const barData = useMemo(() => aggregatesToBarData(aggregates), [aggregates])
  const colorMap = useMemo(() => colorByCategoryName(aggregates), [aggregates])

  const totalLinhas = pieData.reduce((s, d) => s + d.value, 0)

  if (totalLinhas === 0) return null

  return (
    <div className="pie-chart-block">
      <h3 className="pie-chart-title">Distribuição por categoria</h3>
      <p className="muted pie-chart-sub">
        Pizza: número de linhas. Barras: soma dos valores da coluna Valor (mantém o sinal; crédito e
        débito salvos).
      </p>
      <div className="pie-chart-wrap">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="45%"
              innerRadius={52}
              outerRadius={104}
              paddingAngle={1}
            >
              {pieData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={colorMap.get(entry.name) ?? SLICE_COLORS[0]}
                  stroke="var(--surface)"
                />
              ))}
            </Pie>
            <Tooltip
              content={(props) => (
                <CategoryPieTooltip
                  active={props.active}
                  payload={props.payload as ReadonlyArray<{ payload?: PieDatumPayload }> | undefined}
                  totalLinhas={totalLinhas}
                />
              )}
            />
            <Legend
              layout="vertical"
              verticalAlign="middle"
              align="right"
              wrapperStyle={{ fontSize: '0.8rem', color: 'var(--muted)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <h3 className="pie-chart-title bar-chart-title">Totais por valor</h3>
      <p className="muted pie-chart-sub">
        Torres ordenadas pelo valor absoluto. Passe o mouse para ver a categoria e o total em reais.
      </p>
      <div className="bar-chart-wrap">
        <ResponsiveContainer width="100%" height={Math.max(220, barData.length * 36)}>
          <BarChart
            layout="vertical"
            data={barData}
            margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickFormatter={(v) => formatBRL(Number(v))}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={118}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickFormatter={(v) =>
                String(v).length > 16 ? `${String(v).slice(0, 15)}…` : String(v)
              }
            />
            <Tooltip
              content={(props) => (
                <CategoryBarTooltip
                  active={props.active}
                  payload={props.payload as ReadonlyArray<{ payload?: BarDatum }> | undefined}
                />
              )}
            />
            <Bar dataKey="valorTotal" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {barData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={colorMap.get(entry.name) ?? SLICE_COLORS[0]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
