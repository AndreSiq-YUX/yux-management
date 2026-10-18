import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ProgressRowProps {
  title: string
  subtitle?: string
  /** 0–100; valores fora do intervalo (ou inválidos) são limitados. */
  percent: number
  /** Etiqueta de status (StatusChip). */
  status?: ReactNode
  className?: string
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

/** Linha de entrega com barra de progresso em gradiente (trabalho da YUX) e status. */
export function ProgressRow({ title, subtitle, percent, status, className }: ProgressRowProps) {
  const pct = clampPercent(percent)
  return (
    <div className={cn('grid gap-[7px]', className)}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="font-sans text-sm font-semibold leading-[1.35] text-yx-fg">{title}</h3>
          {subtitle ? <p className="mt-px text-[12.5px] leading-snug text-yx-fg-3">{subtitle}</p> : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      <div className="flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}%`}
          className="h-2 flex-1 overflow-hidden rounded-[3px] bg-yx-bar-track"
        >
          <div className="h-full rounded-[3px] bg-brand-gradient" style={{ width: `${pct}%` }} />
        </div>
        <span aria-hidden="true" className="min-w-9 text-right font-mono text-xs font-medium tabular-nums text-yx-fg-2">
          {pct}%
        </span>
      </div>
    </div>
  )
}
