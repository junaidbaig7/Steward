import { FlaskConical } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { paymentApi } from '../services/api/paymentApi'
import { formatPrice } from '../utils/format'

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: RAZORPAY_SRC, async: true })
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your connection.'))
    document.body.appendChild(s)
  })
}

/**
 * pay(orderId, { onOpen }) → Promise<{ outcome: 'success' | 'failed' | 'dismissed', order?, reason? }>
 * onOpen fires right before the payment UI appears (so loading overlays can step aside).
 *
 * RAZORPAY_TEST: opens Razorpay Checkout; the backend verifies the signature.
 * MOCK (development only, no keys configured): a clearly-labelled simulator.
 */
export function usePayment() {
  const [mock, setMock] = useState(null) // { session, resolve }
  const [mockBusy, setMockBusy] = useState(false)
  const settled = useRef(false)

  const pay = useCallback(async (orderId, { onOpen } = {}) => {
    const session = await paymentApi.create(orderId)
    settled.current = false

    if (session.provider === 'MOCK') {
      onOpen?.()
      return new Promise((resolve) => setMock({ session, resolve }))
    }

    await loadRazorpay()
    onOpen?.()
    return new Promise((resolve) => {
      const finish = (result) => {
        if (settled.current) return
        settled.current = true
        resolve(result)
      }
      const rzp = new window.Razorpay({
        key: session.key_id,
        amount: session.amount,
        currency: session.currency,
        order_id: session.razorpay_order_id,
        name: session.name,
        description: session.description,
        prefill: session.prefill,
        theme: { color: '#168a34' },
        handler: async (response) => {
          try {
            finish({ outcome: 'success', order: await paymentApi.verify(response) })
          } catch (e) {
            finish({ outcome: 'failed', reason: e.message })
          }
        },
        modal: {
          // Closing the window after a failed attempt is final: fail the order and release
          // its stock (Saga compensation). Closing without any attempt keeps it reserved.
          ondismiss: async () => {
            const failure = lastFailure
            if (!failure) return finish({ outcome: 'dismissed' })
            let order
            try {
              order = await paymentApi.failure({ razorpay_order_id: session.razorpay_order_id, ...failure })
            } catch { /* the server's 15-minute sweeper reconciles the order anyway */ }
            finish({ outcome: 'failed', order, reason: failure.reason })
          },
        },
      })
      // A failed attempt is not final: Razorpay lets the shopper retry another method on
      // the same order, so just remember the latest failure until the window is closed.
      let lastFailure = null
      rzp.on('payment.failed', (response) => {
        lastFailure = {
          razorpay_payment_id: response.error?.metadata?.payment_id,
          reason: response.error?.description || 'Payment failed',
        }
      })
      rzp.open()
    })
  }, [])

  const resolveMock = async (outcome) => {
    const { session, resolve } = mock
    if (outcome === 'dismissed') {
      setMock(null)
      return resolve({ outcome: 'dismissed' })
    }
    setMockBusy(true)
    try {
      const order = await paymentApi.mockComplete(session.razorpay_order_id, outcome)
      resolve({ outcome: outcome === 'success' ? 'success' : 'failed', order, reason: 'Simulated failure' })
    } catch (e) {
      resolve({ outcome: 'failed', reason: e.message })
    } finally {
      setMockBusy(false)
      setMock(null)
    }
  }

  const paymentUi = (
    <Modal
      open={Boolean(mock)}
      onClose={() => !mockBusy && resolveMock('dismissed')}
      size="sm"
      title="Development payment simulator"
      description="Razorpay test keys are not configured, so payments are simulated. This screen never appears once RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set."
      footer={
        <>
          <Button variant="danger" onClick={() => resolveMock('failure')} disabled={mockBusy}>Simulate failure</Button>
          <Button onClick={() => resolveMock('success')} loading={mockBusy}>Simulate success</Button>
        </>
      }
    >
      <div className="flex items-center gap-4 rounded-xl border border-dashed border-warn/40 bg-warn/5 p-4">
        <FlaskConical className="size-6 shrink-0 text-warn" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold text-ink">{mock?.session.description}</p>
          <p className="text-muted">Amount: {formatPrice((mock?.session.amount || 0) / 100)} · Ref {mock?.session.razorpay_order_id}</p>
        </div>
      </div>
    </Modal>
  )

  return { pay, paymentUi }
}
