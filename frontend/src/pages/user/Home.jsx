import { ArrowRight, Bike, Brain, Clock, Database, Filter } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DishCard from '../../components/food/DishCard'
import FoodImage from '../../components/food/FoodImage'
import RestaurantCard, { DishCardSkeleton, RestaurantCardSkeleton } from '../../components/food/RestaurantCard'
import SmartSearchBox from '../../components/food/SmartSearchBox'
import Button from '../../components/ui/Button'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { ErrorState } from '../../components/ui/States'
import { useAsync } from '../../hooks/useAsync'
import { dishApi } from '../../services/api/dishApi'
import { restaurantApi } from '../../services/api/restaurantApi'
import { SEARCH_EXAMPLES } from '../../services/api/searchApi'

const HERO_IMAGE = 'https://www.themealdb.com/images/media/meals/qqlwv91763501559.jpg'

/** Small hand-drawn squiggle, echoing the playful doodle in the design reference. */
function Squiggle({ className }) {
  return (
    <svg viewBox="0 0 80 60" fill="none" className={className} aria-hidden>
      <path
        d="M8 44c10-2 18-12 14-20-3-6-12-3-9 4 4 9 21 8 27-2 5-8-2-17-8-12-6 5 2 18 14 17 9-1 17-9 22-17"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function Hero() {
  return (
    <section className="container-page pt-4 sm:pt-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-surface via-surface to-brand-50/60 px-6 py-12 sm:px-10 lg:rounded-[2.5rem] lg:px-16 lg:py-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          {/* Copy + search */}
          <div className="relative">
            <Squiggle className="absolute -top-8 left-40 hidden h-12 w-16 text-nonveg/70 sm:block" />
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft">
              <Bike className="size-4 text-brand-600" aria-hidden /> Delivered in about 30 minutes
            </span>
            <h1 className="mt-6 text-[2.4rem] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl xl:text-[3.25rem]">
              Describe your craving.
              <br />
              <span className="text-brand-700">We'll bring it over.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink-soft sm:text-lg">
              Tell STEWARD what you're in the mood for, in your own words, and we'll find the right dish from
              kitchens near you.
            </p>

            <SmartSearchBox className="mt-8 max-w-xl" />
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Example searches">
              {SEARCH_EXAMPLES.slice(0, 3).map((q) => (
                <Link
                  key={q}
                  to={`/search?q=${encodeURIComponent(q)}`}
                  className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-brand-600/40 hover:text-brand-700"
                >
                  {q}
                </Link>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Button to="/restaurants" size="lg">Make an order</Button>
              <a href="#popular" className="group inline-flex items-center gap-2 font-semibold text-ink">
                Popular right now
                <ArrowRight className="size-5 text-brand-600 transition-transform group-hover:translate-x-1" aria-hidden />
              </a>
            </div>
          </div>

          {/* Bowl */}
          <div className="relative mx-auto w-full max-w-[30rem]">
            <div className="absolute inset-[6%] rounded-full bg-brand-100/50 blur-3xl" aria-hidden />
            <div className="relative aspect-square overflow-hidden rounded-full border-[10px] border-surface shadow-[0_30px_70px_rgba(27,27,24,0.14)]">
              <FoodImage src={HERO_IMAGE} alt="A bowl of Malabar prawn curry with fresh coriander and lime" className="size-full scale-[1.08] object-cover" />
            </div>
            <div className="absolute -left-2 top-[12%] flex items-center gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-[0_10px_30px_rgba(27,27,24,0.08)] backdrop-blur sm:-left-8">
              <FoodTypeIcon type="NON_VEG" />
              <div>
                <p className="text-sm font-semibold leading-tight text-ink">Malabar Prawn Curry</p>
                <p className="text-xs text-muted">Coastal Curry Co. · ₹399</p>
              </div>
            </div>
            <div className="absolute -right-1 bottom-[10%] flex items-center gap-2.5 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-[0_10px_30px_rgba(27,27,24,0.08)] backdrop-blur sm:-right-6">
              <span className="grid size-9 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Clock className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight text-ink">40 min</p>
                <p className="text-xs text-muted">to your door</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-sm font-semibold text-brand-700">{eyebrow}</p>}
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[1.7rem]">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function PopularDishes() {
  const [type, setType] = useState('ALL')
  const { data, loading, error, reload } = useAsync(() => dishApi.forYou(12), [])
  const items = useMemo(
    () => (data?.items || []).filter((d) => type === 'ALL' || d.food_type === type).slice(0, 8),
    [data, type],
  )

  return (
    <section id="popular" className="container-page scroll-mt-24 pt-20">
      <SectionHeader
        eyebrow={data?.reason || 'Popular right now'}
        title="Dishes people love"
        action={
          <SegmentedControl
            label="Filter by food type"
            value={type}
            onChange={setType}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'VEG', label: 'Veg', icon: <FoodTypeIcon type="VEG" /> },
              { value: 'NON_VEG', label: 'Non-veg', icon: <FoodTypeIcon type="NON_VEG" /> },
            ]}
          />
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }, (_, i) => <DishCardSkeleton key={i} />)
            : items.map((d) => <DishCard key={d.id} dish={d} />)}
          {!loading && items.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted">No dishes match this filter yet.</p>
          )}
        </div>
      )}
    </section>
  )
}

function FoodTypeDiscovery() {
  const tiles = [
    {
      type: 'VEG', title: 'Vegetarian favourites', text: 'Paneer, dals, salads and wood-fired pizzas.',
      to: '/search?q=popular%20vegetarian%20dishes&food_type=VEG', tone: 'bg-brand-50 border-brand-100',
    },
    {
      type: 'NON_VEG', title: 'Non-veg classics', text: 'Biryanis, tandoor grills, seafood curries.',
      to: '/search?q=popular%20chicken%20mutton%20and%20seafood&food_type=NON_VEG', tone: 'bg-[#fbf3ef] border-[#f3e2d9]',
    },
  ]
  return (
    <section className="container-page pt-20">
      <div className="grid gap-5 md:grid-cols-2">
        {tiles.map(({ type, title, text, to, tone }) => (
          <Link
            key={type}
            to={to}
            className={`group flex items-center justify-between gap-6 rounded-card border p-7 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(27,27,24,0.06)] ${tone}`}
          >
            <div>
              <FoodTypeIcon type={type} withLabel />
              <h3 className="mt-3 text-xl font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{text}</p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink transition-transform group-hover:translate-x-1">
              <ArrowRight className="size-5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function FeaturedRestaurants() {
  const { data, loading, error, reload } = useAsync(() => restaurantApi.list({ sort: 'rating', limit: 6 }), [])
  return (
    <section className="container-page pt-20">
      <SectionHeader
        eyebrow="Kitchens near you"
        title="Featured restaurants"
        action={
          <Link to="/restaurants" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            View all <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }, (_, i) => <RestaurantCardSkeleton key={i} />)
            : data.items.map((r) => <RestaurantCard key={r.id} restaurant={r} />)}
        </div>
      )}
    </section>
  )
}

function HowSearchWorks() {
  const steps = [
    { icon: Brain, title: 'Understands your words', text: 'Your request becomes a 384-dimension meaning vector using a local language model.' },
    { icon: Database, title: 'Finds similar dishes', text: 'PostgreSQL + pgvector compares it with every dish by cosine similarity.' },
    { icon: Filter, title: 'Respects your limits', text: 'Price, veg/non-veg, spice and availability are applied as exact SQL filters.' },
  ]
  return (
    <section className="container-page pt-20">
      <div className="rounded-[2rem] bg-ink px-6 py-12 text-white sm:px-12">
        <p className="text-sm font-semibold text-brand-100/80">Smart search</p>
        <h2 className="mt-1 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">Search the way you talk, not with keywords.</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <div key={title}>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-white/10">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs font-semibold text-white/50">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/65">{text}</p>
            </div>
          ))}
        </div>
        <Button to="/search" variant="secondary" className="mt-10 border-transparent">Try smart search</Button>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <>
      <Hero />
      <PopularDishes />
      <FoodTypeDiscovery />
      <FeaturedRestaurants />
      <HowSearchWorks />
    </>
  )
}
