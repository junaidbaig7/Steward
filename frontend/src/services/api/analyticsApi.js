import client from './client'

export const analyticsApi = {
  overview: () => client.get('/analytics/admin/overview').then((r) => r.data),
  revenue: (params) => client.get('/analytics/admin/revenue', { params }).then((r) => r.data),
  restaurants: () => client.get('/analytics/admin/restaurants').then((r) => r.data),
  restaurant: (id) => client.get(`/analytics/admin/restaurants/${id}`).then((r) => r.data),
  topDishes: (params) => client.get('/analytics/admin/top-dishes', { params }).then((r) => r.data),
  me: () => client.get('/analytics/me').then((r) => r.data),
}
