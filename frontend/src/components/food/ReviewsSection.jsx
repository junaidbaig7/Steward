import { MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { reviewApi } from '../../services/api/reviewApi'
import { timeAgo } from '../../utils/format'
import { Stars } from '../ui/Rating'
import { Skeleton } from '../ui/States'

export function RatingSummary({ summary }) {
  if (!summary?.review_count) {
    return <p className="mt-2 text-sm text-muted">No reviews yet — be the first after your order arrives.</p>
  }
  return (
    <div className="mt-4 flex items-center gap-6">
      <div className="text-center">
        <p className="text-4xl font-extrabold leading-none text-ink">{summary.avg_rating.toFixed(1)}</p>
        <Stars value={Math.round(summary.avg_rating)} size="sm" />
        <p className="mt-1 text-xs text-muted">{summary.review_count} review{summary.review_count > 1 ? 's' : ''}</p>
      </div>
      <dl className="flex-1 space-y-1">
        {Object.entries(summary.distribution).map(([stars, count]) => (
          <div key={stars} className="flex items-center gap-2 text-xs">
            <dt className="w-3 text-muted">{stars}</dt>
            <dd className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full bg-amber-400 transition-[width] duration-700"
                style={{ width: `${(count / summary.review_count) * 100}%` }}
              />
            </dd>
            <span className="w-5 text-right tabular-nums text-muted">{count}</span>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Restaurant page sidebar: rating summary (MongoDB aggregation) + recent reviews. */
export default function ReviewsSection({ restaurant }) {
  const [limit, setLimit] = useState(4)
  const summary = useAsync(() => reviewApi.summary(restaurant.id), [restaurant.id])
  const list = useAsync(() => reviewApi.list(restaurant.id, { limit }), [restaurant.id, limit])

  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <h2 className="font-bold text-ink">Ratings &amp; reviews</h2>
      {summary.loading ? <Skeleton className="mt-4 h-20 w-full" /> : <RatingSummary summary={summary.data} />}

      {list.data?.items.length > 0 && (
        <ul className="mt-6 space-y-5 border-t border-line pt-5">
          {list.data.items.map((r) => (
            <li key={r.id} className="animate-fade-in">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-ink">{r.user_name}</p>
                <span className="shrink-0 text-xs text-muted">{timeAgo(r.created_at)}</span>
              </div>
              <Stars value={r.rating} size="sm" />
              {r.review ? (
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.review}</p>
              ) : (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted"><MessageSquareText className="size-3" aria-hidden /> Rating only</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.total > list.data.items.length && (
        <button onClick={() => setLimit((l) => l + 6)} className="mt-5 text-sm font-semibold text-brand-700 hover:underline">
          Show more reviews
        </button>
      )}
    </div>
  )
}
