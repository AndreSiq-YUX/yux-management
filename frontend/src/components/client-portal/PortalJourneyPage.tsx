import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { PortalPage, type PortalPageLink, type PortalPageMetric } from './PortalPage'

export type PortalJourneyMetric = PortalPageMetric
export type PortalJourneyAction = PortalPageLink

interface PortalJourneyPageProps {
  title: string
  description: string
  eyebrow?: string
  /** Mantido por compatibilidade; o novo modelo não usa ícone no cabeçalho. */
  icon?: LucideIcon
  metrics?: PortalJourneyMetric[]
  capabilities?: string[]
  primaryAction?: PortalJourneyAction
  secondaryActions?: PortalJourneyAction[]
  /** Mantido por compatibilidade; notas em âmbar não são mais exibidas. */
  note?: string
  /** Mantido por compatibilidade; a ajuda sempre fica atrás do botão de ajuda. */
  showCapabilities?: boolean
  children?: ReactNode
}

/**
 * Compatibilidade: mantém os nomes de props do modelo antigo, mas renderiza com `PortalPage`.
 * `capabilities` → `help`, `secondaryActions` → `related`; `note` e `icon` são ignorados.
 * Páginas novas devem usar `PortalPage` diretamente.
 */
export function PortalJourneyPage({
  title,
  description,
  eyebrow,
  metrics,
  capabilities,
  primaryAction,
  secondaryActions,
  children,
}: PortalJourneyPageProps) {
  return (
    <PortalPage
      eyebrow={eyebrow}
      title={title}
      description={description}
      metrics={metrics}
      help={capabilities}
      primaryAction={primaryAction}
      related={secondaryActions}
    >
      {children}
    </PortalPage>
  )
}
