import { Children, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface KpiGridProps {
  /** Quantidade de indicadores. Se omitida, usa o número de filhos. */
  count?: number
  children: ReactNode
  /** `card` desenha borda, raio e sombra próprios; `flush` (padrão) só traça a linha superior, para ficar dentro de um SectionCard. */
  variant?: 'flush' | 'card'
  className?: string
  'aria-label'?: string
}

/**
 * Classes de colunas por quantidade de indicadores, de modo que nenhuma linha fique com um cartão sozinho
 * nas larguras padrão (390 / 768 / 1280 / 1440, com menu de 264px a partir de 1024px).
 *  - 6 → 2 / 3 / 6 colunas (6 só a partir de 1480px)
 *  - 4 → 2 / 4
 *  - 3 → 1 / 3
 *  - 2 → 2
 *  - demais → 2 / 3
 */
export function getKpiGridColumns(count: number): string {
  switch (count) {
    case 6:
      return 'grid-cols-2 md:grid-cols-3 min-[1480px]:grid-cols-6'
    case 4:
      return 'grid-cols-2 min-[1280px]:grid-cols-4'
    case 3:
      return 'grid-cols-1 md:grid-cols-3'
    case 2:
      return 'grid-cols-2'
    default:
      return 'grid-cols-2 md:grid-cols-3'
  }
}

/**
 * Grade de indicadores com divisórias internas. Cada filho (normalmente `KpiCard`) recebe
 * borda direita e inferior; o excesso é recortado pelo contêiner (`-mr-px -mb-px` + `overflow-hidden`).
 */
export function KpiGrid({ count, children, variant = 'flush', className, 'aria-label': ariaLabel }: KpiGridProps) {
  const total = count ?? Children.toArray(children).length
  return (
    <div
      className={cn(
        'overflow-hidden border-t border-yx-line',
        variant === 'card' &&
          'rounded-[10px] border border-yx-line bg-yx-surface shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none',
        className,
      )}
    >
      <ul
        aria-label={ariaLabel}
        data-columns={getKpiGridColumns(total)}
        className={cn(
          '-mb-px -mr-px grid list-none p-0',
          getKpiGridColumns(total),
          '[&>li]:min-w-0 [&>li]:border-b [&>li]:border-r [&>li]:border-yx-line',
        )}
      >
        {Children.toArray(children).map((child, i) => (
          <li key={i} className="flex">
            <div className="flex min-w-0 flex-1 flex-col">{child}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
