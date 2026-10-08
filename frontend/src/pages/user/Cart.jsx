import { ArrowRight, ShoppingBag, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import DishCard from '../../components/food/DishCard'
import FoodImage from '../../components/food/FoodImage'
import Button from '../../components/ui/Button'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import QuantityStepper from '../../components/ui/QuantityStepper'
import { EmptyState } from '../../components/ui/States'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import { useAsync } from '../../hooks/useAsync'
import { dishApi } from '../../services/api/dishApi'
import { restaurantApi } from '../../services/api/restaurantApi'
import { formatPrice } from '../../utils/format'
import { sizedImage } from '../../utils/images'
import { estimateBill } from '../../utils/pricing'

export function BillRows({ bill }) {
  const rows = [
    ['Item total', bill.subtotal],
    ['Delivery fee', bill.deliveryFee],
    ['GST (5%)', bill.tax],
  ]
  return (
    <dl className="space-y-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between text-ink-soft">
          <dt>{label}</dt>
          <dd className="tabular-nums">{value === 0 && label === 'Delivery fee' ? 'Free' : formatPrice(value)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-dashed border-line-strong pt-3 text-base font-bold text-ink">
        <dt>To pay</dt>
        <dd className="tabular-nums">{formatPrice(bill.total)}</dd>
      </div>
    </dl>
  )
}

function YouMayAlsoLike({ items, restaurantId }) {
  const firstId = items[0]?.dish_id
  const inCart = useMemo(() => new Set(items.map((i) => i.dish_id)), [items])
  const { data } = useAsync(() => (firstId ? dishApi.similar(firstId, 12) : Promise.resolve(null)), [firstId])
  const picks = (data?.items || []).filter((d) => d.restaurant_id === restaurantId && !inCart.has(d.id)).slice(0, 3)
  if (!picks.length) return null
  return (
    <section className="mt-14">
      <h2 className="text-lg font-bold text-ink">You may also like</h2>
      <p className="mt-0.5 text-sm text-muted">Similar dishes from the same kitchen</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {picks.map((d) => <DishCard key={d.id} dish={d} showRestaurant={false} />)}
      </div>
    </section>
  )
}

export default function Cart() {
  const cart = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: restaurant } = useAsync(
    () => (cart.restaurant ? restaurantApi.get(cart.restaurant.id) : Promise.resolve(null)),
    [cart.restaurant?.id],
  )

  if (!cart.count) {
    return (
      <div className="container-page pt-10">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Find something you'll love — try describing your craving in smart search."
          action={<Button to="/restaurants">Browse restaurants</Button>}
        />
      </div>
    )
  }

  const bill = estimateBill(cart.subtotal, restaurant?.delivery_fee)
  const belowMinimum = restaurant && cart.subtotal < Number(restaurant.min_order_amount)

  const checkout = () => (user ? navigate('/checkout') : navigate('/login', { state: { from: '/checkout' } }))

  return (
    <div className="container-page pt-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Your cart</h1>
      <p className="mt-1 text-muted">
        From{' '}
        <Link to={`/restaurants/${cart.restaurant.id}`} className="font-semibold text-ink hover:text-brand-700">
          {cart.restaurant.name}
        </Link>
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="h-fit divide-y divide-line rounded-card border border-line bg-surface px-5">
          {cart.items.map((item) => (
            <li key={item.dish_id} className="flex items-center gap-4 py-5 animate-fade-in">
              <FoodImage src={sizedImage(item.image_url, 'small')} alt={item.name} className="size-16 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FoodTypeIcon type={item.food_type} />
                  <p className="truncate font-semibold text-ink">{item.name}</p>
                </div>
                <p className="mt-0.5 text-sm text-muted">{formatPrice(item.price)} each</p>
              </div>
              <QuantityStepper size="sm" value={item.quantity} max={item.stock} label={item.name} onChange={(n) => cart.setQuantity(item.dish_id, n)} />
              <p className="w-20 text-right font-semibold tabular-nums text-ink">{formatPrice(item.price * item.quantity)}</p>
              <button
                onClick={() => cart.setQuantity(item.dish_id, 0)}
                className="rounded-full p-2 text-muted transition-colors hover:bg-nonveg/5 hover:text-nonveg"
                aria-label={`Remove ${item.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-card border border-line bg-surface p-6 lg:sticky lg:top-24">
          <h2 className="font-bold text-ink">Bill details</h2>
          <div className="mt-5"><BillRows bill={bill} /></div>
          {belowMinimum && (
            <p className="mt-4 rounded-lg bg-warn/8 px-3 py-2 text-xs text-warn">
              Add {formatPrice(Number(restaurant.min_order_amount) - cart.subtotal)} more to reach this restaurant's minimum order.
            </p>
          )}
          <Button className="mt-6 w-full" size="lg" onClick={checkout} disabled={belowMinimum}>
            {user ? 'Proceed to checkout' : 'Sign in to checkout'} <ArrowRight className="size-4" aria-hidden />
          </Button>
          <button onClick={cart.clear} className="mt-3 w-full text-center text-xs font-medium text-muted hover:text-nonveg">
            Clear cart
          </button>
        </aside>
      </div>

      <YouMayAlsoLike items={cart.items} restaurantId={cart.restaurant.id} />
    </div>
  )
}
