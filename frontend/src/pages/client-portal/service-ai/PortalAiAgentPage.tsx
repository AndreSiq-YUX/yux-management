import { Bot } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { countItems, formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'

export function PortalAiAgentPage() {
  const {
    loading,
    error,
    agents,
    workflowRuns,
    knowledgeDocuments,
    knowledgeMatches,
    brandProfile,
  } = usePortalMarketingContext({ includeOperations: true })

  const publishedDocuments = knowledgeDocuments.filter(document => document.status === 'published')
  const activeAgents = agents.filter(agent => agent.status === 'active')
  const failedRuns = countItems(workflowRuns, run => run.status === 'failed')

  return (
    <PortalJourneyPage
      eyebrow="Atendimento & IA"
      title="Agente IA"
      description="Configuracao e acompanhamento do agente que responde clientes, sugere respostas e aciona handoff humano."
      icon={Bot}
      metrics={[
        { label: 'Agentes', value: String(activeAgents.length), detail: 'Agentes ativos vinculados ao contrato.' },
        { label: 'Fontes', value: String(publishedDocuments.length), detail: 'Documentos publicados na base.' },
        { label: 'Execucoes', value: String(workflowRuns.length), detail: `${failedRuns} com falha recente.` },
      ]}
      capabilities={[
        'Ver status do agente, objetivos, tom de voz, regras e campos a coletar.',
        'Testar o agente antes de publicar mudancas.',
        'Consultar fontes usadas, confianca, historico de respostas e perguntas sem resposta.',
        'Adicionar conhecimento ou treinar pelo site usando a Base de Conhecimento da empresa.',
      ]}
      primaryAction={{ label: 'Abrir Base de Conhecimento', href: '/portal/empresa/conhecimento' }}
      secondaryActions={[
        { label: 'Conversas', href: '/portal/atendimento/conversas' },
        { label: 'Filas e Handoff', href: '/portal/atendimento/filas-handoff' },
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
      ]}
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Prontidao do agente</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando agente IA...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-md border bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-900">Tom de voz</p>
                <p className="mt-1 text-xs text-gray-600">{brandProfile?.toneOfVoice || 'Ainda nao configurado.'}</p>
              </div>
              <div className="rounded-md border bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-900">Fontes recuperadas</p>
                <p className="mt-1 text-xs text-gray-600">{knowledgeMatches.length} trechos disponiveis para consulta semantica.</p>
              </div>
              <div className="rounded-md border bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-900">Perguntas sem resposta</p>
                <p className="mt-1 text-xs text-gray-600">Ainda nao ha um contrato dedicado de perguntas sem resposta nesta tela.</p>
              </div>
            </div>
          )}
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Execucoes recentes</h2>
          <div className="mt-4 space-y-3">
            {workflowRuns.slice(0, 6).map(run => (
              <div key={run.id} className="rounded-md border bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{run.workflowId || 'Fluxo de IA'}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(run.status)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Criado em {formatPortalDateTime(run.createdAt)}</p>
                {run.errorMessage && <p className="mt-2 text-xs text-red-600">{run.errorMessage}</p>}
              </div>
            ))}
            {!workflowRuns.length && (
              <p className="text-sm text-gray-600">Nenhuma execucao de agente registrada para este contrato.</p>
            )}
          </div>
        </article>
      </section>
    </PortalJourneyPage>
  )
}
