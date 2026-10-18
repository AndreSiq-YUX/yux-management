import { cn } from '@/lib/utils'
import { getKpiGridColumns } from './KpiGrid'

const pulse = 'animate-pulse rounded bg-yx-bar-track motion-reduce:animate-none'

export interface SkeletonLinesProps {
  lines?: number
  className?: string
}

/** Linhas de texto em carregamento (a última é mais curta). */
export function SkeletonLines({ lines = 3, className }: SkeletonLinesProps) {
  return (
    <div role="status" aria-label="Carregando" aria-busy="true" className={cn('grid gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          data-skeleton="line"
          className={cn(pulse, 'h-3', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  )
}

export interface SkeletonCardProps {
  lines?: number
  className?: string
}

/** Cartão de seção em carregamento (título + linhas). */
export function SkeletonCard({ lines = 4, className }: SkeletonCardProps) {
  return (
    <div
      role="status"
      aria-label="Carregando"
      aria-busy="true"
      className={cn('rounded-[10px] border border-yx-line bg-yx-surface p-[18px]', className)}
    >
      <div data-skeleton="title" className={cn(pulse, 'mb-4 h-4 w-1/3')} />
      <div className="grid gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            data-skeleton="line"
            className={cn(pulse, 'h-3', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
          />
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  )
}

export interface SkeletonKpiGridProps {
  count?: number
  className?: string
}

/** Grade de indicadores em carregamento, com as mesmas colunas do `KpiGrid`. */
export function SkeletonKpiGrid({ count = 6, className }: SkeletonKpiGridProps) {
  return (
    <div role="status" aria-label="Carregando" aria-busy="true" className={cn('overflow-hidden border-t border-yx-line', className)}>
      <div
        className={cn(
          '-mb-px -mr-px grid',
          getKpiGridColumns(count),
          '[&>div]:border-b [&>div]:border-r [&>div]:border-yx-line',
        )}
      >
        {Array.from({ length: count }, (_, i) => (
          <div key={i} data-skeleton="kpi" className="grid gap-2.5 px-[18px] pb-3.5 pt-4">
            <div className={cn(pulse, 'h-3 w-1/2')} />
            <div className={cn(pulse, 'h-7 w-2/3')} />
            <div className={cn(pulse, 'h-3 w-1/3')} />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  )
}
