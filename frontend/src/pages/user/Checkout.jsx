import { AlertCircle, ArrowLeft, Lock, MapPin, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import FoodImage from '../../components/food/FoodImage'
import PreparingOverlay from '../../components/orders/PreparingOverlay'
import Button from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Field'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { usePayment } from '../../hooks/usePayment'
import { orderApi } from '../../services/api/orderApi'
import { paymentApi } from '../../services/api/paymentApi'
import { restaurantApi } from '../../services/api/restaurantApi'
import { formatPrice } from '../../utils/format'
import { sizedImage } from '../../utils/images'
import { estimateBill } from '../../utils/pricing'
import { BillRows } from './Cart'

const ADDRESS_KEY = 'steward.lastAddress'
const STAGES = {
  order: { message: 'Preparing your order…', detail: 'Checking prices and reserving your dishes' },
  payment: { message: 'Opening secure payment…', detail: 'Connecting to the payment gateway' },
}

function readAddress() {
  try {
    return localStorage.getItem(ADDRESS_KEY) || ''
  } catch {
    return ''
  }
}

export default function Checkout() {
  const cart = useCart()
  const { user } = useAuth()
  const toast = useToast()
  const { pay, paymentUi } = usePayment()

  const [address, setAddress] = useState(readAddress)
  const [phone, setPhone] = useState(user?.phone || '')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [stage, setStage] = useState(null)
  const [problem, setProblem] = useState(null) // { title, text, retry }
  const [completedOrderId, setCompletedOrderId] = useState(null)
  // The pending order belongs to one exact cart composition; changing the cart starts a new attempt.
  const cartSignature = cart.items.map((i) => `${i.dish_id}x${i.quantity}`).join(',')
  const [attempt, setAttempt] = useState({ signature: cartSignature, orderId: null })
  const pendingOrderId = attempt.signature === cartSignature ? attempt.orderId : null
  const setPendingOrderId = (orderId) => setAttempt({ signature: cartSignature, orderId })
  const idempotency = useRef({ signature: null, key: null })

  const { data: restaurant } = useAsync(
    () => (cart.restaurant ? restaurantApi.get(cart.restaurant.id) : Promise.resolve(null)),
    [cart.restaurant?.id],
  )
  const { data: payConfig } = useAsync(() => paymentApi.config(), [])

  // Paid: go to the tracking page (checked first — clearing the cart must not bounce us to /cart).
  if (completedOrderId) return <Navigate to={`/orders/${completedOrderId}`} replace state={{ justPlaced: true }} />
  if (!cart.count && !stage) return <Navigate to="/cart" replace />

  const bill = estimateBill(cart.subtotal, restaurant?.delivery_fee)

  const validate = () => {
    const e = {}
    if (address.trim().length < 10) e.address = 'Please enter your full delivery address.'
    if (phone && !/^\+?[0-9 ]{10,16}$/.test(phone)) e.phone = 'Enter a valid phone number.'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handlePayResult = (result, orderId) => {
    setStage(null)
    if (result.outcome === 'success') {
      setCompletedOrderId(orderId)
      cart.clear()
      toast.success('Payment successful — your order is confirmed!')
    } else if (result.outcome === 'failed') {
      setPendingOrderId(null)
      idempotency.current = { signature: null, key: null } // next attempt = new order
      setProblem({
        title: 'Payment failed',
        text: `${result.reason || 'The payment did not go through'}. Your order was cancelled and nothing was charged. Your cart is still here — you can try again.`,
      })
    } else {
      setProblem({
        title: 'Payment not completed',
        text: 'Your order is reserved for 15 minutes. Complete the payment to confirm it.',
        retry: true,
      })
    }
  }

  const placeAndPay = async () => {
    setProblem(null)
    if (!validate()) return
    try {
      localStorage.setItem(ADDRESS_KEY, address.trim())
    } catch { /* optional convenience */ }

    let orderId = pendingOrderId
    try {
      if (!orderId) {
        if (idempotency.current.signature !== cartSignature) {
          idempotency.current = { signature: cartSignature, key: crypto.randomUUID() }
        }
        setStage('order')
        const order = await orderApi.place(
          {
            items: cart.items.map((i) => ({ dish_id: i.dish_id, quantity: i.quantity })),
            delivery_address: address.trim(),
            contact_phone: phone || null,
            notes: notes.trim() || null,
          },
          idempotency.current.key,
        )
        orderId = order.id
        setPendingOrderId(order.id)
      }
      setStage('payment')
      const result = await pay(orderId, { onOpen: () => setStage(null) })
      handlePayResult(result, orderId)
    } catch (e) {
      setStage(null)
      setProblem({ title: "We couldn't place your order", text: e.message })
    }
  }

  return (
    <div className="container-page pt-8">
      <Link to="/cart" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to cart
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Checkout</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
        <section className="h-fit rounded-card border border-line bg-surface p-6 sm:p-8" aria-labelledby="delivery-heading">
          <h2 id="delivery-heading" className="flex items-center gap-2 font-bold text-ink">
            <MapPin className="size-5 text-brand-600" aria-hidden /> Delivery details
          </h2>
          <div className="mt-6 space-y-5">
            <Field label="Delivery address" htmlFor="address" error={errors.address}>
              <Textarea
                id="address"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House / flat, street, area, city, PIN code"
                autoComplete="street-address"
                className={errors.address ? 'border-nonveg' : ''}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Contact phone" htmlFor="contact" error={errors.phone} hint="The rider will call this number">
                <Input id="contact" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Note for the kitchen" htmlFor="notes" hint="Optional">
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Less spicy, no onion…" />
              </Field>
            </div>
          </div>

          {problem && (
            <div className="mt-6 flex gap-3 rounded-xl border border-nonveg/20 bg-nonveg/5 p-4 animate-fade-in" role="alert">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-nonveg" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold text-ink">{problem.title}</p>
                <p className="mt-0.5 text-ink-soft">{problem.text}</p>
                {problem.retry && pendingOrderId && (
                  <Link to={`/orders/${pendingOrderId}`} className="mt-2 inline-block font-semibold text-brand-700 hover:underline">
                    View order #{pendingOrderId}
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="h-fit rounded-card border border-line bg-surface p-6 lg:sticky lg:top-24">
          <h2 className="font-bold text-ink">Order summary</h2>
          <p className="mt-0.5 text-sm text-muted">{cart.restaurant?.name}</p>
          <ul className="mt-5 space-y-3">
            {cart.items.map((i) => (
              <li key={i.dish_id} className="flex items-center gap-3 text-sm">
                <FoodImage src={sizedImage(i.image_url, 'small')} alt="" className="size-10 rounded-lg object-cover" />
                <FoodTypeIcon type={i.food_type} />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {i.name} <span className="text-muted">× {i.quantity}</span>
                </span>
                <span className="tabular-nums text-ink-soft">{formatPrice(i.price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-line pt-5"><BillRows bill={bill} /></div>
          <Button size="lg" className="mt-6 w-full" onClick={placeAndPay} loading={Boolean(stage)}>
            <Lock className="size-4" aria-hidden />
            {pendingOrderId ? 'Retry payment' : `Pay ${formatPrice(bill.total)}`}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <ShieldCheck className="size-3.5" aria-hidden />
            {payConfig?.mode === 'RAZORPAY_TEST'
              ? 'Secured by Razorpay · Test Mode — no real money moves'
              : 'Development mode · payments are simulated'}
          </p>
        </aside>
      </div>

      {stage && <PreparingOverlay {...STAGES[stage]} />}
      {paymentUi}
    </div>
  )
}
