import { ArrowRight, Receipt, RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OrderTracker, StatusBadge } from '../../components/orders/OrderStatus'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import Modal from '../../components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { usePolling } from '../../hooks/usePolling'
import { PageHeader } from '../../layouts/AdminLayout'
import { orderApi } from '../../services/api/orderApi'
import { restaurantApi } from '../../services/api/restaurantApi'
import { formatDateTime, formatPrice } from '../../utils/format'
import { STATUS_META } from '../../utils/orderStatus'

const STATUSES = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED']
const PAGE = 25

function OrderPanel({ orderId, onClose, onChanged }) {
  const toast = useToast()
  const { data: o, loading, setData } = useAsync(() => orderApi.get(orderId), [orderId])
  const [busy, setBusy] = useState(null)

  const act = async (status, label) => {
    setBusy(status)
    try {
      const updated = await orderApi.updateStatus(o.id, status)
      setData(updated)
      onChanged(updated)
      toast.success(label)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const payment = o?.payments.at(-1)
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={o ? `Order #${o.id}` : 'Order'}
      description={o ? `${o.customer_name} · ${o.restaurant_name} · ${formatDateTime(o.created_at)}` : ''}
      footer={o && (
        <>
          {o.can_cancel && <Button variant="danger" onClick={() => act('CANCELLED', 'Order cancelled — stock released')} loading={busy === 'CANCELLED'} disabled={Boolean(busy)}>Cancel order</Button>}
          {o.next_status ? (
            <Button onClick={() => act(o.next_status, `Order moved to ${STATUS_META[o.next_status].label}`)} loading={busy === o.next_status} disabled={Boolean(busy)}>
              Mark as {STATUS_META[o.next_status].label.toLowerCase()} <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )}
        </>
      )}
    >
      {loading || !o ? <Skeleton className="h-64" /> : (
        <div className="space-y-6">
          {o.status !== 'FAILED' && <OrderTracker status={o.status} history={o.history} />}
          {o.status === 'PLACED' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Waiting for the customer's payment. It confirms automatically once paid, or fails after 15 minutes.</p>}
          {o.cancel_reason && <p className="rounded-lg bg-nonveg/5 px-3 py-2 text-xs text-nonveg">{o.cancel_reason}</p>}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Items</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {o.items.map((i) => (
                  <li key={i.dish_name} className="flex items-center gap-2">
                    <FoodTypeIcon type={i.food_type} /><span className="flex-1">{i.dish_name} × {i.quantity}</span>
                    <span className="tabular-nums text-ink-soft">{formatPrice(i.unit_price * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-bold"><span>Total</span><span>{formatPrice(o.total_amount)}</span></p>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Deliver to</h3>
                <p className="mt-1.5 text-ink-soft">{o.delivery_address}</p>
                {o.contact_phone && <p className="text-ink-soft">{o.contact_phone}</p>}
                {o.notes && <p className="mt-1 text-xs italic text-muted">“{o.notes}”</p>}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Payment</h3>
                {payment ? (
                  <p className="mt-1.5 text-ink-soft">
                    <span className="font-semibold text-ink">{payment.status}</span> · {payment.provider === 'MOCK' ? 'Simulated' : 'Razorpay'}
                    {payment.method && ` · ${payment.method.toUpperCase()}`}
                    {payment.razorpay_payment_id && <span className="block font-mono text-xs text-muted">{payment.razorpay_payment_id}</span>}
                  </p>
                ) : <p className="mt-1.5 text-muted">No payment yet</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function AdminOrders() {
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const [restaurantId, setRestaurantId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [page, setPage] = useState(0)
  const openId = params.get('open')

  const restaurants = useAsync(() => restaurantApi.list({ include_inactive: true, limit: 100 }), [])
  const orders = useAsync(
    () => orderApi.all({ status: status || undefined, restaurant_id: restaurantId || undefined, order_id: orderId || undefined, limit: PAGE, offset: page * PAGE }),
    [status, restaurantId, orderId, page],
  )
  const refresh = useCallback(() => orders.reload({ silent: true }), [orders])
  usePolling(refresh, 15000, !openId)

  const open = (id) => setParams({ open: id })
  const onChanged = (u) => orders.setData((d) => d && ({ ...d, items: d.items.map((x) => (x.id === u.id ? { ...x, status: u.status, next_status: u.next_status } : x)) }))

  return (
    <>
      <PageHeader
        title="Orders"
        description="Move orders through the kitchen. The list refreshes every 15 seconds."
        actions={<Button variant="secondary" size="sm" onClick={refresh}><RefreshCw className="size-4" aria-hidden /> Refresh</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select aria-label="Status" className="w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </Select>
        <Select aria-label="Restaurant" className="w-52" value={restaurantId} onChange={(e) => { setRestaurantId(e.target.value); setPage(0) }}>
          <option value="">All restaurants</option>
          {restaurants.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Input aria-label="Order number" className="w-36" inputMode="numeric" placeholder="Order #" value={orderId} onChange={(e) => { setOrderId(e.target.value.replace(/\D/g, '')); setPage(0) }} />
        {orders.data && <span className="ml-auto text-sm text-muted">{orders.data.total.toLocaleString('en-IN')} orders</span>}
      </div>

      {orders.error ? <ErrorState error={orders.error} onRetry={orders.reload} /> : orders.loading && !orders.data ? (
        <Skeleton className="h-96 rounded-card" />
      ) : !orders.data.items.length ? (
        <EmptyState icon={Receipt} title="No orders match" description="Try a different status or restaurant." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Order</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Restaurant</th>
                  <th className="px-3 py-3">Status</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3 text-right">Total</th><th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.data.items.map((o) => (
                  <tr key={o.id} className="cursor-pointer transition-colors hover:bg-canvas/60" onClick={() => open(o.id)}>
                    <td className="px-5 py-3"><p className="font-semibold text-ink">#{o.id}</p><p className="text-xs text-muted">{formatDateTime(o.created_at)}</p></td>
                    <td className="px-3 py-3 text-ink-soft">{o.customer_name}</td>
                    <td className="px-3 py-3 text-ink-soft">{o.restaurant_name}</td>
                    <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-3 py-3 text-xs text-muted">{o.payment_status || '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatPrice(o.total_amount)}</td>
                    <td className="px-5 py-3 text-right">
                      {o.next_status && <span className="text-xs font-semibold text-brand-700">Next: {STATUS_META[o.next_status].label}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="px-2 text-muted">Page {page + 1} of {Math.max(1, Math.ceil(orders.data.total / PAGE))}</span>
            <Button variant="secondary" size="sm" disabled={(page + 1) * PAGE >= orders.data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </>
      )}
      {openId && <OrderPanel orderId={openId} onClose={() => setParams({})} onChanged={onChanged} />}
    </>
  )
}
