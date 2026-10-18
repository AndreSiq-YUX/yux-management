import { cn } from '@/lib/utils'

export type PortalPeriod = 'today' | '7d' | '30d'

export const PORTAL_PERIOD_OPTIONS: ReadonlyArray<{ value: PortalPeriod; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
]

export interface PeriodSelectorProps {
  value: PortalPeriod
  onChange: (value: PortalPeriod) => void
  /** Frase de comparação, ex.: "comparado aos 7 dias anteriores". */
  caption?: string
  className?: string
}

/** Controle segmentado Hoje / 7 dias / 30 dias (controlado), com a frase de comparação. */
export function PeriodSelector({ value, onChange, caption, className }: PeriodSelectorProps) {
  return (
    <div className={cn('grid gap-1.5 justify-items-start md:justify-items-end', className)}>
      <div role="group" aria-label="Período" className="inline-flex rounded-lg border border-yx-line bg-yx-surface p-[3px]">
        {PORTAL_PERIOD_OPTIONS.map(option => {
          const pressed = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(option.value)}
              className={cn(
                'h-10 rounded-md px-3.5 font-sans text-[13px] font-medium transition-colors sm:h-8',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue focus-visible:ring-offset-2 focus-visible:ring-offset-yx-surface',
                pressed ? 'bg-yx-fg text-yx-bg' : 'text-yx-fg-2 hover:text-yx-fg',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {caption ? <small className="font-mono text-[11px] text-yx-fg-3">{caption}</small> : null}
    </div>
  )
}
