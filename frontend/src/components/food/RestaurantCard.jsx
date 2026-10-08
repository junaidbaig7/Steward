import { Clock, Leaf } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../../utils/format'
import { sizedImage } from '../../utils/images'
import { RatingBadge } from '../ui/Rating'
import { Skeleton } from '../ui/States'
import FoodImage from './FoodImage'

export default function RestaurantCard({ restaurant: r }) {
  const pureVeg = r.dish_count > 0 && r.veg_count === r.dish_count
  return (
    <Link
      to={`/restaurants/${r.slug}`}
      className="group block rounded-card focus-visible:outline-offset-4"
      aria-label={`${r.name}, ${r.cuisine}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-canvas">
        <FoodImage
          src={sizedImage(r.image_url, 'large')}
          alt=""
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {pureVeg && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold text-veg">
            <Leaf className="size-3.5" aria-hidden /> Pure veg
          </span>
        )}
      </div>
      <div className="mt-3 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-ink transition-colors group-hover:text-brand-700">{r.name}</h3>
          <RatingBadge rating={r.avg_rating} count={r.review_count} />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{r.cuisine}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5 text-muted" aria-hidden /> {r.avg_delivery_minutes} min
          </span>
          <span className="size-1 rounded-full bg-line-strong" aria-hidden />
          <span>{Number(r.delivery_fee) === 0 ? 'Free delivery' : `${formatPrice(r.delivery_fee)} delivery`}</span>
          {!r.is_active && <span className="rounded bg-ink/5 px-1.5 py-0.5 font-medium text-muted">Inactive</span>}
        </div>
      </div>
    </Link>
  )
}

export function RestaurantCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[16/10] w-full rounded-card" />
      <Skeleton className="mt-3 h-4 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  )
}

export function DishCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  )
}
