import { cn } from '../../utils/cn'

const control =
  'rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 ' +
  'transition-colors focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/12 disabled:bg-canvas'

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, htmlFor, hint, error, children, className }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-nonveg">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}

export function Input({ className = '', error, id, ...props }) {
  return (
    <input
      id={id}
      className={cn(control, 'h-11', !/\bw-/.test(className) && 'w-full', error && 'border-nonveg', className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(control, 'min-h-24 w-full py-2.5', className)} {...props} />
}

export function Select({ className = '', children, ...props }) {
  // Full width and h-11 by default; pass w-* / h-* classes to override.
  const sized = cn(!/\bh-/.test(className) && 'h-11', !/\bw-/.test(className) && 'w-full')
  return (
    <select className={cn(control, 'pr-8', sized, className)} {...props}>
      {children}
    </select>
  )
}
