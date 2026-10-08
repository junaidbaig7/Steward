import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { reviewApi } from '../../services/api/reviewApi'
import Button from '../ui/Button'
import { Textarea } from '../ui/Field'
import { Stars } from '../ui/Rating'

const LABELS = ['', 'Poor', 'Could be better', 'Good', 'Very good', 'Excellent']

/** Shown on a delivered order: rate the restaurant (stored in MongoDB), or see your review. */
export default function ReviewPrompt({ order }) {
  const toast = useToast()
  const existing = useAsync(() => reviewApi.forOrder(order.id).catch((e) => (e.status === 404 ? null : Promise.reject(e))), [order.id])
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  if (existing.loading) return null
  const review = existing.data

  const submit = async (e) => {
    e.preventDefault()
    if (!rating) return toast.error('Please choose a star rating.')
    setBusy(true)
    try {
      const saved = review
        ? await reviewApi.update(review.id, { rating, review: text })
        : await reviewApi.create({ order_id: order.id, rating, review: text })
      existing.setData(saved)
      setEditing(false)
      toast.success('Thanks for your review!')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (review && !editing) {
    return (
      <section className="mt-6 flex flex-wrap items-center gap-4 rounded-card border border-brand-100 bg-brand-50/60 p-5 animate-fade-in">
        <CheckCircle2 className="size-5 text-brand-700" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">You rated {order.restaurant_name}</p>
          <div className="mt-0.5 flex items-center gap-2"><Stars value={review.rating} size="sm" />{review.review && <span className="truncate text-sm text-ink-soft">“{review.review}”</span>}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setRating(review.rating); setText(review.review); setEditing(true) }}>Edit</Button>
      </section>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-card border border-line bg-surface p-6 animate-fade-in">
      <h2 className="font-bold text-ink">How was your food from {order.restaurant_name}?</h2>
      <p className="mt-0.5 text-sm text-muted">Your rating helps others choose — and helps the kitchen improve.</p>
      <div className="mt-4 flex items-center gap-3">
        <Stars value={rating} onChange={setRating} size="lg" />
        <span className="text-sm font-medium text-ink-soft" aria-live="polite">{LABELS[rating]}</span>
      </div>
      <label htmlFor="review-text" className="sr-only">Your review</label>
      <Textarea
        id="review-text"
        className="mt-4"
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What did you enjoy? Anything that could be better? (optional)"
      />
      <div className="mt-4 flex justify-end gap-2">
        {editing && <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
        <Button type="submit" loading={busy} disabled={!rating}>{review ? 'Update review' : 'Submit review'}</Button>
      </div>
    </form>
  )
}
