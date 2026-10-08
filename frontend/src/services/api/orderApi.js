import client from './client'

export const orderApi = {
  /** idempotencyKey makes a retried/double-clicked checkout return the same order. */
  place: (data, idempotencyKey) =>
    client.post('/orders', data, { headers: { 'Idempotency-Key': idempotencyKey } }).then((r) => r.data),
  mine: (params) => client.get('/orders', { params }).then((r) => r.data),
  get: (id) => client.get(`/orders/${id}`).then((r) => r.data),
  cancel: (id, reason) => client.post(`/orders/${id}/cancel`, { reason }).then((r) => r.data),
  // Admin
  all: (params) => client.get('/orders/admin/all', { params }).then((r) => r.data),
  updateStatus: (id, status, note) => client.patch(`/orders/${id}/status`, { status, note }).then((r) => r.data),
}
