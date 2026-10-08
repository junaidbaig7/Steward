import client from './client'

export const restaurantApi = {
  list: (params) => client.get('/restaurants', { params }).then((r) => r.data),
  get: (ref) => client.get(`/restaurants/${ref}`).then((r) => r.data),
  menu: (id, params) => client.get(`/restaurants/${id}/dishes`, { params }).then((r) => r.data),
  // Admin
  create: (data) => client.post('/restaurants', data).then((r) => r.data),
  update: (id, data) => client.patch(`/restaurants/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/restaurants/${id}`),
}
