import axios from 'axios'

export const TOKEN_KEY = 'steward.token'

/** Single Axios instance — every request goes through the FastAPI API Gateway. */
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 30000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Normalise errors so components can always show `error.message`. */
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    let message = error.response?.data?.detail
    if (typeof message !== 'string') {
      message = !error.response
        ? 'Cannot reach the server. Check your connection and try again.'
        : 'Something went wrong. Please try again.'
    }
    if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
      // Expired/invalid session: let AuthContext react.
      window.dispatchEvent(new CustomEvent('steward:unauthorized'))
    }
    return Promise.reject(Object.assign(new Error(message), { status }))
  },
)

export default client
