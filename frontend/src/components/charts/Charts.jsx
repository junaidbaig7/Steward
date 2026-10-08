import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompactPrice, formatPrice } from '../../utils/format'

// Single-series charts use the brand hue only; text stays in ink tokens.
const SERIES = '#168a34'
const GRID = '#ebe7df'
const AXIS = { fontSize: 11, fill: '#7a786f' }

function ChartTooltip({ active, payload, label, labelFormatter, valueLabel = 'Revenue', format = formatPrice, extra }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[0_8px_24px_rgba(27,27,24,0.1)]">
      <p className="font-semibold text-ink">{labelFormatter ? labelFormatter(label) : label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-ink-soft">
        <span className="size-2 rounded-sm" style={{ background: SERIES }} aria-hidden />
        {valueLabel}: <span className="font-semibold tabular-nums text-ink">{format(payload[0].value)}</span>
      </p>
      {extra && <p className="mt-0.5 text-muted">{extra(row)}</p>}
    </div>
  )
}

const shortDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const longDay = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** Revenue over days — area with a crosshair tooltip. */
export function DailyRevenueChart({ data, height = 260 }) {
  const rows = data.map((d) => ({ ...d, revenue: Number(d.revenue) }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tickFormatter={shortDay} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={formatCompactPrice} tick={AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          cursor={{ stroke: '#d9d4c9', strokeWidth: 1 }}
          content={<ChartTooltip labelFormatter={longDay} extra={(r) => `${r.orders} paid order${r.orders === 1 ? '' : 's'}`} />}
        />
        <Area type="monotone" dataKey="revenue" stroke={SERIES} strokeWidth={2} fill="url(#rev-fill)" activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Vertical bars over categories (months). */
export function ColumnChart({ data, xKey, yKey, height = 260, xFormatter = (v) => v, valueLabel = 'Revenue', format = formatPrice, extra }) {
  const rows = data.map((d) => ({ ...d, [yKey]: Number(d[yKey]) }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tickFormatter={xFormatter} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={format === formatPrice ? formatCompactPrice : undefined} tick={AXIS} tickLine={false} axisLine={false} width={56} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(27,27,24,0.04)' }} content={<ChartTooltip labelFormatter={xFormatter} valueLabel={valueLabel} format={format} extra={extra} />} />
        <Bar dataKey={yKey} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Ranked horizontal bars as plain HTML: label + value always visible, no legend needed. */
export function RankedBars({ rows, label, value, format = (v) => v, sublabel }) {
  const max = Math.max(...rows.map((r) => Number(value(r))), 1)
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={i} className="group">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">
              <span className="mr-2 tabular-nums text-muted">{i + 1}</span>
              {label(r)}
              {sublabel && <span className="ml-1.5 text-xs text-muted">{sublabel(r)}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{format(value(r))}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/70">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width,opacity] duration-700 group-hover:opacity-80"
              style={{ width: `${(Number(value(r)) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Headline number tile. */
export function StatTile({ label, value, hint, icon: Icon, trend }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        {Icon && <Icon className="size-4 text-muted" aria-hidden />}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums text-ink">{value}</p>
      {(hint || trend != null) && (
        <p className="mt-1 text-xs text-muted">
          {trend != null && (
            <span className={trend >= 0 ? 'font-semibold text-brand-700' : 'font-semibold text-nonveg'}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%{' '}
            </span>
          )}
          {hint}
        </p>
      )}
    </div>
  )
}
