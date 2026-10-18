import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCircle2, Wallet } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatDueLabel } from '@/lib/client-portal/portalDisplay'
import { usePortalBadgeStore } from '@/stores/portalBadgeStore'

const itemClasses =
  'flex min-h-10 items-start gap-2.5 rounded-md px-2.5 py-2 text-sm text-yx-fg transition-colors hover:bg-yx-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Sino do cabeçalho: junta o que espera o cliente (aprovações e faturas a vencer). Sem pendências, sem número. */
export function NotificationsMenu() {
  const pendingApprovals = usePortalBadgeStore(state => state.pendingApprovals)
  const dueInvoices = usePortalBadgeStore(state => state.dueInvoices)
  const portalPath = usePortalWorkspacePath()
  const [open, setOpen] = useState(false)

  const total = pendingApprovals + dueInvoices.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={total > 0 ? `Notificações: ${total} ${total === 1 ? 'pendência' : 'pendências'}` : 'Notificações'}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-transparent text-yx-fg-2 transition-colors hover:bg-yx-surface-2 hover:text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {total > 0 ? (
            <span
              data-testid="bell-count"
              className="absolute right-1 top-1 min-w-[16px] rounded-full bg-yx-crit px-1 font-mono text-[10px] font-semibold leading-4 text-white"
            >
              {total > 99 ? '99+' : total}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] border-yx-line bg-yx-surface p-2">
        <p className="px-2.5 pb-1.5 pt-1 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">
          Pendências
        </p>
        {total === 0 ? (
          <p className="px-2.5 py-3 text-sm text-yx-fg-2">Nada pendente agora.</p>
        ) : (
          <ul className="grid gap-0.5">
            {pendingApprovals > 0 ? (
              <li>
                <Link to={portalPath('/portal/projetos/aprovacoes')} onClick={() => setOpen(false)} className={itemClasses}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-yx-blue" aria-hidden="true" />
                  <span>
                    {pendingApprovals} {pendingApprovals === 1 ? 'aprovação aguardando' : 'aprovações aguardando'} você
                  </span>
                </Link>
              </li>
            ) : null}
            {dueInvoices.map(invoice => (
              <li key={invoice.id}>
                <Link to={portalPath('/portal/financeiro')} onClick={() => setOpen(false)} className={itemClasses}>
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-yx-warn" aria-hidden="true" />
                  <span>
                    {invoice.label}
                    <span className="block text-xs text-yx-fg-3">{formatDueLabel(invoice.dueDate)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
