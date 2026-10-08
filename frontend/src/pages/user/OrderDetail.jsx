import { ArrowLeft, CheckCircle2, CreditCard, MapPin, Phone, RefreshCw, StickyNote, XCircle } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import ReviewPrompt from '../../components/food/ReviewPrompt'
import { OrderTracker, StatusBadge } from '../../components/orders/OrderStatus'
import { STATUS_META, isActive } from '../../utils/orderStatus'
import Button from '../../components/ui/Button'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import Modal from '../../components/ui/Modal'
import { ErrorState, Skeleton } from '../../components/ui/States'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { usePayment } from '../../hooks/usePayment'
import { usePolling } from '../../hooks/usePolling'
import { orderApi } from '../../services/api/orderApi'
import { formatDateTime, formatPrice } from '../../utils/format'
import { BillRows } from './Cart'

const POLL_MS = 8000

function Headline({ order, justPlaced }) {
  const meta = STATUS_META[order.status]
  const messages = {
    PLACED: 'Complete your payment to confirm this order.',
    CONFIRMED: 'The restaurant has your order and will start soon.',
    PREPARING: 'The kitchen is preparing your food.',
    READY: 'Your food is packed and waiting for a rider.',
    OUT_FOR_DELIVERY: 'Your order is on its way to you.',
    DELIVERED: 'Delivered. Enjoy your meal!',
    CANCELLED: order.cancel_reason || 'This order was cancelled.',
    FAILED: order.cancel_reason || 'The payment did not go through.',
  }
  const bad = order.status === 'FAILED' || order.status === 'CANCELLED'
  return (
    <div className="flex items-start gap-4">
      <span className={`grid size-12 shrink-0 place-items-center rounded-full ${bad ? 'bg-nonveg/8 text-nonveg' : 'bg-brand-50 text-brand-700'}`}>
        {bad ? <XCircle className="size-6" aria-hidden /> : justPlaced ? <CheckCircle2 className="size-6" aria-hidden /> : <meta.icon className="size-6" aria-hidden />}
      </span>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {justPlaced && order.status === 'CONFIRMED' ? 'Order confirmed!' : meta.label}
        </h1>
        <p className="mt-0.5 text-ink-soft">{messages[order.status]}</p>
      </div>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const location = useLocation()
  const toast = useToast()
  const { pay, paymentUi } = usePayment()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data: order, loading, error, reload, setData } = useAsync(() => orderApi.get(id), [id])
  const refresh = useCallback(() => reload({ silent: true }), [reload])
  usePolling(refresh, POLL_MS, Boolean(order && isActive(order.status)))

  if (error) return <div className="container-page pt-10"><ErrorState error={error} onRetry={reload} /></div>
  if (loading || !order) {
    return (
      <div className="container-page space-y-4 pt-10">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  }

  const payNow = async () => {
    setBusy(true)
    try {
      const result = await pay(order.id)
      if (result.outcome === 'success') toast.success('Payment successful — order confirmed!')
      else if (result.outcome === 'failed') toast.error(result.reason || 'Payment failed')
      if (result.order) setData(result.order)
      else refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      setData(await orderApi.cancel(order.id))
      toast.info('Order cancelled')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
      setConfirmCancel(false)
    }
  }

  const lastPayment = order.payments.at(-1)
  const bill = { subtotal: order.subtotal, deliveryFee: order.delivery_fee, tax: order.tax_amount, total: order.total_amount }

  return (
    <div className="container-page pt-8">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All orders
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <Headline order={order} justPlaced={location.state?.justPlaced} />
        <div className="flex items-center gap-2">
          {isActive(order.status) && (
            <button onClick={refresh} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted hover:bg-ink/5 hover:text-ink" aria-label="Refresh status">
              <RefreshCw className="size-3.5" aria-hidden /> Live
            </button>
          )}
          {order.status === 'PLACED' && <Button onClick={payNow} loading={busy}><CreditCard className="size-4" aria-hidden /> Pay {formatPrice(order.total_amount)}</Button>}
          {order.can_cancel && <Button variant="danger" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel order</Button>}
        </div>
      </div>

      {order.status !== 'FAILED' && (
        <section className="mt-8 rounded-card border border-line bg-surface px-4 py-6 sm:px-8" aria-label="Order tracking">
          <OrderTracker status={order.status} history={order.history} />
        </section>
      )}

      {order.status === 'DELIVERED' && <ReviewPrompt order={order} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="h-fit rounded-card border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">{order.restaurant_name}</h2>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted">Order #{order.id} · {formatDateTime(order.created_at)}</p>
          <ul className="mt-5 divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.dish_name} className="flex items-center gap-3 py-3 text-sm">
                <FoodTypeIcon type={i.food_type} />
                <span className="flex-1 text-ink">{i.dish_name} <span className="text-muted">× {i.quantity}</span></span>
                <span className="tabular-nums text-ink-soft">{formatPrice(i.unit_price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-4"><BillRows bill={bill} /></div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-card border border-line bg-surface p-6 text-sm">
            <h2 className="font-bold text-ink">Delivery</h2>
            <p className="mt-3 flex gap-2 text-ink-soft"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />{order.delivery_address}</p>
            {order.contact_phone && <p className="mt-2 flex gap-2 text-ink-soft"><Phone className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />{order.contact_phone}</p>}
            {order.notes && <p className="mt-2 flex gap-2 text-ink-soft"><StickyNote className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />{order.notes}</p>}
          </section>

          <section className="rounded-card border border-line bg-surface p-6 text-sm">
            <h2 className="font-bold text-ink">Payment</h2>
            {lastPayment ? (
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between"><dt className="text-muted">Status</dt><dd className="font-semibold text-ink">{lastPayment.status}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Gateway</dt><dd className="text-ink">{lastPayment.provider === 'MOCK' ? 'Dev simulator' : 'Razorpay (Test)'}</dd></div>
                {lastPayment.method && <div className="flex justify-between"><dt className="text-muted">Method</dt><dd className="uppercase text-ink">{lastPayment.method}</dd></div>}
                {lastPayment.razorpay_payment_id && (
                  <div className="flex justify-between gap-4"><dt className="text-muted">Payment ID</dt><dd className="truncate font-mono text-xs text-ink">{lastPayment.razorpay_payment_id}</dd></div>
                )}
                {lastPayment.failure_reason && <p className="pt-1 text-xs text-nonveg">{lastPayment.failure_reason}</p>}
              </dl>
            ) : (
              <p className="mt-2 text-muted">Not paid yet.</p>
            )}
          </section>

          <section className="rounded-card border border-line bg-surface p-6 text-sm">
            <h2 className="font-bold text-ink">Timeline</h2>
            <ol className="mt-4 space-y-4 border-l border-line pl-5">
              {order.history.map((h, i) => (
                <li key={i} className="relative animate-fade-in">
                  <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-surface bg-brand-600 ring-1 ring-brand-600" aria-hidden />
                  <p className="font-semibold text-ink">{h.status === 'PLACED' ? 'Order placed' : STATUS_META[h.status]?.label || h.status}</p>
                  {h.note && <p className="text-xs text-muted">{h.note}</p>}
                  <p className="text-xs text-muted">{formatDateTime(h.created_at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        size="sm"
        title="Cancel this order?"
        description="Your reserved dishes will be released. You haven't been charged."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep order</Button>
            <Button variant="danger" onClick={cancel} loading={busy}>Cancel order</Button>
          </>
        }
      />
      {paymentUi}
    </div>
  )
}
