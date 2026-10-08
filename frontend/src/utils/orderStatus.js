import { Bike, Check, ChefHat, PackageCheck, Receipt, ShoppingBag, XCircle } from 'lucide-react'

export const STATUS_META = {
  PLACED: { label: 'Awaiting payment', tone: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Receipt },
  CONFIRMED: { label: 'Confirmed', tone: 'bg-brand-50 text-brand-800 ring-brand-100', icon: Check },
  PREPARING: { label: 'Preparing', tone: 'bg-brand-50 text-brand-800 ring-brand-100', icon: ChefHat },
  READY: { label: 'Ready for pickup', tone: 'bg-brand-50 text-brand-800 ring-brand-100', icon: ShoppingBag },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'bg-sky-50 text-sky-800 ring-sky-100', icon: Bike },
  DELIVERED: { label: 'Delivered', tone: 'bg-ink/5 text-ink ring-line', icon: PackageCheck },
  CANCELLED: { label: 'Cancelled', tone: 'bg-ink/5 text-muted ring-line', icon: XCircle },
  FAILED: { label: 'Payment failed', tone: 'bg-nonveg/8 text-nonveg ring-nonveg/20', icon: XCircle },
}

export const isActive = (status) => !['DELIVERED', 'CANCELLED', 'FAILED'].includes(status)
