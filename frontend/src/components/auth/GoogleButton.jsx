import { useEffect, useRef, useState } from 'react'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GSI_SRC = 'https://accounts.google.com/gsi/client'

function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`)
    const script = existing || Object.assign(document.createElement('script'), { src: GSI_SRC, async: true })
    script.addEventListener('load', resolve)
    script.addEventListener('error', reject)
    if (!existing) document.head.appendChild(script)
  })
}

/**
 * "Continue with Google" via Google Identity Services. Google returns a signed
 * ID token (credential) which the User Service verifies before issuing a JWT.
 */
export default function GoogleButton({ onCredential }) {
  const container = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !container.current) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => onCredential(res.credential),
        })
        window.google.accounts.id.renderButton(container.current, {
          theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: container.current.offsetWidth,
        })
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
    }
  }, [onCredential])

  if (!CLIENT_ID || failed) {
    return (
      <div>
        <button
          type="button"
          disabled
          className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-full border border-line-strong bg-surface text-sm font-semibold text-muted"
        >
          <svg viewBox="0 0 24 24" className="size-4 opacity-50" aria-hidden>
            <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
          </svg>
          Continue with Google
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          {failed ? 'Google sign-in could not load.' : 'Google sign-in will be available once it is configured.'}
        </p>
      </div>
    )
  }
  return <div ref={container} className="flex h-11 w-full justify-center" />
}
