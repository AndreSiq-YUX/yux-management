import { useId, useState } from 'react'
import { Search } from 'lucide-react'
import { PendingBadge } from '@/components/portal-ui'
import { getPendingFeature } from '@/lib/client-portal/pendingFeatures'
import { cn } from '@/lib/utils'

/**
 * Campo de busca do cabeçalho. A busca global ainda não existe (pendência B11):
 * o campo fica visível com o selo "Pendente" e, ao ser acionado, só explica isso.
 * Nunca finge buscar.
 */
export function HeaderSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const messageId = useId()
  const feature = getPendingFeature('B11')

  return (
    <div
      className={cn('relative min-w-0', className)}
      onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false)
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? messageId : undefined}
        onClick={() => setOpen(current => !current)}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-yx-line bg-yx-surface-2 px-3 text-left text-[13.5px] text-yx-fg-3 transition-colors hover:border-yx-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Buscar…</span>
        <PendingBadge code="B11" />
      </button>
      {open ? (
        <p
          id={messageId}
          role="status"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 rounded-lg border border-yx-line bg-yx-surface p-3 text-xs leading-snug text-yx-fg-2 shadow-lg"
        >
          {feature.clientMessage}
        </p>
      ) : null}
    </div>
  )
}
