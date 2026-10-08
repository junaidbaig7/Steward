import { Minus, Pencil, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SpiceLevel } from '../../components/food/DishCard'
import FoodImage from '../../components/food/FoodImage'
import Button from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import FoodTypeIcon from '../../components/ui/FoodTypeIcon'
import Modal from '../../components/ui/Modal'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import Toggle from '../../components/ui/Toggle'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { useDebounce } from '../../hooks/useDebounce'
import { PageHeader } from '../../layouts/AdminLayout'
import { dishApi } from '../../services/api/dishApi'
import { restaurantApi } from '../../services/api/restaurantApi'
import { cn } from '../../utils/cn'
import { formatPrice } from '../../utils/format'
import { sizedImage } from '../../utils/images'

const EMPTY = {
  restaurant_id: '', category_id: '', name: '', description: '', ingredients: '', food_type: 'VEG',
  spice_level: 0, price: '', stock: 20, image_url: '', is_available: true,
}

function DishForm({ initial, restaurants, categories, defaultRestaurant, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(
    initial
      ? { ...EMPTY, ...initial, image_url: initial.image_url || '' }
      : { ...EMPTY, restaurant_id: defaultRestaurant || '', category_id: categories[0]?.id || '' },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      name: form.name.trim(), description: form.description, ingredients: form.ingredients,
      category_id: Number(form.category_id), food_type: form.food_type, spice_level: Number(form.spice_level),
      price: Number(form.price), stock: Number(form.stock), image_url: form.image_url.trim() || null, is_available: form.is_available,
    }
    try {
      const saved = initial ? await dishApi.update(initial.id, payload) : await dishApi.create(Number(form.restaurant_id), payload)
      toast.success(initial ? 'Dish updated' : `${saved.name} added — it's now searchable`)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={initial ? `Edit ${initial.name}` : 'Add dish'}
      description="Saving recomputes the dish's embedding so smart search finds it straight away."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="dish-form" type="submit" loading={busy}>{initial ? 'Save changes' : 'Add dish'}</Button></>}
    >
      <form id="dish-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {!initial && (
          <Field label="Restaurant" htmlFor="d-rest" className="sm:col-span-2">
            <Select id="d-rest" value={form.restaurant_id} onChange={set('restaurant_id')} required>
              <option value="" disabled>Choose a restaurant</option>
              {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Dish name" htmlFor="d-name" className="sm:col-span-2"><Input id="d-name" value={form.name} onChange={set('name')} required minLength={2} /></Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-soft">Food type</span>
          <SegmentedControl
            label="Food type"
            value={form.food_type}
            onChange={(v) => setForm((f) => ({ ...f, food_type: v }))}
            options={[
              { value: 'VEG', label: 'Veg', icon: <FoodTypeIcon type="VEG" /> },
              { value: 'NON_VEG', label: 'Non-veg', icon: <FoodTypeIcon type="NON_VEG" /> },
            ]}
          />
        </div>
        <Field label="Category" htmlFor="d-cat">
          <Select id="d-cat" value={form.category_id} onChange={set('category_id')} required>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Price (₹)" htmlFor="d-price"><Input id="d-price" type="number" min="1" step="0.5" value={form.price} onChange={set('price')} required /></Field>
        <Field label="Stock" htmlFor="d-stock"><Input id="d-stock" type="number" min="0" value={form.stock} onChange={set('stock')} required /></Field>
        <Field label="Spice level" htmlFor="d-spice">
          <Select id="d-spice" value={form.spice_level} onChange={set('spice_level')}>
            {['Not spicy', 'Mild', 'Spicy', 'Very spicy'].map((l, i) => <option key={l} value={i}>{l}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-3 self-end pb-2.5 text-sm text-ink-soft">
          <Toggle checked={form.is_available} onChange={(v) => setForm((f) => ({ ...f, is_available: v }))} label="Available" /> Available to order
        </label>
        <Field label="Description" htmlFor="d-desc" className="sm:col-span-2" hint="Used for semantic search — describe taste, texture and occasion.">
          <Textarea id="d-desc" rows={2} value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Key ingredients" htmlFor="d-ing" className="sm:col-span-2"><Input id="d-ing" value={form.ingredients} onChange={set('ingredients')} placeholder="paneer, tomato, cream" /></Field>
        <Field label="Image URL" htmlFor="d-img" className="sm:col-span-2">
          <div className="flex items-center gap-3">
            <Input id="d-img" type="url" value={form.image_url} onChange={set('image_url')} placeholder="https://…" />
            <FoodImage key={form.image_url} src={form.image_url || null} alt="Preview" className="size-11 shrink-0 rounded-lg object-cover" />
          </div>
        </Field>
        {error && <p className="text-sm text-nonveg sm:col-span-2" role="alert">{error}</p>}
      </form>
    </Modal>
  )
}

function StockControl({ dish, onChange }) {
  const [busy, setBusy] = useState(false)
  const adjust = async (delta) => {
    setBusy(true)
    await onChange(dish, delta)
    setBusy(false)
  }
  return (
    <div className="inline-flex items-center gap-1">
      <button onClick={() => adjust(-1)} disabled={busy || dish.stock === 0} className="grid size-7 place-items-center rounded-full border border-line text-ink-soft hover:bg-ink/5 disabled:opacity-40" aria-label={`Decrease ${dish.name} stock`}><Minus className="size-3.5" /></button>
      <span className={cn('w-10 text-center font-semibold tabular-nums', dish.stock === 0 ? 'text-nonveg' : dish.stock <= 5 ? 'text-warn' : 'text-ink')}>{dish.stock}</span>
      <button onClick={() => adjust(10)} disabled={busy} className="grid h-7 place-items-center rounded-full border border-line px-2 text-xs font-semibold text-ink-soft hover:bg-ink/5 disabled:opacity-40" aria-label={`Add 10 to ${dish.name} stock`}>+10</button>
    </div>
  )
}

export default function AdminDishes() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const restaurantId = params.get('restaurant_id') || ''
  const [foodType, setFoodType] = useState('ALL')
  const [search, setSearch] = useState('')
  const q = useDebounce(search)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const restaurants = useAsync(() => restaurantApi.list({ include_inactive: true, limit: 100 }), [])
  const categories = useAsync(() => dishApi.categories(), [])
  const dishes = useAsync(
    () => dishApi.browse({
      restaurant_id: restaurantId || undefined, food_type: foodType === 'ALL' ? undefined : foodType,
      search: q || undefined, include_unavailable: true, sort: 'name', limit: 200,
    }),
    [restaurantId, foodType, q],
  )

  const patchLocal = (updated) => dishes.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === updated.id ? updated : x)) }))

  const changeStock = async (dish, delta) => {
    try {
      patchLocal(await dishApi.updateStock(dish.id, { delta }))
    } catch (e) {
      toast.error(e.message)
    }
  }
  const toggleAvailable = async (dish) => {
    try {
      patchLocal(await dishApi.update(dish.id, { is_available: !dish.is_available }))
      toast.success(`${dish.name} ${dish.is_available ? 'marked unavailable' : 'is available again'}`)
    } catch (e) {
      toast.error(e.message)
    }
  }
  const remove = async () => {
    try {
      await dishApi.remove(deleting.id)
      toast.success(`${deleting.name} deleted`)
      dishes.setData((d) => ({ ...d, total: d.total - 1, items: d.items.filter((x) => x.id !== deleting.id) }))
    } catch (e) {
      toast.error(e.message)
    }
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        title="Dishes & inventory"
        description="Manage menus, prices, Veg/Non-veg labels, availability and live stock."
        actions={<Button onClick={() => setEditing('new')} disabled={!categories.data}><Plus className="size-4" aria-hidden /> Add dish</Button>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select aria-label="Filter by restaurant" className="w-56" value={restaurantId} onChange={(e) => setParams(e.target.value ? { restaurant_id: e.target.value } : {})}>
          <option value="">All restaurants</option>
          {restaurants.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <SegmentedControl
          label="Food type"
          value={foodType}
          onChange={setFoodType}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'VEG', label: 'Veg', icon: <FoodTypeIcon type="VEG" /> },
            { value: 'NON_VEG', label: 'Non-veg', icon: <FoodTypeIcon type="NON_VEG" /> },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search dishes" placeholder="Search dishes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        {dishes.data && <span className="ml-auto text-sm text-muted">{dishes.data.total} dishes</span>}
      </div>

      {dishes.error ? <ErrorState error={dishes.error} onRetry={dishes.reload} /> : dishes.loading && !dishes.data ? (
        <Skeleton className="h-96 rounded-card" />
      ) : !dishes.data.items.length ? (
        <EmptyState icon={UtensilsCrossed} title="No dishes found" description="Try another filter, or add a dish." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Dish</th><th className="px-3 py-3">Restaurant</th><th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Stock</th><th className="px-3 py-3">Available</th><th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dishes.data.items.map((d) => (
                <tr key={d.id} className={cn('transition-colors hover:bg-canvas/60', !d.in_stock && 'bg-canvas/40')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <FoodImage src={sizedImage(d.image_url, 'small')} alt="" className="size-10 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold text-ink"><FoodTypeIcon type={d.food_type} /> {d.name} <SpiceLevel level={d.spice_level} /></p>
                        <p className="text-xs text-muted">{d.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-soft">{d.restaurant_name}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums">{formatPrice(d.price)}</td>
                  <td className="px-3 py-3"><StockControl dish={d} onChange={changeStock} /></td>
                  <td className="px-3 py-3"><Toggle checked={d.is_available} onChange={() => toggleAvailable(d)} label={`${d.name} available`} /></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(d)} className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-ink" aria-label={`Edit ${d.name}`}><Pencil className="size-4" /></button>
                      <button onClick={() => setDeleting(d)} className="rounded-full p-2 text-muted hover:bg-nonveg/5 hover:text-nonveg" aria-label={`Delete ${d.name}`}><Trash2 className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && categories.data && restaurants.data && (
        <DishForm
          initial={editing === 'new' ? null : editing}
          restaurants={restaurants.data.items}
          categories={categories.data}
          defaultRestaurant={restaurantId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); dishes.reload({ silent: true }) }}
        />
      )}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Delete ${deleting?.name}?`}
        description="Past orders keep their copy of the dish name and price. To hide it temporarily, mark it unavailable instead."
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Keep</Button><Button variant="danger" onClick={remove}>Delete</Button></>}
      />
    </>
  )
}
