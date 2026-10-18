import { useCallback, useRef } from 'react'

/**
 * Radix só devolve o foco quando o diálogo tem um `Trigger`. Os diálogos do portal são abertos por estado,
 * então guardamos o elemento focado antes de abrir e o refocamos ao fechar.
 * Use: `<DialogPrimitive.Content {...useDialogFocusReturn()}>`.
 */
export function useDialogFocusReturn() {
  const previous = useRef<HTMLElement | null>(null)
  const onOpenAutoFocus = useCallback(() => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [])
  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault()
    const target = previous.current
    previous.current = null
    if (target && target.isConnected) target.focus()
  }, [])
  return { onOpenAutoFocus, onCloseAutoFocus }
}
