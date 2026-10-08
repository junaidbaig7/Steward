import { AlertCircle, RotateCw } from 'lucide-react'
import { cn } from '../../utils/cn'
import Button from './Button'

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-16 text-center animate-fade-in', className)}>
      {Icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700">
          <Icon className="size-6" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center animate-fade-in', className)} role="alert">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-nonveg/8 text-nonveg">
        <AlertCircle className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink">We couldn't load this</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={() => onRetry()}>
          <RotateCw className="size-4" /> Try again
        </Button>
      )}
    </div>
  )
}
