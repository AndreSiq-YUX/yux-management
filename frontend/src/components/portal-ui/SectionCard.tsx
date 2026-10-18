import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SectionCardProps {
  id?: string
  title: string
  description?: ReactNode
  /** Link "ver mais" (ou outra ação) alinhado à direita do título. */
  action?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
}

/** Classes de um link de seção ("Ver tudo →"), para usar dentro de `action`. */
export const sectionLinkClasses =
  'inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded text-[13px] font-semibold text-yx-blue no-underline hover:text-yx-blue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue sm:min-h-0 [&_svg]:h-[15px] [&_svg]:w-[15px]'

/** Cartão de seção: cabeçalho (h2 + descrição + ação) e corpo. */
export function SectionCard({ id, title, description, action, children, className, bodyClassName }: SectionCardProps) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'min-w-0 rounded-[10px] border border-yx-line bg-yx-surface text-yx-fg shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-[18px] pt-4">
        <div className="min-w-0 flex-1 basis-[170px]">
          <h2 id={headingId} className="font-display text-base font-semibold leading-[1.3] tracking-[-0.01em]">
            {title}
          </h2>
          {description ? <p className="mt-[3px] text-[13px] leading-snug text-yx-fg-3">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children !== undefined && children !== null ? <div className={cn('px-[18px] pb-[18px] pt-3.5', bodyClassName)}>{children}</div> : null}
    </section>
  )
}
