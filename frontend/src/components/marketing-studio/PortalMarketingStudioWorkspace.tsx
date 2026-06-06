import { Check, MessageSquare, RotateCcw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  MarketingCalendarItem,
  MarketingContentReview,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingStudioSettings,
  PortalMarketingContentItem,
  PortalMarketingBrandProfile,
  PortalMarketingReviewDecision,
} from '@/types/marketingStudio'

interface PortalMarketingStudioWorkspaceProps {
  contents: PortalMarketingContentItem[]
  settings: MarketingStudioSettings | null
  calendarItems?: MarketingCalendarItem[]
  reviews?: MarketingContentReview[]
  brandProfile?: PortalMarketingBrandProfile | null
  productsServices?: MarketingProductService[]
  knowledgeDocuments?: MarketingKnowledgeDocument[]
  knowledgeMatches?: MarketingKnowledgeMatch[]
  onReviewDecision?: (decision: PortalMarketingReviewDecision) => void
}

export function PortalMarketingStudioWorkspace({
  contents,
  settings,
  calendarItems = [],
  reviews = [],
  brandProfile = null,
  productsServices = [],
  knowledgeDocuments = [],
  knowledgeMatches = [],
  onReviewDecision,
}: PortalMarketingStudioWorkspaceProps) {
  const pending = contents.filter(content => content.status === 'in_review').length
  const reviewableContents = contents.filter(content => content.status === 'in_review')
  const nextCalendarItems = calendarItems.filter(item => item.status !== 'cancelled').slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
        <p className="text-sm text-slate-600">Calendario, conteudos e aprovacoes do seu contrato.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Aguardando aprovacao" value={pending} />
        <Metric label="Conteudos" value={contents.length} />
        <Metric label="Creditos" value={settings?.currentCreditBalance ?? 0} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-slate-950">Calendario</h2>
          <div className="mt-2 space-y-2 text-sm text-slate-600">
            {nextCalendarItems.length === 0 ? (
              <p>Proximas publicacoes e ajustes pendentes.</p>
            ) : nextCalendarItems.map(item => (
              <p key={item.id}>{formatDate(item.startsAt)} - {item.title}</p>
            ))}
          </div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-slate-950">Campanhas e criativos</h2>
          <p className="mt-1 text-sm text-slate-600">Pecas aprovadas e criativos em revisao.</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-slate-950">Relatorios</h2>
          <p className="mt-1 text-sm text-slate-600">Resumo de resultados do periodo.</p>
        </section>
      </div>

      <section>
        <h2 className="text-base font-semibold text-slate-950">Marca e conhecimento</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <article className="rounded-md border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-950">Tom de voz</h3>
            <p className="mt-1 text-sm text-slate-600">{brandProfile?.brandVoiceSummary || settings?.toneOfVoice || 'Preferencias de marca em configuracao.'}</p>
            <p className="mt-2 text-xs text-slate-500">{brandProfile?.toneOfVoice || settings?.toneOfVoice || 'tom nao definido'}</p>
          </article>
          <article className="rounded-md border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-950">Produtos e servicos</h3>
            <p className="mt-1 text-sm text-slate-600">{productsServices.length} ofertas estruturadas para orientar conteudos.</p>
          </article>
          <article className="rounded-md border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-950">Base publicada</h3>
            <p className="mt-1 text-sm text-slate-600">{knowledgeDocuments.filter(document => document.status === 'published').length} documentos publicados.</p>
          </article>
        </div>
        {knowledgeMatches.length > 0 && (
          <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
            {knowledgeMatches.slice(0, 3).map(match => (
              <article key={match.chunkId} className="p-3">
                <h3 className="text-sm font-medium text-slate-950">{match.title || 'Trecho da base'}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{match.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-950">Aprovacoes</h2>
        <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
          {reviewableContents.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">Nenhum conteudo aguardando aprovacao.</p>
          ) : reviewableContents.map(content => {
            const latestReview = reviews.find(review => review.contentItemId === content.id)
            return (
              <article key={content.id} className="space-y-3 p-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-950">{content.title}</h3>
                  <p className="text-xs text-slate-500">{latestReview?.comments || 'Revise o conteudo e registre sua decisao.'}</p>
                </div>
                {content.body && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{content.body}</p>}
                <div className="flex flex-wrap gap-2">
                  <PortalAction title="Aprovar conteudo" onClick={() => onReviewDecision?.({ contentItemId: content.id, status: 'approved' })}>
                    <Check className="h-3.5 w-3.5" />
                    Aprovar
                  </PortalAction>
                  <PortalAction title="Pedir ajustes" onClick={() => onReviewDecision?.({ contentItemId: content.id, status: 'changes_requested', comments: 'Cliente solicitou ajustes.' })}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Ajustes
                  </PortalAction>
                  <PortalAction title="Reprovar conteudo" onClick={() => onReviewDecision?.({ contentItemId: content.id, status: 'rejected' })}>
                    <X className="h-3.5 w-3.5" />
                    Reprovar
                  </PortalAction>
                  <PortalAction title="Comentar conteudo" onClick={() => onReviewDecision?.({ contentItemId: content.id, status: 'changes_requested', comments: 'Cliente deixou comentario.' })}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Comentar
                  </PortalAction>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-950">Conteudos</h2>
        <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
          {contents.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">Nenhum conteudo disponivel.</p>
          ) : (
            contents.map(content => (
              <article key={content.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-950">{content.title}</h3>
                    <p className="text-xs text-slate-500">{content.channel}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{content.status}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-700">{label} {value}</p>
    </div>
  )
}

function PortalAction({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
