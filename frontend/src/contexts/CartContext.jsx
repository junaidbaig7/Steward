import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'

const CART_KEY = 'steward.cart'
const MAX_QTY = 50
const EMPTY = { restaurant: null, items: [] }
const CartContext = createContext(null)

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || EMPTY
  } catch {
    return EMPTY
  }
}

/**
 * Cart = items from ONE restaurant (an order is placed with a single kitchen).
 * Prices here are for display only — the Order Service re-prices everything
 * from the database at checkout.
 */
export function CartProvider({ children }) {
  const [cart, setCart] = useState(readCart)
  const [pending, setPending] = useState(null) // dish waiting for "replace cart?" confirmation

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart))
    } catch {
      /* storage unavailable (private mode) — cart still works in memory */
    }
  }, [cart])

  const put = useCallback((dish, quantity, base) => {
    setCart((current) => {
      const start = base ?? current
      const restaurant = { id: dish.restaurant_id, name: dish.restaurant_name }
      const existing = start.items.find((i) => i.dish_id === dish.id)
      const limit = Math.min(MAX_QTY, dish.stock ?? MAX_QTY)
      const qty = Math.min(limit, (existing?.quantity || 0) + quantity)
      const item = {
        dish_id: dish.id, name: dish.name, price: Number(dish.price), food_type: dish.food_type,
        image_url: dish.image_url, stock: dish.stock, quantity: qty,
      }
      const items = existing
        ? start.items.map((i) => (i.dish_id === dish.id ? item : i))
        : [...start.items, item]
      return { restaurant, items }
    })
  }, [])

  const addItem = useCallback(
    (dish, quantity = 1) => {
      if (cart.restaurant && cart.items.length && cart.restaurant.id !== dish.restaurant_id) {
        setPending({ dish, quantity })
        return false
      }
      put(dish, quantity)
      return true
    },
    [cart, put],
  )

  const setQuantity = useCallback((dishId, quantity) => {
    setCart((c) => {
      const items = quantity <= 0
        ? c.items.filter((i) => i.dish_id !== dishId)
        : c.items.map((i) => (i.dish_id === dishId ? { ...i, quantity: Math.min(quantity, i.stock ?? MAX_QTY, MAX_QTY) } : i))
      return items.length ? { ...c, items } : EMPTY
    })
  }, [])

  const clear = useCallback(() => setCart(EMPTY), [])

  const value = useMemo(() => {
    const count = cart.items.reduce((n, i) => n + i.quantity, 0)
    const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0)
    const quantityOf = (dishId) => cart.items.find((i) => i.dish_id === dishId)?.quantity || 0
    return { ...cart, count, subtotal, quantityOf, addItem, setQuantity, clear }
  }, [cart, addItem, setQuantity, clear])

  return (
    <CartContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        size="sm"
        title="Start a new cart?"
        description={`Your cart has items from ${cart.restaurant?.name}. Orders are placed with one restaurant at a time.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>Keep current cart</Button>
            <Button
              onClick={() => {
                put(pending.dish, pending.quantity, EMPTY)
                setPending(null)
              }}
            >
              Start new cart
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Adding <span className="font-semibold text-ink">{pending?.dish.name}</span> from{' '}
          {pending?.dish.restaurant_name} will clear your current cart.
        </p>
      </Modal>
    </CartContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => useContext(CartContext)
