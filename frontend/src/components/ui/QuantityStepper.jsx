import { Minus, Plus } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function QuantityStepper({ value, onChange, max = 50, size = 'md', label = 'item' }) {
  const small = size === 'sm'
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-brand-600/30 bg-brand-50 text-brand-700',
        small ? 'h-8' : 'h-10',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className={cn('grid place-items-center rounded-full transition-colors hover:bg-brand-100', small ? 'size-8' : 'size-10')}
        aria-label={`Remove one ${label}`}
      >
        <Minus className="size-4" />
      </button>
      {/* key forces a tiny re-mount animation whenever the number changes */}
      <span key={value} className={cn('min-w-6 text-center font-bold tabular-nums animate-scale-in', small ? 'text-sm' : 'text-base')} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={cn(
          'grid place-items-center rounded-full transition-colors hover:bg-brand-100 disabled:opacity-40',
          small ? 'size-8' : 'size-10',
        )}
        aria-label={`Add one ${label}`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
