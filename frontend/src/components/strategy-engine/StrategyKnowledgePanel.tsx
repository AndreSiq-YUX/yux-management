import { Database, FileText, GitPullRequestArrow, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import type { StrategyAgentBinding, StrategyConceptCard, StrategyKnowledgeStats, StrategyRetrievalQuery, StrategySourceDocument } from '@/types/strategyEngine'

export function StrategyKnowledgePanel({
  stats,
  documents,
  cards,
  retrievalQueries,
  bindings,
}: {
  stats: StrategyKnowledgeStats
  documents: StrategySourceDocument[]
  cards: StrategyConceptCard[]
  retrievalQueries: StrategyRetrievalQuery[]
  bindings: StrategyAgentBinding[]
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-5">
        <SmallMetric label="Documentos" value={stats.documents} icon={FileText} />
        <SmallMetric label="Chunks" value={stats.chunks} icon={Database} />
        <SmallMetric label="Assets" value={stats.assets} icon={Database} />
        <SmallMetric label="Cards" value={stats.cards} icon={Database} />
        <SmallMetric label="Retrievals" value={stats.retrievals} icon={Search} />
      </div>

      {stats.cards === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          A doutrina e as skills ja estao configuradas, mas ainda nao ha concept cards importados. Na pratica, os agentes seguem regras fixas, porem o RAG estrategico ainda nao recupera conhecimento do livro.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Fontes de conhecimento</h2>
          <List
            items={documents}
            empty="Nenhum documento importado."
            render={document => (
              <article key={document.id} className="rounded-md border border-gray-100 p-3">
                <div className="font-semibold text-gray-900">{document.source_title || document.sourceTitle}</div>
                <p className="text-xs text-gray-600">{document.document_type} / {document.human_review_status}</p>
              </article>
            )}
          />
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Concept Cards</h2>
          <List
            items={cards}
            empty="Nenhum card conceitual revisado/importado."
            render={card => (
              <article key={card.id} className="rounded-md border border-gray-100 p-3">
                <div className="font-semibold text-gray-900">{card.concept}</div>
                <p className="line-clamp-2 text-xs text-gray-600">{card.problemSolved}</p>
              </article>
            )}
          />
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Retrieval logs</h2>
          <List
            items={retrievalQueries}
            empty="Nenhum retrieval executado ainda."
            render={query => (
              <article key={query.id} className="rounded-md border border-gray-100 p-3">
                <div className="font-semibold text-gray-900">{query.profile_key}</div>
                <p className="line-clamp-2 text-xs text-gray-600">{query.query}</p>
              </article>
            )}
          />
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Bindings do harness</h2>
          <List
            items={bindings}
            empty="Nenhum binding registrado."
            render={binding => (
              <article key={binding.id} className="rounded-md border border-gray-100 p-3">
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                  <GitPullRequestArrow className="h-4 w-4 text-yux-700" aria-hidden="true" />
                  {binding.binding_type}
                </div>
                <p className="text-xs text-gray-600">{binding.marketing_agent_type || binding.workflow_key || binding.ai_assistant_id || binding.profile_id}</p>
              </article>
            )}
          />
        </section>
      </div>
    </div>
  )
}

function SmallMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Database }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between text-sm font-semibold text-gray-600">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-yux-700" aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-950">{value}</div>
    </div>
  )
}

function List<T extends { id: string }>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => ReactNode }) {
  if (items.length === 0) return <div className="mt-3 rounded-md border border-dashed p-4 text-sm text-gray-500">{empty}</div>
  return <div className="mt-3 space-y-2">{items.slice(0, 10).map(render)}</div>
}
