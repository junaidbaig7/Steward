import { CalendarDays, Heart, IndianRupee, MessageSquare, Receipt, Store } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ColumnChart, StatTile } from '../../components/charts/Charts'
import { StatusBadge } from '../../components/orders/OrderStatus'
import Button from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import { ErrorState, Skeleton } from '../../components/ui/States'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { analyticsApi } from '../../services/api/analyticsApi'
import { authApi } from '../../services/api/authApi'
import { orderApi } from '../../services/api/orderApi'
import { reviewApi } from '../../services/api/reviewApi'
import { formatDate, formatPrice, monthLabel } from '../../utils/format'

function Profile() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user.full_name || '')
  const [email, setEmail] = useState(user.email || '')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      updateUser(await authApi.updateMe({ full_name: name.trim() || null, ...(email.trim() ? { email: email.trim() } : {}) }))
      toast.success('Profile saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form id="profile" onSubmit={save} className="scroll-mt-24 rounded-card border border-line bg-surface p-6">
      <h2 className="font-bold text-ink">Profile</h2>
      <p className="mt-0.5 text-sm text-muted">Signed in with {user.phone ? `mobile ${user.phone}` : `Google (${user.email})`} · member since {formatDate(user.created_at)}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="p-name"><Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} /></Field>
        <Field label="Email" htmlFor="p-email" hint="For receipts (optional)"><Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!user.phone} /></Field>
      </div>
      <Button type="submit" className="mt-5" loading={busy}>Save profile</Button>
    </form>
  )
}

export default function Account() {
  const { user } = useAuth()
  const stats = useAsync(() => analyticsApi.me(), [])
  const reviews = useAsync(() => reviewApi.mine(), [])
  const recent = useAsync(() => orderApi.mine({ limit: 5 }), [])

  const s = stats.data?.summary

  return (
    <div className="container-page pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Hi{user.full_name ? `, ${user.full_name.split(' ')[0]}` : ''} 👋</h1>
      <p className="mt-1 text-muted">Your orders and spending at a glance.</p>

      {stats.error ? <ErrorState error={stats.error} onRetry={stats.reload} /> : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.loading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-card" />) : (
            <>
              <StatTile label="Total orders" value={s.total_orders} hint={s.first_order_at ? `since ${formatDate(s.first_order_at, { month: 'short', year: 'numeric' })}` : 'no orders yet'} icon={Receipt} />
              <StatTile label="Total spent" value={formatPrice(s.total_spent)} hint={`avg ${formatPrice(s.avg_order_value)} per order`} icon={IndianRupee} />
              <StatTile label="This month" value={formatPrice(s.this_month)} hint={`${formatPrice(s.last_month)} last month`} icon={CalendarDays} />
              <StatTile label="Reviews written" value={reviews.data?.total ?? '—'} icon={MessageSquare} />
            </>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-surface p-6 lg:col-span-2">
          <h2 className="font-bold text-ink">Monthly spending</h2>
          <div className="mt-5">
            {stats.loading ? <Skeleton className="h-56" /> : (
              <ColumnChart data={stats.data?.monthly || []} xKey="month" yKey="spent" xFormatter={monthLabel} valueLabel="Spent" height={230} extra={(r) => `${r.orders} order${r.orders === 1 ? '' : 's'}`} />
            )}
          </div>
        </section>
        <section className="space-y-4">
          <div className="rounded-card border border-line bg-surface p-6">
            <p className="flex items-center gap-2 text-sm text-muted"><Heart className="size-4" aria-hidden /> Favourite dish</p>
            {stats.data?.favourite_dish ? (
              <p className="mt-2 flex items-center gap-2 text-lg font-bold text-ink"><FoodTypeIcon type={stats.data.favourite_dish.food_type} />{stats.data.favourite_dish.dish_name}</p>
            ) : <p className="mt-2 text-sm text-muted">Order something to find out!</p>}
            {stats.data?.favourite_dish && <p className="text-xs text-muted">ordered {stats.data.favourite_dish.quantity} times</p>}
          </div>
          <div className="rounded-card border border-line bg-surface p-6">
            <p className="flex items-center gap-2 text-sm text-muted"><Store className="size-4" aria-hidden /> Favourite restaurant</p>
            {stats.data?.favourite_restaurant ? (
              <>
                <Link to={`/restaurants/${stats.data.favourite_restaurant.restaurant_id}`} className="mt-2 block text-lg font-bold text-ink hover:text-brand-700">{stats.data.favourite_restaurant.name}</Link>
                <p className="text-xs text-muted">{stats.data.favourite_restaurant.orders} orders</p>
              </>
            ) : <p className="mt-2 text-sm text-muted">—</p>}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-card border border-line bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-ink">Recent orders</h2>
          <Link to="/orders" className="text-sm font-semibold text-brand-700 hover:underline">All orders</Link>
        </div>
        {recent.loading ? <Skeleton className="mt-4 h-32" /> : !recent.data?.items.length ? (
          <p className="mt-3 text-sm text-muted">No orders yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {recent.data.items.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="flex items-center gap-3 py-3 text-sm hover:text-brand-700">
                  <span className="flex-1 font-medium text-ink">{o.restaurant_name}</span>
                  <span className="hidden text-xs text-muted sm:inline">{formatDate(o.created_at)}</span>
                  <StatusBadge status={o.status} />
                  <span className="w-20 text-right font-semibold tabular-nums">{formatPrice(o.total_amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6"><Profile /></div>
    </div>
  )
}
