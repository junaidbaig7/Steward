import { useEffect } from 'react'

/** Calls `fn` every `ms` while `enabled`, pausing when the browser tab is hidden. */
export function usePolling(fn, ms, enabled) {
  useEffect(() => {
    if (!enabled) return
    const tick = () => document.visibilityState === 'visible' && fn()
    const id = setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [fn, ms, enabled])
}
