import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { cn } from '@/lib/utils'
import { Sparkline, type SparklineTone } from './Sparkline'

export type KpiTone = SparklineTone

export interface KpiCardProps {
  label: string
  value: string
  /** `tone` descreve o significado (bom/ruim/neutro), não a direção da seta. */
  delta?: { text: string; tone: KpiTone }
  /** Texto de comparação, ex.: "vs. 7 dias antes". */
  comparison?: string
  spark?: number[]
  /** Caminho interno (ex.: `/portal/leads`); convertido por `usePortalWorkspacePath()`. */
  href?: string
  /** Substitui o valor (ex.: `<PendingBadge code="B5" />`). */
  pending?: ReactNode
  className?: string
}

const deltaClasses: Record<KpiTone, string> = {
  good: 'bg-yx-ok-soft text-yx-ok',
  bad: 'bg-yx-crit-soft text-yx-crit',
  flat: 'bg-yx-surface-2 text-yx-fg-3',
}

/**
 * Indicador do portal: rótulo, valor, variação com cor de significado, comparação e mini-gráfico.
 * Com `href` vira link (seta no canto superior direito).
 */
export function KpiCard({ label, value, delta, comparison, spark, href, pending, className }: KpiCardProps) {
  const toWorkspace = usePortalWorkspacePath()
  const hasPending = pending !== undefined && pending !== null

  const content = (
    <>
      <span className="pr-[18px] font-mono text-[11px] font-medium uppercase leading-[1.3] tracking-[0.07em] text-yx-fg-3">
        {label}
      </span>
      {href ? (
        <ArrowUpRight
          aria-hidden="true"
          className="absolute right-3.5 top-3.5 h-[15px] w-[15px] -translate-x-0.5 text-yx-blue opacity-45 transition group-hover/kpi:translate-x-0 group-hover/kpi:opacity-100 motion-reduce:transition-none"
        />
      ) : null}
      {hasPending ? (
        <span className="flex min-h-[29px] items-center">{pending}</span>
      ) : (
        <span
          className={cn(
            'whitespace-nowrap font-display font-semibold leading-[1.05] tracking-[-0.02em] tabular-nums',
            // Valores longos (ex.: "R$ 127.400,00") encolhem para caber na coluna sem cortar.
            value.length > 10 ? 'text-[19px] min-[721px]:text-[22px] min-[1280px]:text-[26px]' : 'text-2xl min-[721px]:text-[28px]',
          )}
        >
          {value}
        </span>
      )}
      {!hasPending && (delta || comparison) ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-yx-fg-3">
          {delta ? (
            <span
              data-tone={delta.tone}
              className={cn('rounded-full px-[7px] py-px font-mono text-[11.5px] font-semibold leading-[1.4]', deltaClasses[delta.tone])}
            >
              {delta.text}
            </span>
          ) : null}
          {comparison ? <span>{comparison}</span> : null}
        </span>
      ) : null}
      {!hasPending && spark ? <Sparkline values={spark} tone={delta?.tone ?? 'good'} /> : null}
    </>
  )

  const base =
    'group/kpi relative grid h-full w-full content-start gap-1.5 px-[18px] pb-3.5 pt-4 text-yx-fg no-underline'

  if (href) {
    return (
      <Link
        to={toWorkspace(href)}
        className={cn(
          base,
          'transition-colors hover:bg-yx-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yx-blue',
          className,
        )}
      >
        {content}
      </Link>
    )
  }

  return <div className={cn(base, className)}>{content}</div>
}
