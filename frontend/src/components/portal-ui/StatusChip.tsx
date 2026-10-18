import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusChipVariant = 'ok' | 'warn' | 'crit' | 'neutral' | 'yux'

export interface StatusChipProps {
  variant?: StatusChipVariant
  icon?: LucideIcon
  children: ReactNode
  className?: string
}

const variantClasses: Record<StatusChipVariant, string> = {
  neutral: 'border-yx-line-strong bg-yx-surface text-yx-fg-2',
  ok: 'border-yx-ok-line bg-yx-ok-soft text-yx-ok',
  warn: 'border-yx-warn-line bg-yx-warn-soft text-yx-warn',
  crit: 'border-yx-crit-line bg-yx-crit-soft text-yx-crit',
  // Borda em gradiente = feito pela YUX / IA.
  yux: 'border-transparent text-brand-violet-500 dark:text-brand-violet-400',
}

const yuxStyle: CSSProperties = {
  background: 'linear-gradient(var(--yx-surface), var(--yx-surface)) padding-box, var(--yx-grad-brand) border-box',
}

/**
 * Pílula mono de status. `yux` usa borda em gradiente (trabalho feito pela YUX).
 */
export function StatusChip({ variant = 'neutral', icon: Icon, children, className }: StatusChipProps) {
  return (
    <span
      data-variant={variant}
      style={variant === 'yux' ? yuxStyle : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] font-mono text-[11.5px] font-medium leading-normal',
        variantClasses[variant],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="h-[13px] w-[13px] shrink-0" /> : null}
      {children}
    </span>
  )
}
