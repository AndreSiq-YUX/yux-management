import type { ReactNode } from 'react'
import { Clock, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DecisionTone = 'warn' | 'crit' | 'yux' | 'neutral'

export interface DecisionCardProps {
  /** Cor da faixa lateral de 3px. `yux` (gradiente/violeta) = quem pede é a YUX ou um agente. */
  tone: DecisionTone
  module: { label: string; icon?: LucideIcon }
  /** Tempo de espera, ex.: "aguardando há 2 dias". */
  wait?: string
  title: string
  description?: ReactNode
  /** Até duas ações; botão em gradiente (`portalButtonClasses('yux')`) só quando a YUX/agente pede. */
  actions?: ReactNode
  className?: string
}

const stripe: Record<DecisionTone, string> = {
  warn: 'bg-yx-warn',
  crit: 'bg-yx-crit',
  yux: 'bg-brand-violet-500',
  neutral: 'bg-yx-line-strong',
}

/** Cartão de decisão pendente do cliente: faixa de urgência, módulo, espera, texto e ações. */
export function DecisionCard({ tone, module, wait, title, description, actions, className }: DecisionCardProps) {
  const ModuleIcon = module.icon
  return (
    <article
      data-tone={tone}
      className={cn(
        'relative grid content-start gap-2.5 overflow-hidden rounded-lg border border-yx-line bg-yx-surface p-3.5 pl-[17px]',
        className,
      )}
    >
      <span aria-hidden="true" data-testid="decision-stripe" className={cn('absolute inset-y-0 left-0 w-[3px]', stripe[tone])} />
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-yx-fg-3">
          {ModuleIcon ? <ModuleIcon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
          {module.label}
        </span>
        {wait ? (
          <span className="inline-flex items-center gap-[5px] font-mono text-[11.5px] text-yx-fg-3">
            <Clock aria-hidden="true" className="h-[13px] w-[13px]" />
            {wait}
          </span>
        ) : null}
      </div>
      <h3 className="font-display text-[15px] font-semibold leading-[1.35] text-yx-fg">{title}</h3>
      {description ? <p className="text-[13px] leading-normal text-yx-fg-2">{description}</p> : null}
      {actions ? <div className="mt-0.5 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  )
}
