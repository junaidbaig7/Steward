import client from './client'

export const dishApi = {
  browse: (params) => client.get('/dishes', { params }).then((r) => r.data),
  get: (id) => client.get(`/dishes/${id}`).then((r) => r.data),
  categories: () => client.get('/categories').then((r) => r.data),
  similar: (id, limit = 6) => client.get(`/recommendations/similar/${id}`, { params: { limit } }).then((r) => r.data),
  forYou: (limit = 8) => client.get('/recommendations/for-you', { params: { limit } }).then((r) => r.data),
  // Admin
  create: (restaurantId, data) => client.post(`/restaurants/${restaurantId}/dishes`, data).then((r) => r.data),
  update: (id, data) => client.patch(`/dishes/${id}`, data).then((r) => r.data),
  updateStock: (id, data) => client.patch(`/dishes/${id}/stock`, data).then((r) => r.data),
  remove: (id) => client.delete(`/dishes/${id}`),
}
