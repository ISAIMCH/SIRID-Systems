import { useEffect, useState } from 'react'
import { quoteSale } from '../services/api'
import type { StoreQuote } from '../services/api'

interface QuoteInput {
  userId?: string
  items: Array<{ productId: string; quantity: number }>
  promotionId?: string
  gymId?: string
}

// Asks the API for the price of the items (debounced) and tells whether the quote shown matches them, so a total
// is only ever confirmed when it is the server's answer for exactly what is on screen.
export function useStoreQuote(input: QuoteInput, enabled = true) {
  const key = JSON.stringify(input)
  const [state, setState] = useState<{ key: string; quote: StoreQuote | null; error: string | null } | null>(null)

  useEffect(() => {
    if (!enabled || input.items.length === 0) return
    let isCurrent = true
    const timer = setTimeout(() => {
      quoteSale(JSON.parse(key) as QuoteInput)
        .then((response) => { if (isCurrent) setState({ key, quote: response.quote, error: null }) })
        .catch((error: unknown) => {
          if (isCurrent) setState({ key, quote: null, error: error instanceof Error ? error.message : 'No se pudo calcular el total.' })
        })
    }, 250)
    return () => { isCurrent = false; clearTimeout(timer) }
    // key holds every field of input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  const isCurrent = state?.key === key
  return {
    quote: isCurrent ? state.quote : null,
    error: isCurrent ? state.error : null,
    isLoading: enabled && input.items.length > 0 && !isCurrent,
  }
}
