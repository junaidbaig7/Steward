import { ArrowLeft, Clock, IndianRupee, MapPin, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DishRow } from '../../components/food/DishCard'
import FoodImage from '../../components/food/FoodImage'
import ReviewsSection from '../../components/food/ReviewsSection'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import { RatingBadge } from '../../components/ui/Rating'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useAsync } from '../../hooks/useAsync'
import { restaurantApi } from '../../services/api/restaurantApi'
import { cn } from '../../utils/cn'
import { formatPrice } from '../../utils/format'
import { sizedImage } from '../../utils/images'
import CartSummaryBar from '../../components/food/CartSummaryBar'

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <Skeleton className="aspect-[16/10] w-full rounded-card sm:w-72" />
      <div className="flex-1 space-y-3 pt-2">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

export default function RestaurantDetail() {
  const { ref } = useParams()
  const [foodType, setFoodType] = useState('ALL')
  const [category, setCategory] = useState('ALL')

  const restaurant = useAsync(() => restaurantApi.get(ref), [ref])
  const menu = useAsync(
    () => (restaurant.data ? restaurantApi.menu(restaurant.data.id) : Promise.resolve(null)),
    [restaurant.data?.id],
  )

  const dishes = useMemo(() => menu.data?.items || [], [menu.data])
  const categories = useMemo(() => [...new Set(dishes.map((d) => d.category))], [dishes])
  const visible = dishes.filter(
    (d) => (foodType === 'ALL' || d.food_type === foodType) && (category === 'ALL' || d.category === category),
  )
  const grouped = categories
    .map((c) => ({ name: c, items: visible.filter((d) => d.category === c) }))
    .filter((g) => g.items.length)

  if (restaurant.error) {
    return (
      <div className="container-page pt-10">
        <ErrorState error={restaurant.error} onRetry={restaurant.reload} />
      </div>
    )
  }
  const r = restaurant.data

  return (
    <div className="container-page pt-6 pb-24">
      <Link to="/restaurants" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All restaurants
      </Link>

      <div className="mt-6">
        {!r ? (
          <HeaderSkeleton />
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <FoodImage src={sizedImage(r.image_url, 'large')} alt={r.name} className="aspect-[16/10] w-full rounded-card object-cover sm:w-72" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-extrabold tracking-tight text-ink">{r.name}</h1>
                <RatingBadge rating={r.avg_rating} count={r.review_count} />
              </div>
              <p className="mt-1 text-muted">{r.cuisine}</p>
              {r.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{r.description}</p>}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-muted" aria-hidden /> {r.avg_delivery_minutes} min</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-muted" aria-hidden /> {r.address}, {r.city}</span>
                <span className="inline-flex items-center gap-1.5">
                  <IndianRupee className="size-4 text-muted" aria-hidden />
                  {Number(r.delivery_fee) ? `${formatPrice(r.delivery_fee)} delivery` : 'Free delivery'}
                  {Number(r.min_order_amount) > 0 && ` · min ${formatPrice(r.min_order_amount)}`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky menu filters */}
      <div className="sticky top-16 z-30 -mx-4 mt-10 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Filter menu by food type"
            value={foodType}
            onChange={setFoodType}
            size="sm"
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'VEG', label: 'Veg', icon: <FoodTypeIcon type="VEG" /> },
              { value: 'NON_VEG', label: 'Non-veg', icon: <FoodTypeIcon type="NON_VEG" /> },
            ]}
          />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="tablist" aria-label="Menu categories">
            {['ALL', ...categories].map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors',
                  category === c ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-600/30' : 'text-ink-soft hover:bg-ink/5',
                )}
              >
                {c === 'ALL' ? 'Full menu' : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
        <div>
          {menu.loading || !r ? (
            <div className="divide-y divide-line">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex gap-6 py-6">
                  <div className="flex-1 space-y-2.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-2/3" /></div>
                  <Skeleton className="size-28 rounded-xl sm:size-36" />
                </div>
              ))}
            </div>
          ) : menu.error ? (
            <ErrorState error={menu.error} onRetry={menu.reload} />
          ) : grouped.length === 0 ? (
            <EmptyState icon={UtensilsCrossed} title="Nothing here" description="No dishes match these filters." />
          ) : (
            grouped.map((g) => (
              <section key={g.name} className="pt-8" aria-labelledby={`cat-${g.name}`}>
                <h2 id={`cat-${g.name}`} className="text-lg font-bold text-ink">
                  {g.name} <span className="text-sm font-medium text-muted">({g.items.length})</span>
                </h2>
                <div className="divide-y divide-line">
                  {g.items.map((d) => <DishRow key={d.id} dish={d} />)}
                </div>
              </section>
            ))
          )}
        </div>
        {r && (
          <aside className="pt-8 lg:sticky lg:top-36 lg:self-start">
            <ReviewsSection restaurant={r} />
          </aside>
        )}
      </div>
      <CartSummaryBar />
    </div>
  )
}
