import { Pencil, Plus, Search, Store, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import FoodImage from '../../components/food/FoodImage'
import Button from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import Toggle from '../../components/ui/Toggle'
import { RatingBadge } from '../../components/ui/Rating'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { useDebounce } from '../../hooks/useDebounce'
import { PageHeader } from '../../layouts/AdminLayout'
import { restaurantApi } from '../../services/api/restaurantApi'
import { cn } from '../../utils/cn'
import { formatPrice } from '../../utils/format'
import { sizedImage } from '../../utils/images'

const EMPTY = {
  name: '', cuisine: '', description: '', address: '', city: 'Bengaluru', phone: '', image_url: '',
  avg_delivery_minutes: 30, delivery_fee: 29, min_order_amount: 149, is_active: true,
}

function RestaurantForm({ initial, onSaved, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState(initial ? { ...EMPTY, ...initial, phone: initial.phone || '', image_url: initial.image_url || '' } : EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      ...form,
      phone: form.phone.trim() || null,
      image_url: form.image_url.trim() || null,
      avg_delivery_minutes: Number(form.avg_delivery_minutes),
      delivery_fee: Number(form.delivery_fee),
      min_order_amount: Number(form.min_order_amount),
    }
    ;['id', 'slug', 'created_at', 'dish_count', 'veg_count', 'min_price', 'avg_rating', 'review_count'].forEach((k) => delete payload[k])
    try {
      const saved = initial ? await restaurantApi.update(initial.id, payload) : await restaurantApi.create(payload)
      toast.success(initial ? 'Restaurant updated' : `${saved.name} created`)
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
      title={initial ? `Edit ${initial.name}` : 'Add restaurant'}
      description="Changes are saved to PostgreSQL and appear in the customer app immediately."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="restaurant-form" type="submit" loading={busy}>{initial ? 'Save changes' : 'Create restaurant'}</Button></>}
    >
      <form id="restaurant-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="r-name" className="sm:col-span-2"><Input id="r-name" value={form.name} onChange={set('name')} required minLength={2} /></Field>
        <Field label="Cuisine" htmlFor="r-cuisine" hint="e.g. South Indian, Biryani"><Input id="r-cuisine" value={form.cuisine} onChange={set('cuisine')} required /></Field>
        <Field label="City" htmlFor="r-city"><Input id="r-city" value={form.city} onChange={set('city')} required /></Field>
        <Field label="Address" htmlFor="r-address" className="sm:col-span-2"><Input id="r-address" value={form.address} onChange={set('address')} required minLength={3} /></Field>
        <Field label="Description" htmlFor="r-desc" className="sm:col-span-2"><Textarea id="r-desc" rows={2} value={form.description} onChange={set('description')} /></Field>
        <Field label="Image URL" htmlFor="r-img" className="sm:col-span-2" hint="Optional — https:// link to a photo"><Input id="r-img" type="url" value={form.image_url} onChange={set('image_url')} placeholder="https://…" /></Field>
        <Field label="Phone" htmlFor="r-phone" hint="Format +91XXXXXXXXXX"><Input id="r-phone" value={form.phone} onChange={set('phone')} placeholder="+918041234567" /></Field>
        <Field label="Avg. delivery (minutes)" htmlFor="r-eta"><Input id="r-eta" type="number" min={5} max={180} value={form.avg_delivery_minutes} onChange={set('avg_delivery_minutes')} /></Field>
        <Field label="Delivery fee (₹)" htmlFor="r-fee"><Input id="r-fee" type="number" min={0} step="1" value={form.delivery_fee} onChange={set('delivery_fee')} /></Field>
        <Field label="Minimum order (₹)" htmlFor="r-min"><Input id="r-min" type="number" min={0} step="1" value={form.min_order_amount} onChange={set('min_order_amount')} /></Field>
        <label className="flex items-center gap-3 text-sm text-ink-soft sm:col-span-2">
          <Toggle checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Accepting orders" /> Accepting orders (visible to customers)
        </label>
        {error && <p className="text-sm text-nonveg sm:col-span-2" role="alert">{error}</p>}
      </form>
    </Modal>
  )
}

export default function AdminRestaurants() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const q = useDebounce(search)
  const [editing, setEditing] = useState(null) // null | 'new' | restaurant
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useAsync(() => restaurantApi.list({ include_inactive: true, search: q || undefined, limit: 100 }), [q])

  const toggleActive = async (r) => {
    try {
      await restaurantApi.update(r.id, { is_active: !r.is_active })
      toast.success(`${r.name} ${r.is_active ? 'paused' : 'is accepting orders'}`)
      reload({ silent: true })
    } catch (e) {
      toast.error(e.message)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await restaurantApi.remove(deleting.id)
      toast.success(`${deleting.name} deleted`)
      setDeleting(null)
      reload({ silent: true })
    } catch (e) {
      toast.error(e.message)
      setDeleting(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Restaurants"
        description="Create, edit and pause restaurants. Inactive restaurants are hidden from customers."
        actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> Add restaurant</Button>}
      />
      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input aria-label="Search restaurants" placeholder="Search name or cuisine" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
        <Skeleton className="h-96 rounded-card" />
      ) : !data.items.length ? (
        <EmptyState icon={Store} title="No restaurants" description="Add your first restaurant to get started." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Restaurant</th><th className="px-3 py-3">Menu</th><th className="px-3 py-3">Rating</th>
                <th className="px-3 py-3">Delivery</th><th className="px-3 py-3">Active</th><th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((r) => (
                <tr key={r.id} className={cn('transition-colors hover:bg-canvas/60', !r.is_active && 'text-muted')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <FoodImage src={sizedImage(r.image_url, 'small')} alt="" className="size-11 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <Link to={`/restaurants/${r.slug}`} className="font-semibold text-ink hover:text-brand-700">{r.name}</Link>
                        <p className="truncate text-xs text-muted">{r.cuisine} · {r.city}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{r.dish_count} dishes <span className="text-xs text-muted">({r.veg_count} veg)</span></td>
                  <td className="px-3 py-3"><RatingBadge rating={r.avg_rating} count={r.review_count} /></td>
                  <td className="px-3 py-3 text-xs">{r.avg_delivery_minutes} min · {formatPrice(r.delivery_fee)}</td>
                  <td className="px-3 py-3"><Toggle checked={r.is_active} onChange={() => toggleActive(r)} label={`${r.name} accepting orders`} /></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" to={`/admin/dishes?restaurant_id=${r.id}`}>Menu</Button>
                      <button onClick={() => setEditing(r)} className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-ink" aria-label={`Edit ${r.name}`}><Pencil className="size-4" /></button>
                      <button onClick={() => setDeleting(r)} className="rounded-full p-2 text-muted hover:bg-nonveg/5 hover:text-nonveg" aria-label={`Delete ${r.name}`}><Trash2 className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RestaurantForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload({ silent: true }) }}
        />
      )}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Delete ${deleting?.name}?`}
        description="This permanently removes the restaurant and its menu. Restaurants with order history can't be deleted — pause them instead."
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Keep</Button><Button variant="danger" onClick={remove} loading={busy}>Delete</Button></>}
      />
    </>
  )
}
