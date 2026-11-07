import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

// Inicio's quick actions link to a page with ?accion=<name>; the page opens that form once and drops the parameter,
// so going back or reloading does not open it again.
export function useQuickAction(name: string, open: () => void, enabled = true) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('accion') === name
  const openRef = useRef(open)
  useLayoutEffect(() => {
    openRef.current = open
  })

  useEffect(() => {
    if (!requested) return
    if (enabled) openRef.current()
    setSearchParams((params) => {
      params.delete('accion')
      return params
    }, { replace: true })
  }, [requested, enabled, setSearchParams])
}
