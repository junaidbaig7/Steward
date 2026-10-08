import { cn } from '../../utils/cn'

/** Pill-style toggle group, e.g. All / Veg / Non-Veg. */
export default function SegmentedControl({ options, value, onChange, label, size = 'md', className }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-full border border-line bg-surface p-1', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors duration-150',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-sm',
              active ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
