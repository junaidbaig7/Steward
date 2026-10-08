import { Flame, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCart } from '../../contexts/CartContext'
import { useToast } from '../../contexts/ToastContext'
import { cn } from '../../utils/cn'
import { formatPrice } from '../../utils/format'
import { sizedImage } from '../../utils/images'
import FoodTypeIcon from '../ui/FoodTypeIcon'
import QuantityStepper from '../ui/QuantityStepper'
import FoodImage from './FoodImage'

export function SpiceLevel({ level }) {
  if (!level) return null
  const label = ['', 'Mild', 'Spicy', 'Very spicy'][level]
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-warn" title={label}>
      {Array.from({ length: level }, (_, i) => (
        <Flame key={i} className="size-3 fill-current" aria-hidden />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  )
}

function AddControl({ dish, compact }) {
  const cart = useCart()
  const toast = useToast()
  const qty = cart.quantityOf(dish.id)

  if (!dish.in_stock) {
    return (
      <span className="inline-flex h-9 items-center rounded-full bg-ink/5 px-3.5 text-xs font-semibold text-muted">
        {dish.is_available ? 'Sold out' : 'Unavailable'}
      </span>
    )
  }
  if (qty > 0) {
    return <QuantityStepper size="sm" value={qty} max={dish.stock} label={dish.name} onChange={(n) => cart.setQuantity(dish.id, n)} />
  }
  return (
    <button
      type="button"
      onClick={() => cart.addItem(dish) && toast.success(`${dish.name} added to cart`)}
      className={cn(
        'inline-flex h-9 items-center gap-1 rounded-full border border-brand-600/30 bg-surface px-4 text-sm font-semibold text-brand-700',
        'transition-[background-color,transform] duration-150 hover:bg-brand-50 active:scale-95',
        compact && 'px-3',
      )}
      aria-label={`Add ${dish.name} to cart`}
    >
      <Plus className="size-4" aria-hidden /> Add
    </button>
  )
}

/** Grid card used for discovery, search results and recommendations. */
export default function DishCard({ dish, showRestaurant = true, score }) {
  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[border-color,box-shadow,transform] duration-200',
        'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_30px_rgba(27,27,24,0.07)]',
        !dish.in_stock && 'opacity-70',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-canvas">
        <FoodImage
          src={sizedImage(dish.image_url)}
          alt={dish.name}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {score != null && (
          <span className="absolute left-3 top-3 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
            {Math.round(score * 100)}% match
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          <FoodTypeIcon type={dish.food_type} />
          <SpiceLevel level={dish.spice_level} />
          {dish.category && <span className="ml-auto truncate text-xs text-muted">{dish.category}</span>}
        </div>
        <h3 className="mt-2 font-semibold leading-snug text-ink">{dish.name}</h3>
        {showRestaurant && dish.restaurant_name && (
          <Link
            to={`/restaurants/${dish.restaurant_id}`}
            className="mt-0.5 w-fit text-xs text-muted underline-offset-2 hover:text-brand-700 hover:underline"
          >
            {dish.restaurant_name}
          </Link>
        )}
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{dish.description}</p>
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="text-base font-bold text-ink">{formatPrice(dish.price)}</span>
          <AddControl dish={dish} compact />
        </div>
      </div>
    </article>
  )
}

/** Row layout for restaurant menus: details left, photo + add button right. */
export function DishRow({ dish }) {
  return (
    <article className={cn('flex gap-4 py-6 sm:gap-6', !dish.in_stock && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <FoodTypeIcon type={dish.food_type} />
          <SpiceLevel level={dish.spice_level} />
        </div>
        <h3 className="mt-1.5 font-semibold text-ink">{dish.name}</h3>
        <p className="mt-0.5 font-semibold text-ink-soft">{formatPrice(dish.price)}</p>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{dish.description}</p>
        {dish.in_stock && dish.stock <= 5 && (
          <p className="mt-2 text-xs font-medium text-warn">Only {dish.stock} left</p>
        )}
      </div>
      <div className="relative flex w-28 shrink-0 flex-col items-center sm:w-36">
        <FoodImage
          src={sizedImage(dish.image_url)}
          alt={dish.name}
          className="aspect-square w-full rounded-xl object-cover"
        />
        <div className="-mt-5">
          <div className="rounded-full bg-surface shadow-[0_4px_14px_rgba(27,27,24,0.1)]">
            <AddControl dish={dish} />
          </div>
        </div>
      </div>
    </article>
  )
}
