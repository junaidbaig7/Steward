import client from './client'

export const userApi = {
  customers: (params) => client.get('/users', { params }).then((r) => r.data),
}
