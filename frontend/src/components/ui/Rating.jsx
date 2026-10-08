import { Star } from 'lucide-react'
import { cn } from '../../utils/cn'

/** Compact rating chip: ★ 4.6 (184). Shows "New" when there are no reviews. */
export function RatingBadge({ rating, count, className }) {
  if (!count) {
    return <span className={cn('rounded-md bg-ink/5 px-1.5 py-0.5 text-xs font-medium text-muted', className)}>New</span>
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold text-ink', className)}>
      <span className="inline-flex items-center gap-0.5 rounded-md bg-brand-600 px-1.5 py-0.5 text-xs text-white">
        <Star className="size-3 fill-current" aria-hidden />
        {Number(rating).toFixed(1)}
      </span>
      <span className="text-xs font-normal text-muted">({count})</span>
    </span>
  )
}

/** Star row for display or input (when onChange is given). */
export function Stars({ value, onChange, size = 'md' }) {
  const cls = size === 'lg' ? 'size-8' : size === 'sm' ? 'size-3.5' : 'size-5'
  return (
    <div className="inline-flex gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Star
            className={cn(cls, 'transition-colors', n <= value ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-line-strong')}
            aria-hidden
          />
        )
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        )
      })}
    </div>
  )
}
