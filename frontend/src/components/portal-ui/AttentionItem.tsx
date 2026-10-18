import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusChip, type StatusChipVariant } from './StatusChip'

export type AttentionPriority = 'high' | 'medium' | 'low'

export interface AttentionItemProps {
  priority: AttentionPriority
  title: string
  description?: ReactNode
  /** Responsável (ex.: "Equipe comercial"). */
  owner?: string
  /** Quando verdadeiro, mostra a etiqueta "YUX cuidando" no lugar do responsável. */
  ownerIsYux?: boolean
  /** Tempo de espera, ex.: "há 2 dias". */
  wait?: string
  action?: ReactNode
  className?: string
}

export const attentionPriorityLabel: Record<AttentionPriority, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

const chipVariant: Record<AttentionPriority, StatusChipVariant> = {
  high: 'crit',
  medium: 'warn',
  low: 'neutral',
}

const stripe: Record<AttentionPriority, string> = {
  high: 'bg-yx-crit',
  medium: 'bg-yx-warn',
  low: 'bg-yx-line-strong',
}

/** Item da lista "Precisa de atenção": prioridade escrita, responsável, espera e ação. */
export function AttentionItem({ priority, title, description, owner, ownerIsYux, wait, action, className }: AttentionItemProps) {
  return (
    <article
      data-priority={priority}
      className={cn(
        'relative grid grid-cols-1 items-center gap-x-3 gap-y-2 overflow-hidden rounded-lg border border-yx-line bg-yx-surface py-3 pl-3.5 pr-3 min-[480px]:grid-cols-[minmax(0,1fr)_auto]',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px]', stripe[priority])} />
      <div className="min-w-0">
        <h3 className="font-sans text-sm font-semibold leading-[1.35] text-yx-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-[12.5px] leading-snug text-yx-fg-3">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center min-[480px]:justify-end">{action}</div> : null}
      <div className="flex flex-wrap gap-1.5 min-[480px]:col-span-full">
        <StatusChip variant={chipVariant[priority]}>{attentionPriorityLabel[priority]}</StatusChip>
        {ownerIsYux ? <StatusChip variant="yux">YUX cuidando</StatusChip> : owner ? <StatusChip>{owner}</StatusChip> : null}
        {wait ? <StatusChip icon={Clock}>{wait}</StatusChip> : null}
      </div>
    </article>
  )
}
