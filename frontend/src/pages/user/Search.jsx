import { ChevronDown, Code2, SearchX, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DishCard from '../../components/food/DishCard'
import { DishCardSkeleton } from '../../components/food/RestaurantCard'
import SmartSearchBox from '../../components/food/SmartSearchBox'
import Button from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { useAsync } from '../../hooks/useAsync'
import { dishApi } from '../../services/api/dishApi'
import { restaurantApi } from '../../services/api/restaurantApi'
import { SEARCH_EXAMPLES, searchApi } from '../../services/api/searchApi'
import { cn } from '../../utils/cn'
import { formatPrice } from '../../utils/format'

const PRICE_OPTIONS = [150, 200, 250, 300, 400, 500]
const FILTER_KEYS = ['food_type', 'max_price', 'category_id', 'restaurant_id', 'include_unavailable', 'ignore']

/** URL ⇄ filters. Choosing "Any" for something the query implied adds it to `ignore`. */
function useSearchState() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const ignore = new Set((params.get('ignore') || '').split(',').filter(Boolean))

  const update = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)))
    setParams(next)
  }
  const setFilter = (param, ignoreKey, value) => {
    const nextIgnore = new Set(ignore)
    if (value === null) nextIgnore.add(ignoreKey)
    else nextIgnore.delete(ignoreKey)
    update({ [param]: value, ignore: [...nextIgnore].join(',') })
  }
  const newQuery = (text) => {
    const next = new URLSearchParams({ q: text })
    setParams(next)
  }
  const apiParams = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || undefined]))
  return { q, ignore, params, apiParams, update, setFilter, newQuery }
}

function UnderstoodAs({ interpreted, onRemove }) {
  const [open, setOpen] = useState(false)
  if (!interpreted) return null
  const f = interpreted.applied_filters
  const sqlLines = [
    f.food_type && `d.food_type = '${f.food_type}'`,
    f.min_price != null && `d.price >= ${f.min_price}`,
    f.max_price != null && `d.price <= ${f.max_price}`,
    f.min_spice != null && `d.spice_level >= ${f.min_spice}`,
    f.max_spice != null && `d.spice_level <= ${f.max_spice}`,
    f.category_id && `d.category_id = ${f.category_id}`,
    f.restaurant_id && `d.restaurant_id = ${f.restaurant_id}`,
    f.available_only && 'd.is_available AND d.stock > 0',
  ].filter(Boolean)

  return (
    <div className="mt-5 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Understood as</span>
        <span className="rounded-full bg-ink/5 px-3 py-1 text-sm font-medium text-ink">“{interpreted.semantic_text}”</span>
        {interpreted.detected.map((d) => (
          <span
            key={d.key}
            className="inline-flex items-center gap-1 rounded-full border border-brand-600/25 bg-brand-50 py-1 pl-3 pr-1.5 text-sm font-medium text-brand-800"
            title={`Detected from “${d.source}”`}
          >
            {d.label}
            <button
              onClick={() => onRemove(d.key)}
              className="grid size-5 place-items-center rounded-full hover:bg-brand-100"
              aria-label={`Remove ${d.label} filter`}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
          aria-expanded={open}
        >
          <Code2 className="size-3.5" aria-hidden /> How this search works
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-4 rounded-xl border border-line bg-surface p-4 text-xs animate-scale-in md:grid-cols-3">
          <div>
            <p className="font-semibold text-ink">1 · Embedding</p>
            <p className="mt-1 text-muted">
              “{interpreted.semantic_text}” → 384-d vector with all-MiniLM-L6-v2 (cached in Redis).
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink">2 · pgvector + full-text</p>
            <p className="mt-1 text-muted">
              Rank by <code className="rounded bg-ink/5 px-1">1 − (embedding &lt;=&gt; query)</code>, blended 80/20 with
              keyword rank on: {interpreted.keywords.join(', ') || '—'}
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink">3 · SQL filters</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-soft">
              {sqlLines.length ? `WHERE ${sqlLines.join('\n  AND ')}` : 'No filters'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Search() {
  const s = useSearchState()
  const categories = useAsync(() => dishApi.categories(), [])
  const restaurants = useAsync(() => restaurantApi.list({ limit: 100 }), [])

  const key = s.params.toString()
  const search = useAsync(
    () => (s.q ? searchApi.semantic({ q: s.q, ...s.apiParams }) : Promise.resolve(null)),
    [key],
  )
  const data = search.data
  const applied = data?.interpreted.applied_filters
  const foodType = applied?.food_type || 'ALL'
  const maxPrice = applied?.max_price ?? ''
  const categoryId = applied?.category_id ?? ''

  const removeDetected = (k) => {
    const param = { price: 'max_price', food_type: 'food_type', category: 'category_id', spice: null }[k]
    s.setFilter(param || 'spice', k, null)
  }

  const resultsLabel = useMemo(() => {
    if (!data) return ''
    return `${data.total} dish${data.total === 1 ? '' : 'es'} · ${data.took_ms} ms`
  }, [data])

  return (
    <div className="container-page pt-10">
      <div className="max-w-3xl">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <Sparkles className="size-4" aria-hidden /> Smart search
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">What are you in the mood for?</h1>
        <p className="mt-1.5 text-muted">Describe it naturally — taste, ingredients, budget, veg or non-veg.</p>
        <SmartSearchBox key={s.q} initial={s.q} onSearch={s.newQuery} size="md" autoFocus={!s.q} className="mt-6" />
      </div>

      {!s.q ? (
        <div className="mt-10">
          <p className="text-sm font-medium text-ink-soft">Try one of these</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SEARCH_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => s.newQuery(ex)}
                className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink-soft transition-colors hover:border-brand-600/40 hover:text-brand-700"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <UnderstoodAs interpreted={data?.interpreted} onRemove={removeDetected} />

          {/* Structured filters */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-y border-line py-4">
            <SegmentedControl
              label="Food type"
              size="sm"
              value={foodType}
              onChange={(v) => s.setFilter('food_type', 'food_type', v === 'ALL' ? null : v)}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'VEG', label: 'Veg', icon: <FoodTypeIcon type="VEG" /> },
                { value: 'NON_VEG', label: 'Non-veg', icon: <FoodTypeIcon type="NON_VEG" /> },
              ]}
            />
            <Select
              aria-label="Maximum price"
              className="h-9 w-auto rounded-full text-xs"
              value={maxPrice}
              onChange={(e) => s.setFilter('max_price', 'price', e.target.value || null)}
            >
              <option value="">Any price</option>
              {[...new Set([...PRICE_OPTIONS, ...(maxPrice ? [Number(maxPrice)] : [])])].sort((a, b) => a - b).map((p) => (
                <option key={p} value={p}>Under {formatPrice(p)}</option>
              ))}
            </Select>
            <Select
              aria-label="Category"
              className="h-9 w-auto rounded-full text-xs"
              value={categoryId}
              onChange={(e) => s.setFilter('category_id', 'category', e.target.value || null)}
            >
              <option value="">All categories</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select
              aria-label="Restaurant"
              className="h-9 w-auto rounded-full text-xs"
              value={s.params.get('restaurant_id') || ''}
              onChange={(e) => s.update({ restaurant_id: e.target.value || null })}
            >
              <option value="">All restaurants</option>
              {restaurants.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-soft">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={s.params.get('include_unavailable') === 'true'}
                onChange={(e) => s.update({ include_unavailable: e.target.checked ? 'true' : null })}
              />
              Include sold out
            </label>
            <span className="ml-auto text-xs text-muted" aria-live="polite">{resultsLabel}</span>
          </div>

          <div className="mt-8">
            {search.error ? (
              <ErrorState error={search.error} onRetry={search.reload} />
            ) : search.loading ? (
              <>
                <p className="mb-5 inline-flex items-center gap-2 text-sm text-muted">
                  <Sparkles className="size-4 animate-pulse text-brand-600" aria-hidden /> Understanding your request…
                </p>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 8 }, (_, i) => <DishCardSkeleton key={i} />)}
                </div>
              </>
            ) : data?.items.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No dishes matched"
                description="Try removing a filter above, or describe it differently."
                action={<Button variant="secondary" onClick={() => s.newQuery(s.q)}>Reset filters</Button>}
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {data?.items.map((d, i) => (
                  <div key={d.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                    <DishCard dish={d} score={d.similarity} />
                  </div>
                ))}
              </div>
            )}
          </div>
          {data?.items.length > 0 && (
            <p className="mt-10 text-center text-sm text-muted">
              Not quite it? <Link to="/restaurants" className="font-semibold text-ink hover:text-brand-700">Browse all restaurants</Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}
