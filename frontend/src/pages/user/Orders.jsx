import { ChevronRight, Receipt } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../../components/orders/OrderStatus'
import { isActive } from '../../utils/orderStatus'
import Button from '../../components/ui/Button'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useAsync } from '../../hooks/useAsync'
import { orderApi } from '../../services/api/orderApi'
import { formatDateTime, formatPrice } from '../../utils/format'

export default function Orders() {
  const [tab, setTab] = useState('all')
  const { data, loading, error, reload } = useAsync(() => orderApi.mine({ limit: 50 }), [])

  const items = (data?.items || []).filter((o) =>
    tab === 'all' ? true : tab === 'active' ? isActive(o.status) : !isActive(o.status),
  )

  return (
    <div className="container-page pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Your orders</h1>
          <p className="mt-1 text-muted">Track current orders and revisit past favourites.</p>
        </div>
        <SegmentedControl
          label="Filter orders"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'past', label: 'Past' },
          ]}
        />
      </div>

      <div className="mt-8">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={tab === 'active' ? 'No active orders' : 'No orders yet'}
            description="When you place an order, you'll be able to track it here."
            action={<Button to="/restaurants">Find something to eat</Button>}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((o) => (
              <li key={o.id} className="animate-fade-in">
                <Link
                  to={`/orders/${o.id}`}
                  className="group flex items-center gap-4 rounded-card border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_8px_24px_rgba(27,27,24,0.05)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="font-semibold text-ink">{o.restaurant_name}</p>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">
                      {o.items.map((i) => `${i.dish_name} × ${i.quantity}`).join(', ')}
                    </p>
                    <p className="mt-1.5 text-xs text-muted">Order #{o.id} · {formatDateTime(o.created_at)}</p>
                  </div>
                  <p className="font-bold tabular-nums text-ink">{formatPrice(o.total_amount)}</p>
                  <ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
