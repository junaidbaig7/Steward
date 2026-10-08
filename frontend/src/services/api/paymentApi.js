import client from './client'

export const paymentApi = {
  config: () => client.get('/payments/config').then((r) => r.data),
  create: (orderId) => client.post('/payments/create', { order_id: orderId }).then((r) => r.data),
  verify: (data) => client.post('/payments/verify', data).then((r) => r.data),
  failure: (data) => client.post('/payments/failure', data).then((r) => r.data),
  /** Development-only simulator, used when Razorpay test keys are not configured. */
  mockComplete: (razorpayOrderId, outcome) =>
    client.post('/payments/mock/complete', { razorpay_order_id: razorpayOrderId, outcome }).then((r) => r.data),
}
