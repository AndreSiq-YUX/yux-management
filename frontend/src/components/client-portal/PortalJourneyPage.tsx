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
  showCapabilities?: boolean
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
  showCapabilities = false,
  children,
}: PortalJourneyPageProps) {
  const portalPath = usePortalWorkspacePath()

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-6 shadow-sm md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-yux-50 p-3 text-yux-700 ring-1 ring-inset ring-yux-100">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-yux-700">{eyebrow}</p>}
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
        {primaryAction && (
          <Link
            to={portalPath(primaryAction.href)}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-yux-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-yux-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yux-500 focus-visible:ring-offset-2"
          >
            {primaryAction.label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        )}
      </header>

      {metrics.length > 0 && (
        <section className="grid gap-3 md:grid-cols-3">
          {metrics.map(metric => (
            <article key={metric.label} className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{metric.value}</p>
              {metric.detail && <p className="mt-1 text-sm leading-5 text-slate-500">{metric.detail}</p>}
            </article>
          ))}
        </section>
      )}

      {showCapabilities && capabilities.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Como esta área funciona</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {capabilities.map(capability => (
              <div key={capability} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700">
                {capability}
              </div>
            ))}
          </div>
        </section>
      )}

      {children}

      {secondaryActions.length > 0 && (
        <section className="border-t border-slate-200 pt-5">
          <h2 className="text-sm font-semibold text-slate-950">Continuar em</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {secondaryActions.map(action => (
              <Link
                key={action.href}
                to={portalPath(action.href)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-yux-300 hover:bg-yux-50 hover:text-yux-800"
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
