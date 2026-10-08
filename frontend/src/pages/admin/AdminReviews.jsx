import { MessageSquare, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RatingSummary } from '../../components/food/ReviewsSection'
import Button from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import { Stars } from '../../components/ui/Rating'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useToast } from '../../contexts/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { PageHeader, Panel } from '../../layouts/AdminLayout'
import { restaurantApi } from '../../services/api/restaurantApi'
import { reviewApi } from '../../services/api/reviewApi'
import { formatDate } from '../../utils/format'

export default function AdminReviews() {
  const toast = useToast()
  const [restaurantId, setRestaurantId] = useState('')
  const [rating, setRating] = useState('')
  const [limit, setLimit] = useState(20)
  const [deleting, setDeleting] = useState(null)

  const restaurants = useAsync(() => restaurantApi.list({ include_inactive: true, limit: 100 }), [])
  const rankings = useAsync(() => reviewApi.rankings(), [])
  const summary = useAsync(() => (restaurantId ? reviewApi.summary(restaurantId) : Promise.resolve(null)), [restaurantId])
  const reviews = useAsync(
    () => reviewApi.all({ restaurant_id: restaurantId || undefined, rating: rating || undefined, limit }),
    [restaurantId, rating, limit],
  )

  const remove = async () => {
    try {
      await reviewApi.remove(deleting.id)
      toast.success('Review removed')
      reviews.reload({ silent: true })
      rankings.reload({ silent: true })
    } catch (e) {
      toast.error(e.message)
    }
    setDeleting(null)
  }

  return (
    <>
      <PageHeader title="Reviews & ratings" description="Customer reviews are stored in MongoDB. Rankings use a weighted (Bayesian) rating." />
      <div className="grid gap-6 xl:grid-cols-5">
        <Panel title="Restaurant ranking" className="h-fit xl:col-span-2">
          {rankings.loading ? <Skeleton className="h-64" /> : (
            <ol className="divide-y divide-line">
              {rankings.data.map((r, i) => (
                <li key={r.restaurant_id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="w-5 tabular-nums text-muted">{i + 1}</span>
                  <span className="flex-1 font-medium text-ink">{r.restaurant_name}</span>
                  <span className="text-xs text-muted">{r.review_count} reviews · {Math.round(r.positive_share * 100)}% 4★+</span>
                  <span className="w-20 text-right font-semibold tabular-nums text-ink">★ {r.avg_rating.toFixed(2)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Score = v/(v+m)·R + m/(v+m)·C, where R is the restaurant's average, v its review count, C the overall average and m = 5. A single 5★ review can't outrank a long track record.
          </p>
        </Panel>

        <div className="space-y-6 xl:col-span-3">
          <div className="flex flex-wrap gap-3">
            <Select aria-label="Restaurant" className="w-56" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
              <option value="">All restaurants</option>
              {restaurants.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <Select aria-label="Rating" className="w-40" value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">Any rating</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
            </Select>
            {reviews.data && <span className="ml-auto self-center text-sm text-muted">{reviews.data.total} reviews</span>}
          </div>
          {summary.data && <Panel title="Rating summary"><RatingSummary summary={summary.data} /></Panel>}
          {reviews.error ? <ErrorState error={reviews.error} onRetry={reviews.reload} /> : reviews.loading && !reviews.data ? (
            <Skeleton className="h-80 rounded-card" />
          ) : !reviews.data.items.length ? (
            <EmptyState icon={MessageSquare} title="No reviews match" />
          ) : (
            <ul className="space-y-3">
              {reviews.data.items.map((r) => (
                <li key={r.id} className="rounded-card border border-line bg-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{r.user_name} <span className="font-normal text-muted">· {r.restaurant_name}</span></p>
                      <div className="mt-0.5 flex items-center gap-2"><Stars value={r.rating} size="sm" /><span className="text-xs text-muted">{formatDate(r.created_at)} · order #{r.order_id}</span></div>
                    </div>
                    <button onClick={() => setDeleting(r)} className="rounded-full p-2 text-muted hover:bg-nonveg/5 hover:text-nonveg" aria-label="Remove review"><Trash2 className="size-4" /></button>
                  </div>
                  {r.review && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.review}</p>}
                </li>
              ))}
            </ul>
          )}
          {reviews.data && reviews.data.total > reviews.data.items.length && (
            <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + 20)}>Load more</Button>
          )}
        </div>
      </div>
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Remove this review?"
        description="Use this for spam or abusive content. The restaurant's rating is recalculated."
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Keep</Button><Button variant="danger" onClick={remove}>Remove</Button></>}
      />
    </>
  )
}
