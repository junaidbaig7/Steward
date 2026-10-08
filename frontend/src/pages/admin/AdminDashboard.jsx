import { CalendarDays, IndianRupee, Receipt, ShoppingBag, Store, TrendingUp, UtensilsCrossed, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DailyRevenueChart, RankedBars, StatTile } from '../../components/charts/Charts'
import { StatusBadge } from '../../components/orders/OrderStatus'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import { ErrorState, Skeleton } from '../../components/ui/States'
import { useAsync } from '../../hooks/useAsync'
import { PageHeader, Panel } from '../../layouts/AdminLayout'
import { analyticsApi } from '../../services/api/analyticsApi'
import { formatCompactPrice, formatPrice, timeAgo } from '../../utils/format'
import { STATUS_META } from '../../utils/orderStatus'

export default function AdminDashboard() {
  const { data, loading, error, reload } = useAsync(() => analyticsApi.overview(), [])

  if (error) return <ErrorState error={error} onRetry={reload} />
  if (loading) {
    return (
      <>
        <Skeleton className="mb-8 h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div>
        <Skeleton className="mt-6 h-80 rounded-card" />
      </>
    )
  }

  const k = data.kpis
  const growth = Number(k.prev_month_to_date_revenue)
    ? (100 * (k.month_revenue - k.prev_month_to_date_revenue)) / k.prev_month_to_date_revenue
    : null
  const totalStatus = data.status_breakdown.reduce((s, r) => s + r.orders, 0)

  return (
    <>
      <PageHeader title="Dashboard" description="Platform performance across all restaurants. Revenue counts paid orders only." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total revenue" value={formatCompactPrice(k.total_revenue)} hint="all time" icon={IndianRupee} />
        <StatTile label="Today's revenue" value={formatPrice(k.today_revenue)} hint={`${k.today_orders} order${k.today_orders === 1 ? '' : 's'} today`} icon={CalendarDays} />
        <StatTile label="This month" value={formatCompactPrice(k.month_revenue)} trend={growth} hint="vs same days last month" icon={TrendingUp} />
        <StatTile label="This year" value={formatCompactPrice(k.year_revenue)} hint={`${k.month_orders} orders this month`} icon={IndianRupee} />
        <StatTile label="Total orders" value={Number(k.total_orders).toLocaleString('en-IN')} hint="paid orders" icon={Receipt} />
        <StatTile label="Average order value" value={formatPrice(k.avg_order_value)} icon={ShoppingBag} />
        <StatTile label="Active restaurants" value={`${k.active_restaurants}/${k.total_restaurants}`} icon={Store} />
        <StatTile label="Dishes" value={k.total_dishes} hint={k.low_stock_dishes ? `${k.low_stock_dishes} running low` : `${k.orderable_dishes} orderable`} icon={UtensilsCrossed} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Revenue · last 30 days" className="xl:col-span-2">
          <DailyRevenueChart data={data.daily} />
        </Panel>
        <Panel title="Order status mix">
          <ul className="space-y-3">
            {data.status_breakdown.map((s) => (
              <li key={s.status} className="flex items-center gap-3 text-sm">
                <StatusBadge status={s.status} className="w-36 justify-center" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
                  <div className="h-full rounded-full bg-ink/40" style={{ width: `${(s.orders / totalStatus) * 100}%` }} />
                </div>
                <span className="w-12 text-right font-semibold tabular-nums text-ink">{s.orders}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-center gap-1.5 text-xs text-muted"><Users className="size-3.5" aria-hidden /> {k.customers} registered customers</p>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Best sellers · last 30 days" action={<Link to="/admin/analytics" className="text-sm font-semibold text-brand-700 hover:underline">Analytics</Link>}>
          <RankedBars
            rows={data.top_dishes}
            label={(r) => <span className="inline-flex items-center gap-1.5"><FoodTypeIcon type={r.food_type} />{r.dish_name}</span>}
            sublabel={(r) => r.restaurant_name}
            value={(r) => r.quantity}
            format={(v) => `${v} sold`}
          />
        </Panel>
        <Panel title="Latest orders" action={<Link to="/admin/orders" className="text-sm font-semibold text-brand-700 hover:underline">All orders</Link>}>
          <ul className="divide-y divide-line">
            {data.recent_orders.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders?open=${o.id}`} className="flex items-center gap-3 py-3 text-sm hover:bg-canvas/60">
                  <span className="w-12 text-xs text-muted">#{o.id}</span>
                  <span className="min-w-0 flex-1 truncate"><span className="font-medium text-ink">{o.customer_name}</span> <span className="text-muted">· {o.restaurant_name}</span></span>
                  <span className="hidden text-xs text-muted sm:inline">{timeAgo(o.created_at)}</span>
                  <span className="hidden sm:inline" title={STATUS_META[o.status]?.label}><StatusBadge status={o.status} /></span>
                  <span className="w-20 text-right font-semibold tabular-nums text-ink">{formatPrice(o.total_amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
