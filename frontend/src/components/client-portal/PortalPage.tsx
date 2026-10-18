import { isValidElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, HelpCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { KpiCard, KpiGrid, PageHeader, portalButtonClasses, portalFocusRing } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { cn } from '@/lib/utils'

export interface PortalPageMetric {
  label: string
  value: string
  /** Texto de apoio abaixo do valor. */
  detail?: string
  /** Caminho interno (`/portal/...`); transforma o indicador em link. */
  href?: string
}

export interface PortalPageLink {
  label: string
  /** Caminho interno (`/portal/...`); convertido por `usePortalWorkspacePath()`. */
  href: string
}

export interface PortalPageProps {
  eyebrow?: string
  title: string
  description?: string
  /**
   * A ação que faz o trabalho DESTA página (ex.: "Nova tarefa"). Aceita um link `{ label, href }`
   * ou qualquer elemento (botão, `PendingAction`…). Links para outras páginas vão em `related`.
   */
  primaryAction?: PortalPageLink | ReactNode
  /** Somente números reais; a grade escolhe colunas que preenchem a linha. */
  metrics?: PortalPageMetric[]
  /** Explicações da área; aparecem só atrás do botão de ajuda ("Como esta área funciona"). */
  help?: string[]
  /** Atalhos para outras páginas, no fim, sob o título "Relacionados". */
  related?: PortalPageLink[]
  children?: ReactNode
  className?: string
}

function isLinkAction(action: PortalPageProps['primaryAction']): action is PortalPageLink {
  return (
    typeof action === 'object' &&
    action !== null &&
    !isValidElement(action) &&
    'href' in action &&
    'label' in action &&
    typeof (action as PortalPageLink).href === 'string'
  )
}

/**
 * Modelo das páginas do portal: cabeçalho (eyebrow, título, descrição, ação principal e ajuda opcional),
 * indicadores reais, conteúdo e "Relacionados" no fim.
 */
export function PortalPage({
  eyebrow,
  title,
  description,
  primaryAction,
  metrics = [],
  help = [],
  related = [],
  children,
  className,
}: PortalPageProps) {
  const portalPath = usePortalWorkspacePath()
  const hasHelp = help.length > 0

  const action = isLinkAction(primaryAction) ? (
    <Link to={portalPath(primaryAction.href)} className={portalButtonClasses('primary')}>
      {primaryAction.label}
    </Link>
  ) : (
    (primaryAction as ReactNode)
  )
  const hasAction = primaryAction !== undefined && primaryAction !== null && primaryAction !== false

  return (
    <div className={cn('w-full space-y-6', className)}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        lead={description}
        actions={
          hasHelp || hasAction ? (
            <>
              {hasHelp ? <PortalPageHelp title={title} items={help} /> : null}
              {hasAction ? action : null}
            </>
          ) : undefined
        }
      />

      {metrics.length === 1 ? (
        <div className="overflow-hidden rounded-[10px] border border-yx-line bg-yx-surface">
          <KpiCard label={metrics[0].label} value={metrics[0].value} comparison={metrics[0].detail} href={metrics[0].href} />
        </div>
      ) : metrics.length > 1 ? (
        <KpiGrid variant="card" count={metrics.length} aria-label="Indicadores">
          {metrics.map(metric => (
            <KpiCard key={metric.label} label={metric.label} value={metric.value} comparison={metric.detail} href={metric.href} />
          ))}
        </KpiGrid>
      ) : null}

      {children}

      {related.length > 0 ? (
        <nav aria-labelledby="portal-page-related" className="border-t border-yx-line pt-5">
          <h2 id="portal-page-related" className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3">
            Relacionados
          </h2>
          <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">
            {related.map(link => (
              <li key={link.href}>
                <Link to={portalPath(link.href)} className={portalButtonClasses('ghost')}>
                  {link.label}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  )
}

/** Botão de ajuda + painel lateral "Como esta área funciona". */
function PortalPageHelp({ title, items }: { title: string; items: string[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Como esta área funciona"
          title="Como esta área funciona"
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-yx-line-strong bg-yx-surface text-yx-fg-2 transition-colors hover:border-yx-blue hover:text-yx-blue sm:h-[34px] sm:w-[34px]',
            portalFocusRing,
          )}
        >
          <HelpCircle aria-hidden="true" className="h-[17px] w-[17px]" />
        </button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          'left-auto right-0 top-0 h-full w-full max-w-md translate-x-0 translate-y-0 content-start gap-3 overflow-y-auto rounded-none border-l border-yx-line bg-yx-surface p-5 text-yx-fg sm:rounded-none',
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0',
        )}
      >
        <DialogTitle className="font-display text-lg font-semibold tracking-[-0.01em] text-yx-fg">
          Como esta área funciona
        </DialogTitle>
        <DialogDescription className="text-[13px] text-yx-fg-3">O que você pode fazer em {title}.</DialogDescription>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {items.map(item => (
            <li
              key={item}
              className="rounded-lg border border-yx-line bg-yx-surface-2 px-3 py-2.5 text-[13.5px] leading-snug text-yx-fg-2"
            >
              {item}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
