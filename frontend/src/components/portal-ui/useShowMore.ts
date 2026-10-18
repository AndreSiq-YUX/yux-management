import { useEffect, useState } from 'react'

export const SHOW_MORE_STEP = 10

/**
 * Paginação "Mostrar mais" para listas longas: começa com `step` itens e libera +`step` a cada clique.
 * `enabled = false` mostra a lista inteira (ex.: telas largas em listas que só limitam no celular).
 * Volta ao início quando `resetKey` muda (novo filtro, nova busca).
 */
export function useShowMore<T>(items: T[], { step = SHOW_MORE_STEP, enabled = true, resetKey }: { step?: number; enabled?: boolean; resetKey?: unknown } = {}) {
  const [visible, setVisible] = useState(step)

  useEffect(() => {
    setVisible(step)
  }, [resetKey, step])

  const limited = enabled && items.length > visible
  return {
    visibleItems: enabled ? items.slice(0, visible) : items,
    hasMore: limited,
    shown: enabled ? Math.min(visible, items.length) : items.length,
    total: items.length,
    showMore: () => setVisible(current => current + step),
  }
}
