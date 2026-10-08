const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const inrRound = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** 1249 → "₹1,249", 99.5 → "₹99.50" */
export function formatPrice(value) {
  const n = Number(value || 0)
  return Number.isInteger(n) ? inrRound.format(n) : inr.format(n)
}

/** Compact currency for dashboards: 125000 → "₹1.25L" */
export function formatCompactPrice(value) {
  const n = Number(value || 0)
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`
  return formatPrice(n)
}

export function formatDate(value, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return value ? new Date(value).toLocaleDateString('en-IN', opts) : ''
}

export function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : ''
}

export function timeAgo(value) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size)
    if (n >= 1) return `${n} ${unit}${n > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

export const titleCase = (s = '') => s.toLowerCase().replace(/(^|_|\s)\w/g, (m) => m.replace('_', ' ').toUpperCase())

/** '2026-09' → 'Sep 26' */
export const monthLabel = (m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
