import { cn } from '@/lib/utils'

export interface BarListItem {
  label: string
  /** Valor numérico usado para escalar a barra (proporcional ao maior valor). */
  value: number
  /** Texto mostrado à direita; por padrão, o próprio valor. */
  display?: string
}

export interface BarListProps {
  items: BarListItem[]
  className?: string
  'aria-label'?: string
}

export interface FunnelStage extends BarListItem {
  /** Texto de conversão exibido sob a barra, ex.: "42% avançaram". */
  conv?: string
}

export interface FunnelBarsProps {
  stages: FunnelStage[]
  /** Índice da etapa com maior perda; recebe destaque em cor de alerta. */
  bottleneckIndex?: number
  /** Cabeçalho opcional da lista (ex.: `{ left: 'Etapa', right: 'Leads · valor' }`). */
  header?: { left: string; right: string }
  className?: string
  'aria-label'?: string
}

/** Largura da barra em % (0–100), proporcional ao maior valor. */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0
  return Math.min(100, (value / max) * 100)
}

function Row({
  item,
  max,
  highlight,
  conv,
}: {
  item: BarListItem
  max: number
  highlight?: boolean
  conv?: string
}) {
  const pct = barPercent(item.value, max)
  return (
    <li className="grid gap-[5px]">
      <div className="flex justify-between gap-2.5 text-[13px]">
        <span className={cn('min-w-0 font-medium', highlight && 'text-yx-warn')}>{item.label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-yx-fg-3">{item.display ?? String(item.value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-[3px] bg-yx-bar-track" aria-hidden="true">
        <div
          data-testid="bar-fill"
          className={cn('h-full rounded-[3px]', highlight ? 'bg-yx-warn' : 'bg-yx-blue')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {conv ? (
        <span className={cn('pl-0.5 font-mono text-[11px]', highlight ? 'font-medium text-yx-warn' : 'text-yx-fg-3')}>{conv}</span>
      ) : null}
    </li>
  )
}

/** Lista de barras horizontais escaladas ao maior valor. */
export function BarList({ items, className, 'aria-label': ariaLabel }: BarListProps) {
  const max = Math.max(0, ...items.map(i => i.value))
  return (
    <ul aria-label={ariaLabel} className={cn('m-0 grid list-none gap-2.5 p-0', className)}>
      {items.map((item, i) => (
        <Row key={`${item.label}-${i}`} item={item} max={max} />
      ))}
    </ul>
  )
}

/** Funil em barras: como `BarList`, com texto de conversão por etapa e destaque do gargalo. */
export function FunnelBars({ stages, bottleneckIndex, header, className, 'aria-label': ariaLabel }: FunnelBarsProps) {
  const max = Math.max(0, ...stages.map(s => s.value))
  return (
    <div className={cn('grid content-start gap-2.5', className)}>
      {header ? (
        <div className="flex justify-between font-mono text-[11px] font-medium uppercase leading-none tracking-[0.07em] text-yx-fg-3">
          <span>{header.left}</span>
          <span>{header.right}</span>
        </div>
      ) : null}
      <ul aria-label={ariaLabel} className="m-0 grid list-none gap-2.5 p-0">
        {stages.map((stage, i) => (
          <Row key={`${stage.label}-${i}`} item={stage} max={max} conv={stage.conv} highlight={i === bottleneckIndex} />
        ))}
      </ul>
    </div>
  )
}
