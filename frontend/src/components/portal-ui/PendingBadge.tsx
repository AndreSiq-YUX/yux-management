import { getPendingFeature, type PendingCode } from '@/lib/client-portal/pendingFeatures'
import { cn } from '@/lib/utils'

export interface PendingBadgeProps {
  code: PendingCode
  className?: string
}

/** Selo "Pendente" para funções que dependem de algo ainda em implantação. */
export function PendingBadge({ code, className }: PendingBadgeProps) {
  const feature = getPendingFeature(code)
  return (
    <span
      title={feature.clientMessage}
      aria-label={`Pendente: ${feature.title}`}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-medium leading-none text-amber-800',
        className,
      )}
    >
      Pendente
    </span>
  )
}
