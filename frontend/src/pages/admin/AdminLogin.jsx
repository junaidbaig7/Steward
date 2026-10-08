import { Lock } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../../components/layout/Logo'
import Button from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { useAuth } from '../../contexts/AuthContext'
import { authApi } from '../../services/api/authApi'

export default function AdminLogin() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user?.role === 'ADMIN') return <Navigate to={location.state?.from || '/admin'} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      login(await authApi.adminLogin(email.trim(), password))
      navigate(location.state?.from || '/admin', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex justify-center"><Logo suffix="Admin" /></div>
        <form onSubmit={submit} className="rounded-[1.5rem] border border-line bg-surface p-8 shadow-[0_20px_60px_rgba(27,27,24,0.06)]">
          <h1 className="text-xl font-bold text-ink">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted">Restaurant operations portal</p>
          {user && user.role !== 'ADMIN' && (
            <p className="mt-4 rounded-lg bg-warn/8 px-3 py-2 text-xs text-warn">You're signed in as a customer. Admin access needs an admin account.</p>
          )}
          <div className="mt-6 space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            <Field label="Password" htmlFor="password" error={error}>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} required />
            </Field>
          </div>
          <Button type="submit" className="mt-6 w-full" variant="dark" loading={busy}><Lock className="size-4" aria-hidden /> Sign in</Button>
          <p className="mt-4 text-center text-xs text-muted">Admin accounts are provisioned by the platform team — there is no public sign-up.</p>
        </form>
      </div>
    </div>
  )
}
