import { Link } from 'react-router-dom'
import { cn } from '../../utils/cn'

export default function Logo({ to = '/', className, suffix }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-lg', className)} aria-label="STEWARD home">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-brand-600" />
        <path
          d="M10 20.5c1.2 1.6 3.3 2.5 6 2.5 3.4 0 5.6-1.6 5.6-4.1 0-2.3-1.6-3.3-5-4l-1.4-.3c-1.9-.4-2.6-.9-2.6-1.8 0-1 1-1.8 2.9-1.8 1.7 0 2.9.7 3.6 1.8"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-lg font-extrabold tracking-tight text-ink">Steward</span>
      {suffix && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{suffix}</span>}
    </Link>
  )
}
