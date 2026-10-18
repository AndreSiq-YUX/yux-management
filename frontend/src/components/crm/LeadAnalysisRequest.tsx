import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Sparkles } from 'lucide-react'
import { portalButtonClasses } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { cn } from '@/lib/utils'

/**
 * Bloco recolhido "Pedir análise à YUX" da tela de Leads (variante portal).
 * O pedido segue pelo Suporte do portal; a equipe YUX responde com a análise.
 */
export function LeadAnalysisRequest({ funnelName }: { funnelName?: string }) {
  const [open, setOpen] = useState(false)
  const portalPath = usePortalWorkspacePath()

  return (
    <section className="rounded-[10px] border border-yx-line bg-yx-surface" aria-label="Pedir análise à YUX">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="lead-analysis-body"
        onClick={() => setOpen(current => !current)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
      >
        <span className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-yx-fg">
          <Sparkles aria-hidden="true" className="h-4 w-4 text-yx-blue" />
          Pedir análise à YUX
        </span>
        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 text-yx-fg-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id="lead-analysis-body" className="space-y-3 border-t border-yx-line px-4 py-4">
          <p className="max-w-[62ch] text-[13.5px] leading-normal text-yx-fg-2">
            A equipe da YUX pode olhar {funnelName ? `o funil "${funnelName}"` : 'o seu funil'} com você: apontar oportunidades paradas,
            revisar o acompanhamento e sugerir as próximas tarefas comerciais.
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-xs text-yx-fg-2">
            {['Priorizar leads parados', 'Revisar o acompanhamento', 'Entender objeções repetidas'].map(item => (
              <li key={item} className="rounded-full border border-yx-line-strong px-2.5 py-1">{item}</li>
            ))}
          </ul>
          <Link to={portalPath('/portal/suporte')} className={portalButtonClasses('primary')}>
            Abrir pedido no Suporte
          </Link>
        </div>
      )}
    </section>
  )
}
