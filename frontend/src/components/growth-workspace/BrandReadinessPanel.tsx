import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { summarizeBrandReadiness } from '@/lib/marketing-studio/marketingStudioRules'
import type { MarketingKnowledgeDocument, MarketingProductService } from '@/types/marketingStudio'

interface BrandReadinessPanelProps {
  profile: Parameters<typeof summarizeBrandReadiness>[0]
  knowledgeDocuments: MarketingKnowledgeDocument[]
  productsServices?: MarketingProductService[]
  title?: string
  compact?: boolean
}

const statusCopy = {
  ready: {
    label: 'Pronta',
    tone: 'text-emerald-700',
    bg: 'bg-emerald-50',
    description: 'Contexto suficiente para campanhas, criativos e conteudos com identidade da marca.',
  },
  partial: {
    label: 'Parcial',
    tone: 'text-amber-700',
    bg: 'bg-amber-50',
    description: 'Ja existe contexto utilizavel, mas ainda ha lacunas que reduzem qualidade e consistencia.',
  },
  blocked: {
    label: 'Bloqueada',
    tone: 'text-rose-700',
    bg: 'bg-rose-50',
    description: 'Faltam dados essenciais antes de gerar campanhas com seguranca de marca.',
  },
}

export function BrandReadinessPanel({
  profile,
  knowledgeDocuments,
  productsServices = [],
  title = 'Prontidao da marca',
  compact = false,
}: BrandReadinessPanelProps) {
  const summary = summarizeBrandReadiness(profile, knowledgeDocuments, productsServices)
  const status = statusCopy[summary.status]

  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-yux-700" />
            <h2 className="font-semibold text-slate-950">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">{status.description}</p>
        </div>
        <div className={`rounded-md px-3 py-2 text-sm font-semibold ${status.bg} ${status.tone}`}>
          {summary.percentage}% {status.label}
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-yux-600" style={{ width: `${summary.percentage}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {summary.ready}/{summary.total} criterios de marca atendidos
      </p>

      {!compact && (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {summary.checks.map(check => (
            <article key={check.key} className="flex items-start gap-2 rounded-md border bg-slate-50 p-3">
              {check.ready ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              )}
              <div>
                <h3 className="text-sm font-medium text-slate-950">{check.label}</h3>
                <p className="mt-1 text-xs text-slate-500">{check.detail}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
