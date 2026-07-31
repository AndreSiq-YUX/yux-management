import { Link } from 'react-router-dom'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'

export interface PortalJourneyMetric {
  label: string
  value: string
  detail?: string
}

export interface PortalJourneyAction {
  label: string
  href: string
}

interface PortalJourneyPageProps {
  title: string
  description: string
  eyebrow?: string
  icon: LucideIcon
  metrics?: PortalJourneyMetric[]
  capabilities: string[]
  primaryAction?: PortalJourneyAction
  secondaryActions?: PortalJourneyAction[]
  note?: string
  children?: ReactNode
}

export function PortalJourneyPage({
  title,
  description,
  eyebrow,
  icon: Icon,
  metrics = [],
  capabilities,
  primaryAction,
  secondaryActions = [],
  note,
  children,
}: PortalJourneyPageProps) {
  const portalPath = usePortalWorkspacePath()

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-lg border bg-white p-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-yux-50 p-2 text-yux-700">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            {eyebrow && <p className="text-xs font-medium uppercase text-yux-700">{eyebrow}</p>}
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">{description}</p>
          </div>
        </div>
        {primaryAction && (
          <Link
            to={portalPath(primaryAction.href)}
            className="inline-flex items-center justify-center rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700"
          >
            {primaryAction.label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        )}
      </header>

      {metrics.length > 0 && (
        <section className="grid gap-3 md:grid-cols-3">
          {metrics.map(metric => (
            <article key={metric.label} className="rounded-lg border bg-white p-4">
              <p className="text-xs font-medium uppercase text-gray-500">{metric.label}</p>
              <p className="mt-2 text-xl font-semibold text-gray-900">{metric.value}</p>
              {metric.detail && <p className="mt-1 text-sm text-gray-600">{metric.detail}</p>}
            </article>
          ))}
        </section>
      )}

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">O que esta pagina concentra</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {capabilities.map(capability => (
            <div key={capability} className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {capability}
            </div>
          ))}
        </div>
      </section>

      {children}

      {secondaryActions.length > 0 && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Atalhos relacionados</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {secondaryActions.map(action => (
              <Link
                key={action.href}
                to={portalPath(action.href)}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium text-gray-700 hover:border-yux-300 hover:bg-yux-50"
              >
                {action.label}
                <ArrowRight className="h-4 w-4 text-yux-700" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {note && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {note}
        </section>
      )}
    </div>
  )
}
