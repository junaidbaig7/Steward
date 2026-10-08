import { Link } from 'react-router-dom'
import { cn } from '../../utils/cn'
import Spinner from './Spinner'

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-ink/30 hover:bg-canvas disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-ink/5 hover:text-ink disabled:opacity-50',
  dark: 'bg-ink text-white hover:bg-ink/85 disabled:opacity-50',
  danger: 'bg-surface text-nonveg border border-nonveg/30 hover:bg-nonveg/5 disabled:opacity-50',
}

const SIZES = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2',
  icon: 'size-10',
}

/** Button that can also render as a router <Link> when `to` is given. */
export default function Button({
  variant = 'primary', size = 'md', loading = false, className, children, to, disabled, ...props
}) {
  const classes = cn(
    'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold whitespace-nowrap',
    'transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    )
  }
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}
