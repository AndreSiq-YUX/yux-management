import { useEffect, useState } from 'react'

function read(query: string, fallback: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback
  return window.matchMedia(query).matches
}

/**
 * Acompanha uma media query. Sem `matchMedia` (testes, renderização no servidor) devolve `fallback`.
 * Usado para trocar entre layout de computador e de celular (lista/detalhe, grade/agenda).
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const [matches, setMatches] = useState(() => read(query, fallback))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener?.('change', update)
    return () => list.removeEventListener?.('change', update)
  }, [query])

  return matches
}
