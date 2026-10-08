import client from './client'

export const authApi = {
  requestOtp: (phone) => client.post('/auth/otp/request', { phone }).then((r) => r.data),
  verifyOtp: (phone, otp, fullName) =>
    client.post('/auth/otp/verify', { phone, otp, full_name: fullName || null }).then((r) => r.data),
  google: (credential) => client.post('/auth/google', { credential }).then((r) => r.data),
  adminLogin: (email, password) => client.post('/auth/admin/login', { email, password }).then((r) => r.data),
  me: () => client.get('/users/me').then((r) => r.data),
  updateMe: (data) => client.patch('/users/me', data).then((r) => r.data),
  myActivity: (limit = 20) => client.get('/users/me/activity', { params: { limit } }).then((r) => r.data),
}
