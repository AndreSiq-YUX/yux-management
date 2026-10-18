import type { ReactNode } from 'react'
import { getPendingFeature, type PendingCode } from '@/lib/client-portal/pendingFeatures'
import { cn } from '@/lib/utils'
import { PendingBadge } from './PendingBadge'

export interface PendingSectionProps {
  code: PendingCode
  title: string
  description?: string
  /** Substitui a mensagem padrão do registro (use quando duas pendências iguais aparecem juntas). */
  message?: string
  className?: string
  children?: ReactNode
}

/** Bloco inteiro que depende de função em implantação: mantém-se visível e explicado. */
export function PendingSection({ code, title, description, message, className, children }: PendingSectionProps) {
  const feature = getPendingFeature(code)
  return (
    <section className={cn('rounded-lg border border-dashed border-yx-warn-line bg-yx-warn-soft p-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-yx-fg">{title}</h3>
        <PendingBadge code={code} />
      </div>
      {description ? <p className="mt-1 text-sm text-yx-fg-2">{description}</p> : null}
      <p className="mt-3 text-sm text-yx-fg-2">{message ?? feature.clientMessage}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}
