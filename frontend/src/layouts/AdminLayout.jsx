import { BarChart3, ExternalLink, LayoutDashboard, LogOut, Menu, MessageSquare, Receipt, Store, UtensilsCrossed, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/layout/Logo'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../utils/cn'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: Receipt },
  { to: '/admin/restaurants', label: 'Restaurants', icon: Store },
  { to: '/admin/dishes', label: 'Dishes & inventory', icon: UtensilsCrossed },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/reviews', label: 'Reviews', icon: MessageSquare },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Logo to="/admin" suffix="Admin" /></div>
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Admin">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
              )
            }
          >
            <Icon className="size-[18px]" aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-ink/5 hover:text-ink">
          <ExternalLink className="size-4" aria-hidden /> View storefront
        </Link>
        <div className="mt-2 flex items-center gap-3 px-3 py-2">
          <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-bold text-white">A</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{user?.full_name || 'Admin'}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <button onClick={() => { logout(); navigate('/admin/login') }} className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-nonveg" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-canvas lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={() => setOpen(false)} aria-hidden />
          <aside className="relative h-full w-72 bg-surface shadow-xl animate-fade-in">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-full p-2 text-muted hover:bg-ink/5" aria-label="Close menu"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-full p-2 text-ink hover:bg-ink/5" aria-label="Open menu"><Menu className="size-5" /></button>
        <Logo to="/admin" suffix="Admin" />
      </header>
      <main key={pathname} className="mx-auto max-w-7xl px-4 py-8 animate-fade-up sm:px-6 lg:px-10">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, action, children, className }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-5 sm:p-6', className)}>
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-bold text-ink">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
