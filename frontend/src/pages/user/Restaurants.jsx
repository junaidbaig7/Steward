import { Search, Store } from 'lucide-react'
import { useState } from 'react'
import RestaurantCard, { RestaurantCardSkeleton } from '../../components/food/RestaurantCard'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { useAsync } from '../../hooks/useAsync'
import { useDebounce } from '../../hooks/useDebounce'
import { restaurantApi } from '../../services/api/restaurantApi'
import { cn } from '../../utils/cn'

export default function Restaurants() {
  const [search, setSearch] = useState('')
  const [pureVeg, setPureVeg] = useState(false)
  const [sort, setSort] = useState('rating')
  const q = useDebounce(search, 300)

  const { data, loading, error, reload } = useAsync(
    () => restaurantApi.list({ search: q || undefined, pure_veg: pureVeg || undefined, sort }),
    [q, pureVeg, sort],
  )

  return (
    <div className="container-page pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Restaurants</h1>
      <p className="mt-1.5 text-muted">Neighbourhood kitchens delivering across Bengaluru.</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or cuisine"
            aria-label="Search restaurants"
            className="h-11 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10"
          />
        </div>
        <button
          type="button"
          onClick={() => setPureVeg((v) => !v)}
          aria-pressed={pureVeg}
          className={cn(
            'inline-flex h-11 items-center gap-2 self-start rounded-full border px-4 text-sm font-medium transition-colors sm:self-auto',
            pureVeg ? 'border-veg bg-brand-50 text-veg' : 'border-line-strong bg-surface text-ink-soft hover:border-ink/30',
          )}
        >
          <FoodTypeIcon type="VEG" /> Pure veg
        </button>
        <SegmentedControl
          className="sm:ml-auto"
          label="Sort restaurants"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'rating', label: 'Top rated' },
            { value: 'delivery_time', label: 'Fastest' },
            { value: 'name', label: 'A–Z' },
          ]}
        />
      </div>

      <div className="mt-10">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <RestaurantCardSkeleton key={i} />)}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Store} title="No restaurants found" description="Try a different name or cuisine." />
        ) : (
          <>
            <p className="mb-5 text-sm text-muted" aria-live="polite">{data.total} restaurant{data.total === 1 ? '' : 's'}</p>
            <div className={cn('grid gap-x-6 gap-y-10 transition-opacity sm:grid-cols-2 lg:grid-cols-3', loading && 'opacity-60')}>
              {data.items.map((r) => <RestaurantCard key={r.id} restaurant={r} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
