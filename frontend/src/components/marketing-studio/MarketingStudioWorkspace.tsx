import { BookOpen, Bot, CalendarDays, Check, Clock, FileCheck, FileText, GitBranch, Radar, RefreshCw, RotateCcw, Search, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { summarizeCampaignCreativePipeline, summarizeWritingPipeline } from '@/lib/marketing-studio/marketingStudioRules'
import type {
  MarketingAgent,
  MarketingAgentRun,
  MarketingAgentToolPolicy,
  MarketingBrandProfile,
  MarketingCalendarItem,
  MarketingCampaignCreativeSuggestion,
  MarketingCampaignDraftRun,
  MarketingContentGenerationRun,
  MarketingContentItem,
  MarketingContentQualityCheck,
  MarketingContentReview,
  MarketingContentVersion,
  MarketingKnowledgeChunk,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingIdea,
  MarketingProductService,
  MarketingPublishingConnection,
  MarketingPublishingProvider,
  MarketingPublishingRun,
  MarketingRadarRun,
  MarketingSource,
  MarketingSourceItem,
  MarketingStudioSettings,
  MarketingToolRun,
  MarketingWorkflow,
  MarketingWorkflowRun,
  ModelRoutingRule,
} from '@/types/marketingStudio'

interface MarketingStudioWorkspaceProps {
  contents: MarketingContentItem[]
  settings: MarketingStudioSettings | null
  onRefresh: () => void
  calendarItems?: MarketingCalendarItem[]
  reviews?: MarketingContentReview[]
  versionsByContent?: Record<string, MarketingContentVersion[]>
  brandProfile?: MarketingBrandProfile | null
  productsServices?: MarketingProductService[]
  knowledgeDocuments?: MarketingKnowledgeDocument[]
  knowledgeChunks?: MarketingKnowledgeChunk[]
  knowledgeMatches?: MarketingKnowledgeMatch[]
  agents?: MarketingAgent[]
  workflows?: MarketingWorkflow[]
  workflowRuns?: MarketingWorkflowRun[]
  agentRuns?: MarketingAgentRun[]
  toolRuns?: MarketingToolRun[]
  modelRoutes?: ModelRoutingRule[]
  toolPolicies?: MarketingAgentToolPolicy[]
  sources?: MarketingSource[]
  sourceItems?: MarketingSourceItem[]
  radarRuns?: MarketingRadarRun[]
  ideas?: MarketingIdea[]
  generationRuns?: MarketingContentGenerationRun[]
  qualityChecks?: MarketingContentQualityCheck[]
  publishingConnections?: MarketingPublishingConnection[]
  publishingRuns?: MarketingPublishingRun[]
  campaignCreativeSuggestions?: MarketingCampaignCreativeSuggestion[]
  campaignDraftRuns?: MarketingCampaignDraftRun[]
  onCreateContent?: () => void
  onSubmitForReview?: (contentId: string) => void
  onApproveReview?: (reviewId: string) => void
  onRequestChanges?: (reviewId: string) => void
  onRejectReview?: (reviewId: string) => void
  onScheduleContent?: (contentId: string) => void
  onSearchKnowledge?: (query: string) => void
}

const tabs = ['Visao geral', 'Conteudo', 'Calendario', 'Aprovacoes', 'Ideias', 'Base de conhecimento', 'Agentes', 'Creditos']

export function MarketingStudioWorkspace({
  contents,
  settings,
  onRefresh,
  calendarItems = [],
  reviews = [],
  versionsByContent = {},
  brandProfile = null,
  productsServices = [],
  knowledgeDocuments = [],
  knowledgeChunks = [],
  knowledgeMatches = [],
  agents = [],
  workflows = [],
  workflowRuns = [],
  agentRuns = [],
  toolRuns = [],
  modelRoutes = [],
  toolPolicies = [],
  sources = [],
  sourceItems = [],
  radarRuns = [],
  ideas = [],
  generationRuns = [],
  qualityChecks = [],
  publishingConnections = [],
  publishingRuns = [],
  campaignCreativeSuggestions = [],
  campaignDraftRuns = [],
  onCreateContent,
  onSubmitForReview,
  onApproveReview,
  onRequestChanges,
  onRejectReview,
  onScheduleContent,
  onSearchKnowledge,
}: MarketingStudioWorkspaceProps) {
  const pendingApprovals = contents.filter(content => content.status === 'in_review').length
  const scheduled = contents.filter(content => content.status === 'scheduled').length
  const pendingReviews = reviews.filter(review => review.status === 'pending')
  const nextCalendarItems = calendarItems
    .filter(item => item.status !== 'cancelled')
    .slice(0, 6)
  const writingSummary = summarizeWritingPipeline({ generationRuns, qualityChecks })
  const campaignCreativeSummary = summarizeCampaignCreativePipeline({
    suggestions: campaignCreativeSuggestions,
    draftRuns: campaignDraftRuns,
  })
  const publishingProviderRows = buildPublishingProviderRows(publishingConnections)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
          <p className="text-sm text-slate-600">Operacao multicliente de conteudo, calendario, aprovacoes e creditos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            title="Criar conteudo organico"
            onClick={onCreateContent}
            className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700"
          >
            <FileText className="h-4 w-4" />
            Novo conteudo
          </button>
          <button
            type="button"
            title="Atualizar Marketing Studio"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <Metric label="Conteudos" value={contents.length} />
        <Metric label="Aprovacoes" value={pendingApprovals} />
        <Metric label="Agendados" value={scheduled} />
        <Metric label="Creditos" value={settings?.currentCreditBalance ?? 0} />
        <Metric label="Geracoes" value={generationRuns.length} />
        <Metric label="Agentes" value={agents.length} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map(tab => (
          <span key={tab} className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {tab}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Conteudo organico</h2>
            <span className="text-xs text-slate-500">posts, blog, newsletter e roteiros</span>
          </div>
          <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
            {contents.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">Nenhum conteudo cadastrado.</p>
            ) : (
              contents.map(content => (
                <article key={content.id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-slate-950">{content.title}</h3>
                      <p className="text-xs text-slate-500">{content.channel} / {content.contentType}</p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{content.status}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>Versoes {versionsByContent[content.id]?.length || 0}</span>
                    {content.cta && <span>CTA: {content.cta}</span>}
                    {content.scheduledAt && <span>Agendado: {formatDate(content.scheduledAt)}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton title="Enviar para revisao" onClick={() => onSubmitForReview?.(content.id)}>
                      <Clock className="h-3.5 w-3.5" />
                      Revisao
                    </ActionButton>
                    <ActionButton title="Agendar conteudo" onClick={() => onScheduleContent?.(content.id)}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      Agendar
                    </ActionButton>
                  </div>
                  {content.internalNotes && (
                    <p className="mt-2 text-xs text-slate-500">{content.internalNotes}</p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-950">Fila de aprovacao</h2>
          <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
            {pendingReviews.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">Nenhuma revisao pendente.</p>
            ) : pendingReviews.map(review => {
              const content = contents.find(item => item.id === review.contentItemId)
              return (
                <article key={review.id} className="space-y-2 p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-950">{content?.title || 'Conteudo sem titulo'}</p>
                    <p className="text-xs text-slate-500">{review.comments || 'Aguardando decisao'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton title="Aprovar revisao" onClick={() => onApproveReview?.(review.id)}>
                      <Check className="h-3.5 w-3.5" />
                      Aprovar
                    </ActionButton>
                    <ActionButton title="Pedir ajustes" onClick={() => onRequestChanges?.(review.id)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Ajustes
                    </ActionButton>
                    <ActionButton title="Reprovar revisao" onClick={() => onRejectReview?.(review.id)}>
                      <X className="h-3.5 w-3.5" />
                      Reprovar
                    </ActionButton>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Redacao, revisao e grounding</h2>
          <span className="text-xs text-slate-500">Redator Multicanal / Revisor de Marca e Qualidade</span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <Sparkles className="h-4 w-4" />
              Esteira de escrita
            </div>
            <p className="text-slate-700">{writingSummary.active} ativas / {writingSummary.waitingApproval} aguardando aprovacao</p>
            <p className="mt-1 text-xs text-slate-500">{writingSummary.succeeded} concluidas / {writingSummary.failed} falhas</p>
            <div className="mt-2 space-y-2">
              {generationRuns.slice(0, 4).map(run => (
                <div key={run.id} className="rounded-md bg-slate-50 p-2">
                  <p className="line-clamp-1 font-medium text-slate-900">{run.outputTitle || run.briefSnapshot || 'Geracao sem titulo'}</p>
                  <p className="text-xs text-slate-500">{run.status} / {run.channel} / score {run.qualityScore ?? 0}</p>
                </div>
              ))}
              {generationRuns.length === 0 && <p className="text-xs text-slate-500">Nenhuma geracao registrada.</p>}
            </div>
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <ShieldCheck className="h-4 w-4" />
              Checklist de qualidade
            </div>
            <p className="text-slate-700">Score medio {writingSummary.averageQualityScore}</p>
            <p className="mt-1 text-xs text-slate-500">{qualityChecks.length} revisoes estruturadas</p>
            <div className="mt-2 space-y-2">
              {qualityChecks.slice(0, 4).map(check => (
                <div key={check.id} className="rounded-md bg-slate-50 p-2">
                  <p className="font-medium text-slate-900">{check.status} / score {check.qualityScore}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{check.riskFlags.join(', ') || check.comments || 'Sem riscos registrados'}</p>
                </div>
              ))}
              {qualityChecks.length === 0 && <p className="text-xs text-slate-500">Nenhuma revisao estruturada registrada.</p>}
            </div>
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <FileCheck className="h-4 w-4" />
              Grounding controlado
            </div>
            <p className="text-slate-700">{writingSummary.groundingRequired} geracoes exigem grounding</p>
            <div className="mt-2 space-y-2">
              {generationRuns.filter(run => run.requiresGrounding || run.groundingStatus !== 'not_required').slice(0, 4).map(run => (
                <div key={run.id} className="rounded-md bg-slate-50 p-2">
                  <p className="line-clamp-1 font-medium text-slate-900">{run.outputTitle || run.briefSnapshot || 'Conteudo factual'}</p>
                  <p className="text-xs text-slate-500">{run.groundingStatus} / {run.contentType}</p>
                </div>
              ))}
              {writingSummary.groundingRequired === 0 && <p className="text-xs text-slate-500">Nenhum grounding pendente.</p>}
            </div>
          </article>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">WordPress e publicacao controlada</h2>
          <span className="text-xs text-slate-500">canais nativos, rascunho e publicacao apos aprovacao</span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <Send className="h-4 w-4" />
              Conexoes WordPress e canais nativos
            </div>
            <p className="text-slate-700">{publishingConnections.filter(connection => connection.status === 'connected').length} conectadas / {publishingConnections.length} cadastradas</p>
            <div className="mt-2 space-y-2">
              {publishingProviderRows.map(({ provider, label, connection }) => (
                <div key={provider} className="rounded-md bg-slate-50 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{connection?.name || label}</p>
                      <p className="text-xs text-slate-500">{label} / {connection?.status || 'needs_setup'}</p>
                    </div>
                    <span className="rounded bg-white px-2 py-1 text-[11px] text-slate-600">{publishingAvailability(connection)}</span>
                  </div>
                  <div className="mt-1 grid gap-1 text-xs text-slate-500">
                    <span>{connection?.providerAssetName || connection?.siteUrl || 'asset nao configurado'}</span>
                    <span>{connection?.tokenReference ? 'credencial configurada' : 'credencial pendente'}</span>
                    <span>ultima publicacao: {connection?.lastPublishedAt ? formatDate(connection.lastPublishedAt) : 'nunca'}</span>
                    {connection?.status === 'needs_reauth' && <span className="text-red-600">reautenticacao necessaria</span>}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Execucoes de publicacao</h3>
            <p className="text-slate-700">{publishingRuns.length} runs recentes</p>
            <div className="mt-2 space-y-2">
              {publishingRuns.slice(0, 5).map(run => (
                <div key={run.id} className="rounded-md bg-slate-50 p-2">
                  <p className="font-medium text-slate-900">{run.action} / {run.status}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{run.publishedUrl || run.providerPostId || run.protectedError || run.idempotencyKey}</p>
                </div>
              ))}
              {publishingRuns.length === 0 && <p className="text-xs text-slate-500">Nenhuma publicacao executada.</p>}
            </div>
          </article>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Campanhas e criativos</h2>
          <span className="text-xs text-slate-500">copies, conceitos, landing page e campanha rascunho</span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Sugestoes de campanha</h3>
            <p className="text-slate-700">{campaignCreativeSummary.approved} aprovadas / {campaignCreativeSummary.converted} convertidas</p>
            <p className="mt-1 text-xs text-slate-500">Score medio {campaignCreativeSummary.averageQualityScore}</p>
            <div className="mt-2 space-y-2">
              {campaignCreativeSuggestions.slice(0, 4).map(suggestion => (
                <div key={suggestion.id} className="rounded-md bg-slate-50 p-2">
                  <p className="line-clamp-1 font-medium text-slate-900">{suggestion.campaignName}</p>
                  <p className="text-xs text-slate-500">{suggestion.provider} / {suggestion.objective} / {suggestion.status}</p>
                </div>
              ))}
              {campaignCreativeSuggestions.length === 0 && <p className="text-xs text-slate-500">Nenhuma sugestao de campanha gerada.</p>}
            </div>
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Copies e conceitos</h3>
            {campaignCreativeSuggestions.slice(0, 3).map(suggestion => (
              <div key={suggestion.id} className="mb-2 rounded-md bg-slate-50 p-2">
                <p className="font-medium text-slate-900">{String(suggestion.copyVariations[0]?.headline || suggestion.title)}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{String(suggestion.copyVariations[0]?.body || suggestion.angle)}</p>
                <p className="mt-1 text-xs text-slate-500">{suggestion.creativeConcepts.length} conceitos / CTA {suggestion.cta || 'nao definido'}</p>
              </div>
            ))}
            {campaignCreativeSuggestions.length === 0 && <p className="text-xs text-slate-500">Copies serao exibidas apos a geracao.</p>}
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Rascunhos pagos</h3>
            <p className="text-slate-700">{campaignDraftRuns.length} runs recentes / {campaignCreativeSummary.failedDraftRuns} falhas</p>
            <div className="mt-2 space-y-2">
              {campaignDraftRuns.slice(0, 4).map(run => (
                <div key={run.id} className="rounded-md bg-slate-50 p-2">
                  <p className="font-medium text-slate-900">{run.status}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{run.campaignId || run.protectedError || run.idempotencyKey}</p>
                </div>
              ))}
              {campaignDraftRuns.length === 0 && <p className="text-xs text-slate-500">Nenhum rascunho de campanha criado.</p>}
            </div>
          </article>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section>
          <h2 className="text-base font-semibold text-slate-950">Calendario editorial</h2>
          <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
            {nextCalendarItems.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">Nenhum item no calendario.</p>
            ) : nextCalendarItems.map(item => (
              <article key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-medium text-slate-950">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.channel} / {formatDate(item.startsAt)}</p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{item.status}</span>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-950">Operacao</h2>
          <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <p>Modo: {settings?.operationMode ?? 'sem configuracao'}</p>
            <p>Limite mensal: {settings?.monthlyCreditLimit ?? 0}</p>
            <p>Canais: {settings?.allowedChannels.join(', ') || 'nao configurado'}</p>
            <p>Aprovacao WordPress: {settings?.approvalPolicy.publishWordPress ? 'obrigatoria' : 'flexivel'}</p>
          </div>
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Ideias e Radar</h2>
          <span className="text-xs text-slate-500">fontes curadas, pesquisa controlada e curadoria</span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <Radar className="h-4 w-4" />
              Fontes monitoradas
            </div>
            <p className="text-slate-700">{sources.filter(source => source.status === 'active').length} ativas / {sources.length} cadastradas</p>
            <div className="mt-2 space-y-2">
              {sources.slice(0, 4).map(source => (
                <div key={source.id} className="rounded-md bg-slate-50 p-2">
                  <p className="font-medium text-slate-900">{source.name}</p>
                  <p className="text-xs text-slate-500">{source.sourceType} / {source.status}</p>
                </div>
              ))}
              {sources.length === 0 && <p className="text-xs text-slate-500">Nenhuma fonte configurada.</p>}
            </div>
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Itens capturados</h3>
            <p className="text-slate-700">{sourceItems.length} itens / {ideas.length} ideias</p>
            <div className="mt-2 space-y-2">
              {sourceItems.slice(0, 4).map(item => (
                <div key={item.id} className="rounded-md bg-slate-50 p-2">
                  <p className="line-clamp-1 font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">score {item.relevanceScore}/{item.noveltyScore}/{item.commercialScore} / {item.status}</p>
                </div>
              ))}
              {sourceItems.length === 0 && <p className="text-xs text-slate-500">Nenhum item capturado pelo Radar.</p>}
            </div>
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Radar semanal</h3>
            <p className="text-slate-700">{radarRuns.length} execucoes recentes</p>
            <div className="mt-2 space-y-2">
              {radarRuns.slice(0, 4).map(run => (
                <div key={run.id} className="rounded-md bg-slate-50 p-2">
                  <p className="font-medium text-slate-900">{run.status} / {run.ideaCount} ideias</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{run.query || run.summary || 'Radar sem resumo'}</p>
                </div>
              ))}
              {radarRuns.length === 0 && <p className="text-xs text-slate-500">Nenhum Radar executado.</p>}
            </div>
          </article>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Base de conhecimento e tom de voz</h2>
          <ActionButton title="Buscar conhecimento" onClick={() => onSearchKnowledge?.('marca produto servico')}>
            <Search className="h-3.5 w-3.5" />
            Buscar RAG
          </ActionButton>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <BookOpen className="h-4 w-4" />
              Voz da marca
            </div>
            <p className="text-slate-700">{brandProfile?.brandVoiceSummary || settings?.toneOfVoice || 'Perfil de marca ainda nao configurado.'}</p>
            <p className="mt-2 text-xs text-slate-500">Tom: {brandProfile?.toneOfVoice || settings?.toneOfVoice || 'nao definido'}</p>
            <p className="text-xs text-slate-500">Persona: {brandProfile?.persona || settings?.persona || 'nao definida'}</p>
            {brandProfile?.complianceNotes && <p className="mt-2 text-xs text-slate-500">Compliance: {brandProfile.complianceNotes}</p>}
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Produtos e servicos</h3>
            {productsServices.length === 0 ? (
              <p className="text-slate-500">Nenhuma oferta estruturada.</p>
            ) : productsServices.slice(0, 4).map(product => (
              <div key={product.id} className="mb-2">
                <p className="font-medium text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">{product.valueProposition || product.description}</p>
              </div>
            ))}
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">RAG simples</h3>
            <p className="text-slate-700">{knowledgeDocuments.length} documentos / {knowledgeChunks.length} chunks</p>
            <div className="mt-2 space-y-2">
              {(knowledgeMatches.length ? knowledgeMatches : knowledgeChunks.slice(0, 2)).map(item => (
                <p key={'chunkId' in item ? item.chunkId : item.id} className="line-clamp-2 text-xs text-slate-500">
                  {'rank' in item ? item.title : item.title} - {item.body}
                </p>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Agentes e fluxos</h2>
          <span className="text-xs text-slate-500">LangGraph runtime / harness provider-neutral</span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <Bot className="h-4 w-4" />
              Agentes configuraveis
            </div>
            {agents.length === 0 ? (
              <p className="text-slate-500">Nenhum agente configurado para o contrato.</p>
            ) : agents.slice(0, 5).map(agent => (
              <div key={agent.id} className="mb-3 rounded-md bg-slate-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-950">{agent.name}</p>
                  <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">{agent.status}</span>
                </div>
                <p className="text-xs text-slate-500">{agent.agentType} / prompt v{agent.promptVersion}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{agent.basePrompt || 'Prompt do agente ainda nao definido.'}</p>
                <p className="mt-1 text-xs text-slate-500">Ferramentas: {agent.allowedTools.join(', ') || 'nenhuma'}</p>
              </div>
            ))}
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
              <GitBranch className="h-4 w-4" />
              Workflows e execucoes
            </div>
            <p className="text-slate-700">{workflows.length} workflows / {workflowRuns.length} execucoes recentes</p>
            <div className="mt-2 space-y-2">
              {workflowRuns.slice(0, 4).map(run => (
                <div key={run.id} className="rounded-md bg-slate-50 p-2">
                  <p className="text-xs font-medium text-slate-900">{run.status} / {run.runType}</p>
                  <p className="text-xs text-slate-500">Creditos {run.creditDebit} / custo {run.rawCostEstimate}</p>
                  {run.errorMessage && <p className="line-clamp-1 text-xs text-red-600">{run.errorMessage}</p>}
                </div>
              ))}
              {workflowRuns.length === 0 && <p className="text-xs text-slate-500">Nenhuma execucao registrada.</p>}
            </div>
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <h3 className="mb-2 font-semibold text-slate-950">Harness, modelos e ferramentas</h3>
            <p className="text-slate-700">{agentRuns.length} agent runs / {toolRuns.length} tool runs</p>
            <p className="mt-1 text-xs text-slate-500">{modelRoutes.length} regras de modelo / {toolPolicies.length} policies de ferramentas</p>
            <div className="mt-2 space-y-2">
              {modelRoutes.slice(0, 3).map(route => (
                <div key={route.id} className="rounded-md bg-slate-50 p-2 text-xs">
                  <p className="font-medium text-slate-900">{route.agentType || route.agentId} / {route.routingTier}</p>
                  <p className="text-slate-500">{route.provider} / {route.modelName}</p>
                </div>
              ))}
              {modelRoutes.length === 0 && <p className="text-xs text-slate-500">Roteamento sera aplicado pelo fallback do harness.</p>}
            </div>
          </article>
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

function ActionButton({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title: string }) {
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

const publishingProviderLabels: Record<MarketingPublishingProvider, string> = {
  wordpress: 'WordPress',
  meta_facebook: 'Facebook Page',
  meta_instagram: 'Instagram',
  google_business_profile: 'Google Business Profile',
}

const publishingProviderOrder: MarketingPublishingProvider[] = [
  'wordpress',
  'meta_facebook',
  'meta_instagram',
  'google_business_profile',
]

function buildPublishingProviderRows(connections: MarketingPublishingConnection[]) {
  return publishingProviderOrder.map(provider => ({
    provider,
    label: publishingProviderLabels[provider],
    connection: connections.find(connection => connection.provider === provider),
  }))
}

function publishingAvailability(connection?: MarketingPublishingConnection) {
  if (!connection) return 'sem conexao'
  if (connection.status === 'needs_reauth') return 'reautenticar'
  if (connection.status === 'connected' && connection.tokenReference) return 'pronto'
  if (connection.status === 'stale' && connection.tokenReference) return 'verificar'
  return 'indisponivel'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
