import client from './client'

export const reviewApi = {
  list: (restaurantId, params) => client.get('/reviews', { params: { restaurant_id: restaurantId, ...params } }).then((r) => r.data),
  summary: (restaurantId) => client.get(`/reviews/restaurants/${restaurantId}/summary`).then((r) => r.data),
  rankings: () => client.get('/reviews/rankings').then((r) => r.data),
  mine: () => client.get('/reviews/mine').then((r) => r.data),
  forOrder: (orderId) => client.get(`/reviews/orders/${orderId}`).then((r) => r.data),
  create: (data) => client.post('/reviews', data).then((r) => r.data),
  update: (id, data) => client.patch(`/reviews/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/reviews/${id}`),
  // Admin
  all: (params) => client.get('/reviews/admin/all', { params }).then((r) => r.data),
}
