import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  /** Rótulo mono em caixa alta acima do título. */
  eyebrow?: string
  /** Indicador de atualização dos dados (ponto verde + texto), ex.: "dados atualizados há 12 min". */
  live?: { label: string }
  title: string
  lead?: ReactNode
  /** Linha de etiquetas de contexto (StatusChip). */
  meta?: ReactNode
  /** Ações à direita; empilham abaixo do título no celular. Uma única ação principal por página. */
  actions?: ReactNode
  className?: string
}

/**
 * Cabeçalho de página do portal: eyebrow + status "ao vivo", h1, frase de apoio, etiquetas e ações.
 */
export function PageHeader({ eyebrow, live, title, lead, meta, actions, className }: PageHeaderProps) {
  const hasTopLine = Boolean(eyebrow || live)
  return (
    <header
      className={cn(
        'flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-x-6',
        className,
      )}
    >
      <div className="min-w-0 md:flex-1">
        {hasTopLine ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.1em] text-yx-fg-3">
            {eyebrow ? <span>{eyebrow}</span> : null}
            {live ? (
              <span className="inline-flex items-center gap-2 normal-case tracking-normal">
                <span
                  aria-hidden="true"
                  className="h-[7px] w-[7px] rounded-full bg-yx-ok shadow-[0_0_0_3px_var(--yx-ok-soft)]"
                />
                {live.label}
              </span>
            ) : null}
          </div>
        ) : null}
        <h1
          className={cn(
            'font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.02em] text-yx-fg [text-wrap:balance] md:text-[30px]',
            hasTopLine ? 'mt-2.5' : '',
          )}
        >
          {title}
        </h1>
        {lead ? <div className="mt-1.5 max-w-[62ch] text-[14.5px] leading-normal text-yx-fg-2 md:text-base">{lead}</div> : null}
        {meta ? <div className="mt-3.5 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </header>
  )
}
