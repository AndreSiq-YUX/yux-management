import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { StatusChip } from './StatusChip'

export interface TimelineProps {
  children: ReactNode
  className?: string
  'aria-label'?: string
}

export interface TimelineItemProps {
  /** Data/hora já formatada, ex.: "hoje, 09:40". */
  when: string
  title: string
  description?: ReactNode
  tag?: string
  /** `yux` = marcador em gradiente (trabalho da YUX). */
  variant?: 'yux' | 'neutral'
  className?: string
}

/** Linha do tempo vertical. Use com `TimelineItem`. */
export function Timeline({ children, className, 'aria-label': ariaLabel }: TimelineProps) {
  return (
    <ol aria-label={ariaLabel} className={cn('m-0 grid list-none p-0', className)}>
      {children}
    </ol>
  )
}

/**
 * Item da linha do tempo. A partir de 721px: data | marcador | texto.
 * Até 720px: o marcador fica à esquerda e a data vai acima do texto.
 */
export function TimelineItem({ when, title, description, tag, variant = 'neutral', className }: TimelineItemProps) {
  return (
    <li
      data-variant={variant}
      className={cn(
        'group/tl grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 min-[721px]:grid-cols-[92px_18px_minmax(0,1fr)]',
        className,
      )}
    >
      <time className="col-start-2 row-start-1 pt-0.5 font-mono text-[11.5px] leading-[1.4] text-yx-fg-3 min-[721px]:col-start-1 min-[721px]:text-right">
        {when}
      </time>
      <div
        aria-hidden="true"
        className="relative col-start-1 row-span-2 row-start-1 flex justify-center after:absolute after:bottom-0 after:top-[18px] after:w-px after:bg-yx-line-strong after:content-[''] group-last/tl:after:hidden min-[721px]:col-start-2 min-[721px]:row-span-1"
      >
        <span
          data-testid="timeline-dot"
          className={cn(
            'relative z-[1] mt-1 h-3 w-3 rounded-full shadow-[0_0_0_3px_var(--yx-surface)]',
            variant === 'yux' ? 'bg-brand-gradient' : 'border-2 border-yx-line-strong bg-yx-surface',
          )}
        />
      </div>
      <div className="col-start-2 row-start-2 pb-[18px] min-[721px]:col-start-3 min-[721px]:row-start-1">
        <h3 className="font-sans text-sm font-semibold leading-[1.35] text-yx-fg">{title}</h3>
        {description ? <p className="mb-1.5 mt-[3px] text-[13px] leading-normal text-yx-fg-2">{description}</p> : null}
        {tag ? <StatusChip className="mt-1">{tag}</StatusChip> : null}
      </div>
    </li>
  )
}
