import { CircleDashed } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatDateTime } from '../../utils/format'
import { STATUS_META, isActive } from '../../utils/orderStatus'

const FLOW = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']
const STEP_LABELS = {
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY: 'Ready',
  OUT_FOR_DELIVERY: 'On the way', DELIVERED: 'Delivered',
}

export function StatusBadge({ status, className }) {
  const meta = STATUS_META[status] || { label: status, tone: 'bg-ink/5 text-ink ring-line' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', meta.tone, className)}>
      {isActive(status) && status !== 'PLACED' && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {meta.label}
    </span>
  )
}

/** Horizontal progress tracker; each completed step shows its timestamp. */
export function OrderTracker({ status, history }) {
  const reachedAt = Object.fromEntries((history || []).map((h) => [h.status, h.created_at]))
  const current = FLOW.indexOf(status)
  const stopped = status === 'CANCELLED' || status === 'FAILED'
  const lastReached = stopped ? Math.max(...FLOW.map((s, i) => (reachedAt[s] ? i : -1))) : current

  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Order progress">
      {FLOW.map((step, i) => {
        const done = i <= lastReached
        const active = i === current && isActive(status)
        const Icon = STATUS_META[step].icon
        return (
          <li key={step} className="relative flex flex-col items-center text-center" aria-current={active ? 'step' : undefined}>
            {i > 0 && (
              <span
                className={cn(
                  'absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 transition-colors duration-500',
                  i <= lastReached ? 'bg-brand-600' : 'bg-line',
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-8 place-items-center rounded-full border-2 transition-[background-color,border-color,color] duration-500',
                done ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-muted',
                active && 'ring-4 ring-brand-600/15',
              )}
            >
              {done ? <Icon className="size-4" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
            </span>
            <span className={cn('mt-2 text-[11px] font-semibold sm:text-xs', done ? 'text-ink' : 'text-muted')}>{STEP_LABELS[step]}</span>
            <span className="mt-0.5 hidden text-[11px] text-muted sm:block">
              {reachedAt[step] ? formatDateTime(reachedAt[step]).split(', ').pop() : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
