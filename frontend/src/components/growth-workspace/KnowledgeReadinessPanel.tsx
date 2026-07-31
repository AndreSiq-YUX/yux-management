import { BookOpen, CheckCircle2, Globe2, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { summarizeBrandReadiness } from '@/lib/marketing-studio/marketingStudioRules'
import type { MarketingKnowledgeDocument, MarketingKnowledgeMatch, MarketingProductService } from '@/types/marketingStudio'

interface KnowledgeReadinessPanelProps {
  profile: Parameters<typeof summarizeBrandReadiness>[0]
  knowledgeDocuments: MarketingKnowledgeDocument[]
  productsServices?: MarketingProductService[]
  knowledgeMatches?: MarketingKnowledgeMatch[]
}

const consumedBy = [
  'Agente IA',
  'Marketing Studio',
  'Respostas sugeridas',
  'Campanhas',
  'Landing pages',
  'FAQ',
  'Suporte',
]

export function KnowledgeReadinessPanel({
  profile,
  knowledgeDocuments,
  productsServices = [],
  knowledgeMatches = [],
}: KnowledgeReadinessPanelProps) {
  const summary = summarizeBrandReadiness(profile, knowledgeDocuments, productsServices)
  const activeDocuments = knowledgeDocuments.filter(document => ['indexed', 'published'].includes(document.status))
  const siteReady = summary.checks.find(check => check.key === 'site')?.ready ?? false
  const socialReady = summary.checks.find(check => check.key === 'social')?.ready ?? false
  const activeProducts = productsServices.filter(product => product.status === 'active')

  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-yux-700" />
            <h2 className="font-semibold text-slate-950">Prontidao da base</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Fonte unica compartilhada por IA, marketing, atendimento e suporte.
          </p>
        </div>
        <div className="rounded-md bg-yux-50 px-3 py-2 text-sm font-semibold text-yux-800">
          {activeDocuments.length} fontes ativas
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <ReadinessMetric label="Documentos ativos" value={activeDocuments.length} ready={activeDocuments.length > 0} />
        <ReadinessMetric label="Ofertas estruturadas" value={activeProducts.length} ready={activeProducts.length > 0} />
        <ReadinessMetric label="Site indexado" value={siteReady ? 'Sim' : 'Nao'} ready={siteReady} icon={<Globe2 className="h-4 w-4" />} />
        <ReadinessMetric label="Social" value={socialReady ? 'OK' : 'Pendente'} ready={socialReady} icon={<Share2 className="h-4 w-4" />} />
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-slate-950">Alimenta</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {consumedBy.map(area => (
            <span key={area} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{area}</span>
          ))}
        </div>
      </div>

      {knowledgeMatches.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-950">Trechos recuperados pela IA</h3>
          <div className="mt-2 grid gap-2">
            {knowledgeMatches.slice(0, 3).map(match => (
              <p key={match.chunkId} className="rounded-md bg-yux-50 p-3 text-xs text-yux-900">
                {match.title ? `${match.title}: ` : ''}{match.body}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ReadinessMetric({
  label,
  value,
  ready,
  icon,
}: {
  label: string
  value: string | number
  ready: boolean
  icon?: ReactNode
}) {
  return (
    <article className="rounded-md border bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={ready ? 'text-emerald-600' : 'text-slate-400'}>
          {icon || <CheckCircle2 className="h-4 w-4" />}
        </span>
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </article>
  )
}
