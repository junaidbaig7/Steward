import { ArrowLeft, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import GoogleButton from '../../components/auth/GoogleButton'
import OtpInput from '../../components/auth/OtpInput'
import Logo from '../../components/layout/Logo'
import Button from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { authApi } from '../../services/api/authApi'

export default function Login() {
  const { user, login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/'

  const [step, setStep] = useState('phone') // 'phone' | 'otp'
  const [phone, setPhone] = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const finish = useCallback(
    (tokenResponse) => {
      login(tokenResponse)
      toast.success(tokenResponse.is_new_user ? 'Welcome to STEWARD!' : 'Signed in')
      navigate(redirectTo, { replace: true })
    },
    [login, toast, navigate, redirectTo],
  )

  const onGoogle = useCallback(
    (credential) => authApi.google(credential).then(finish).catch((e) => setError(e.message)),
    [finish],
  )

  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : redirectTo} replace />

  const requestOtp = async (e) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await authApi.requestOtp(phone)
      setNormalizedPhone(res.phone)
      setResendIn(res.resend_after)
      setOtp('')
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const verifyOtp = async (e) => {
    e.preventDefault()
    if (otp.length !== 6) return setError('Enter the 6-digit code.')
    setError('')
    setBusy(true)
    try {
      finish(await authApi.verifyOtp(normalizedPhone, otp, name.trim()))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[26rem] animate-fade-up">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-[1.5rem] border border-line bg-surface p-7 shadow-[0_20px_60px_rgba(27,27,24,0.06)] sm:p-9">
          {step === 'phone' ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-ink">Sign in or create an account</h1>
              <p className="mt-1.5 text-sm text-muted">We'll text you a one-time code. No password needed.</p>
              <form onSubmit={requestOtp} className="mt-7 space-y-4" noValidate>
                <Field label="Mobile number" htmlFor="phone" error={error}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-soft">+91</span>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      error={error}
                      className="pl-12"
                      autoFocus
                      required
                    />
                  </div>
                </Field>
                <Button type="submit" className="w-full" loading={busy} disabled={phone.replace(/\D/g, '').length < 10}>
                  <Smartphone className="size-4" aria-hidden /> Send code
                </Button>
              </form>
              <div className="my-6 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
              <GoogleButton onCredential={onGoogle} />
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('phone'); setError('') }}
                className="-ml-1 mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
              >
                <ArrowLeft className="size-4" aria-hidden /> Change number
              </button>
              <h1 className="text-2xl font-bold tracking-tight text-ink">Enter your code</h1>
              <p className="mt-1.5 text-sm text-muted">
                Sent to <span className="font-semibold text-ink">{normalizedPhone}</span>. It expires in 5 minutes.
              </p>
              <form onSubmit={verifyOtp} className="mt-7 space-y-5">
                <OtpInput value={otp} onChange={(v) => { setOtp(v); setError('') }} invalid={Boolean(error)} disabled={busy} />
                {error && <p className="text-sm text-nonveg" role="alert">{error}</p>}
                <Field label="Your name" htmlFor="name" hint="Optional — used if this is your first order.">
                  <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Rao" />
                </Field>
                <Button type="submit" className="w-full" loading={busy} disabled={otp.length !== 6}>
                  Verify and continue
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted">
                Didn't get it?{' '}
                {resendIn > 0 ? (
                  <span>Resend in {resendIn}s</span>
                ) : (
                  <button onClick={requestOtp} className="font-semibold text-brand-700 hover:underline">Resend code</button>
                )}
              </p>
              {import.meta.env.DEV && (
                <p className="mt-5 rounded-lg bg-canvas px-3 py-2 text-center text-xs text-muted">
                  Development mode: the code is printed in the user-service console, not sent by SMS.
                </p>
              )}
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Restaurant admin? <a href="/admin/login" className="font-semibold text-ink-soft hover:text-ink">Sign in here</a>
        </p>
      </div>
    </div>
  )
}
