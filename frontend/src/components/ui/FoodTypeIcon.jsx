import { cn } from '../../utils/cn'

/**
 * The familiar Indian food-type mark: a square outline with a green dot (Veg)
 * or a red triangle (Non-Veg). Small, recognisable and colour-blind friendly
 * because the inner shape differs too.
 */
export default function FoodTypeIcon({ type, className, withLabel = false }) {
  const veg = type === 'VEG'
  const label = veg ? 'Veg' : 'Non-veg'
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-grid size-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px] bg-surface',
          veg ? 'border-veg' : 'border-nonveg',
        )}
        role="img"
        aria-label={label}
        title={label}
      >
        {veg ? (
          <span className="size-1.5 rounded-full bg-veg" />
        ) : (
          <span className="h-0 w-0 border-x-[3.5px] border-b-[6px] border-x-transparent border-b-nonveg" />
        )}
      </span>
      {withLabel && <span className={cn('text-xs font-medium', veg ? 'text-veg' : 'text-nonveg')}>{label}</span>}
    </span>
  )
}
