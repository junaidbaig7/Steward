import { Link } from 'react-router-dom'
import Logo from './Logo'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-page flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Good food from neighbourhood kitchens, found the way you'd ask a friend.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div className="space-y-2.5">
            <p className="font-semibold text-ink">Explore</p>
            <Link to="/restaurants" className="block text-muted hover:text-ink">Restaurants</Link>
            <Link to="/search" className="block text-muted hover:text-ink">Smart search</Link>
          </div>
          <div className="space-y-2.5">
            <p className="font-semibold text-ink">Account</p>
            <Link to="/orders" className="block text-muted hover:text-ink">Your orders</Link>
            <Link to="/account" className="block text-muted hover:text-ink">Dashboard</Link>
          </div>
          <div className="space-y-2.5">
            <p className="font-semibold text-ink">Partners</p>
            <Link to="/admin/login" className="block text-muted hover:text-ink">Admin portal</Link>
          </div>
        </div>
      </div>
      <div className="container-page border-t border-line py-5 text-xs text-muted">
        © {YEAR} STEWARD · Academic project (DBS &amp; DBD). Payments run in Razorpay Test Mode.
      </div>
    </footer>
  )
}
