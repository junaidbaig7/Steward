import { ArrowRight, ShoppingBag } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useCart } from '../../contexts/CartContext'
import { formatPrice } from '../../utils/format'

/** Floating bar that appears once the cart has items. Portalled to <body> so no
 *  animated/transformed ancestor can affect its fixed positioning. */
export default function CartSummaryBar() {
  const { count, subtotal, restaurant } = useCart()
  if (!count) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 sm:bottom-6">
      <Link
        to="/cart"
        className="pointer-events-auto flex w-full max-w-md items-center gap-4 rounded-full bg-brand-700 py-2.5 pl-3 pr-5 text-white shadow-[0_14px_40px_rgba(18,114,43,0.35)] transition-[background-color,transform] animate-fade-up hover:bg-brand-800 active:scale-[0.99]"
      >
        <span className="grid size-10 place-items-center rounded-full bg-white/15">
          <ShoppingBag className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {count} item{count > 1 ? 's' : ''} · {formatPrice(subtotal)}
          </span>
          <span className="block truncate text-xs text-white/75">from {restaurant?.name}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold">
          View cart <ArrowRight className="size-4" aria-hidden />
        </span>
      </Link>
    </div>,
    document.body,
  )
}
