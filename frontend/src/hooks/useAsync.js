import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async function and tracks { data, loading, error }.
 * Re-runs when `deps` change; ignores responses from stale calls.
 *
 *   const { data, loading, error, reload } = useAsync(() => restaurantApi.get(id), [id])
 */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, loading: immediate, error: null })
  const callId = useRef(0)

  const run = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++callId.current
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const data = await fn()
        if (id === callId.current) setState({ data, loading: false, error: null })
        return data
      } catch (error) {
        if (id === callId.current) setState((s) => ({ ...s, loading: false, error }))
        return undefined
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  )

  useEffect(() => {
    if (immediate) run()
  }, [run, immediate])

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return { ...state, reload: run, setData }
}
