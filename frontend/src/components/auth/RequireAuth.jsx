import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../ui/Spinner'

/** Route guard. `role` restricts to USER or ADMIN; others are redirected to the right login. */
export default function RequireAuth({ role }) {
  const { user, checking } = useAuth()
  const location = useLocation()

  if (checking && !user) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!user) {
    return <Navigate to={role === 'ADMIN' ? '/admin/login' : '/login'} state={{ from: location.pathname }} replace />
  }
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/'} replace />
  }
  return <Outlet />
}
