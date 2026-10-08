import { ChevronDown, LayoutDashboard, LogOut, Receipt, Search, ShoppingBag, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import { cn } from '../../utils/cn'
import Button from '../ui/Button'
import Logo from './Logo'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/restaurants', label: 'Restaurants' },
  { to: '/search', label: 'Smart search' },
  { to: '/orders', label: 'Orders' },
]

function AccountMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const initial = (user.full_name || user.phone || user.email || '?').replace('+91', '').charAt(0).toUpperCase()
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full p-1 pr-2 transition-colors hover:bg-ink/5"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{initial}</span>
        <ChevronDown className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-[0_12px_40px_rgba(27,27,24,0.1)] animate-scale-in"
          onClick={() => setOpen(false)}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{user.full_name || 'Welcome'}</p>
            <p className="truncate text-xs text-muted">{user.phone || user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          {[
            { to: '/account', icon: LayoutDashboard, label: 'My dashboard' },
            { to: '/orders', icon: Receipt, label: 'Orders' },
            { to: '/account#profile', icon: User, label: 'Profile' },
          ].map(({ to, icon: Icon, label }) => (
            <Link key={label} to={to} role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-canvas hover:text-ink">
              <Icon className="size-4" aria-hidden /> {label}
            </Link>
          ))}
          <button
            role="menuitem"
            onClick={() => { logout(); navigate('/') }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-canvas hover:text-nonveg"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function Navbar() {
  const { user, isAdmin } = useAuth()
  const { count } = useCart()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200',
        scrolled ? 'border-line bg-canvas/90 backdrop-blur-md' : 'border-transparent bg-canvas',
      )}
    >
      <nav className="container-page flex h-16 items-center gap-6" aria-label="Main">
        <Logo />
        <ul className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <span className="relative">
                    {l.label}
                    {isActive && <span className="absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-600" />}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          {location.pathname !== '/search' && (
            <Link
              to="/search"
              className="hidden h-10 w-56 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-muted transition-colors hover:border-line-strong lg:flex"
            >
              <Search className="size-4" aria-hidden /> Try “spicy chicken”…
            </Link>
          )}
          <Link
            to="/search"
            className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-ink/5 lg:hidden"
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>
          <Link
            to="/cart"
            className="relative grid size-10 place-items-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-line-strong"
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="size-[18px]" aria-hidden />
            {count > 0 && (
              <span
                key={count}
                className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-nonveg px-1 text-[11px] font-bold text-white animate-scale-in"
              >
                {count}
              </span>
            )}
          </Link>
          {isAdmin ? (
            <Button to="/admin" size="sm" variant="dark">Admin portal</Button>
          ) : user ? (
            <AccountMenu />
          ) : (
            <Button to="/login" size="sm" variant="dark" state={{ from: location.pathname }}>Sign in</Button>
          )}
        </div>
      </nav>
    </header>
  )
}
