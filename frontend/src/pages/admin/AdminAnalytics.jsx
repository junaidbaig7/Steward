import { Award, CalendarDays, IndianRupee, Receipt, ShoppingBag, Star, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ColumnChart, DailyRevenueChart, RankedBars, StatTile } from '../../components/charts/Charts'
import { Select } from '../../components/ui/Field'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { ErrorState, Skeleton } from '../../components/ui/States'
import { useAsync } from '../../hooks/useAsync'
import { PageHeader, Panel } from '../../layouts/AdminLayout'
import { analyticsApi } from '../../services/api/analyticsApi'
import { reviewApi } from '../../services/api/reviewApi'
import { formatCompactPrice, formatPrice, monthLabel } from '../../utils/format'

function PlatformView() {
  const [metric, setMetric] = useState('revenue')
  const monthly = useAsync(() => analyticsApi.revenue({ granularity: 'month', months: 12 }), [])
  const perf = useAsync(() => analyticsApi.restaurants(), [])
  const ranks = useAsync(() => reviewApi.rankings(), [])
  const top = useAsync(() => analyticsApi.topDishes({ limit: 10 }), [])

  const ratingById = useMemo(() => Object.fromEntries((ranks.data || []).map((r) => [r.restaurant_id, r])), [ranks.data])
  if (monthly.error || perf.error) return <ErrorState error={monthly.error || perf.error} onRetry={() => { monthly.reload(); perf.reload() }} />

  return (
    <div className="space-y-6">
      <Panel
        title={metric === 'revenue' ? 'Monthly revenue · last 12 months' : 'Monthly paid orders · last 12 months'}
        action={<SegmentedControl size="sm" label="Metric" value={metric} onChange={setMetric} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'orders', label: 'Orders' }]} />}
      >
        {monthly.loading ? <Skeleton className="h-64" /> : (
          <ColumnChart
            data={monthly.data}
            xKey="month"
            yKey={metric}
            xFormatter={monthLabel}
            valueLabel={metric === 'revenue' ? 'Revenue' : 'Orders'}
            format={metric === 'revenue' ? formatPrice : (v) => v.toLocaleString('en-IN')}
            extra={(r) => (r.growth_pct == null ? 'First month' : `${r.growth_pct > 0 ? '+' : ''}${r.growth_pct}% revenue vs previous month`)}
          />
        )}
        <p className="mt-3 text-xs text-muted">Growth uses SQL <code className="rounded bg-ink/5 px-1">LAG()</code>; the current month is month-to-date.</p>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel title="Restaurant performance" className="xl:col-span-3">
          {perf.loading ? <Skeleton className="h-64" /> : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-2 pb-3">#</th><th className="px-2 pb-3">Restaurant</th><th className="px-2 pb-3 text-right">Revenue</th>
                    <th className="px-2 pb-3 text-right">Share</th><th className="px-2 pb-3 text-right">Orders</th><th className="px-2 pb-3 text-right">AOV</th><th className="px-2 pb-3 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {perf.data.map((r) => (
                    <tr key={r.restaurant_id}>
                      <td className="px-2 py-2.5 tabular-nums text-muted">{r.revenue_rank}</td>
                      <td className="px-2 py-2.5 font-medium text-ink">{r.name}{!r.is_active && <span className="ml-1.5 text-xs text-muted">(inactive)</span>}</td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{formatCompactPrice(r.revenue)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">{r.revenue_share_pct ?? 0}%</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">{r.orders}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">{formatPrice(r.avg_order_value)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">
                        {ratingById[r.restaurant_id] ? <>★ {ratingById[r.restaurant_id].avg_rating.toFixed(1)}</> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Ranked with <code className="rounded bg-ink/5 px-1">DENSE_RANK()</code>; share = revenue ÷ <code className="rounded bg-ink/5 px-1">SUM(revenue) OVER ()</code>. Ratings come from MongoDB.</p>
        </Panel>
        <Panel title="Best-selling dishes · all time" className="xl:col-span-2">
          {top.loading ? <Skeleton className="h-64" /> : (
            <RankedBars
              rows={top.data}
              label={(r) => <span className="inline-flex items-center gap-1.5"><FoodTypeIcon type={r.food_type} />{r.dish_name}</span>}
              sublabel={(r) => r.restaurant_name}
              value={(r) => r.quantity}
              format={(v) => `${v} sold`}
            />
          )}
        </Panel>
      </div>
    </div>
  )
}

function RestaurantView({ restaurant }) {
  const { data, loading, error, reload } = useAsync(() => analyticsApi.restaurant(restaurant.restaurant_id), [restaurant.restaurant_id])
  const rating = useAsync(() => reviewApi.summary(restaurant.restaurant_id), [restaurant.restaurant_id])
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (loading) return <Skeleton className="h-96 rounded-card" />
  const k = data.kpis
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total revenue" value={formatCompactPrice(k.total_revenue)} icon={IndianRupee} />
        <StatTile label="Today's revenue" value={formatPrice(k.today_revenue)} hint={`${k.today_orders} orders today`} icon={CalendarDays} />
        <StatTile label="This month" value={formatCompactPrice(k.month_revenue)} hint={`${k.month_orders} orders`} icon={TrendingUp} />
        <StatTile label="This year" value={formatCompactPrice(k.year_revenue)} icon={IndianRupee} />
        <StatTile label="Total orders" value={k.total_orders} icon={Receipt} />
        <StatTile label="Average order value" value={formatPrice(k.avg_order_value)} icon={ShoppingBag} />
        <StatTile label="Average rating" value={rating.data?.avg_rating ? `${rating.data.avg_rating.toFixed(1)} ★` : '—'} hint={`${rating.data?.review_count || 0} reviews`} icon={Star} />
        <StatTile label="Most popular dish" value={<span className="text-lg">{data.most_popular_dish?.dish_name || '—'}</span>} hint={data.most_popular_dish && `${data.most_popular_dish.quantity} sold`} icon={Award} />
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Panel title="Revenue · last 30 days" className="xl:col-span-3"><DailyRevenueChart data={data.daily} /></Panel>
        <Panel title="Top dishes" className="xl:col-span-2">
          <RankedBars rows={data.top_dishes} label={(r) => <span className="inline-flex items-center gap-1.5"><FoodTypeIcon type={r.food_type} />{r.dish_name}</span>} value={(r) => r.quantity} format={(v) => `${v} sold`} />
        </Panel>
      </div>
    </div>
  )
}

export default function AdminAnalytics() {
  const perf = useAsync(() => analyticsApi.restaurants(), [])
  const [selected, setSelected] = useState('')
  const restaurant = perf.data?.find((r) => String(r.restaurant_id) === selected)

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Revenue, orders and best sellers — computed with SQL aggregation, CTEs and window functions."
        actions={
          <Select aria-label="Scope" className="w-60" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">All restaurants (platform)</option>
            {perf.data?.map((r) => <option key={r.restaurant_id} value={r.restaurant_id}>{r.name}</option>)}
          </Select>
        }
      />
      {restaurant ? <RestaurantView restaurant={restaurant} /> : <PlatformView />}
    </>
  )
}
