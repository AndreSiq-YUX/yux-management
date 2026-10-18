import { Link } from 'react-router-dom'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { PortalAssistantConfig } from '@/components/omnichannel/PortalAssistantConfig'
import { useCanConfigureOmnichannel } from '@/components/omnichannel/useCanConfigureOmnichannel'
import { EmptyState, PendingAction, PendingSection, SectionCard, StatusChip, sectionLinkClasses } from '@/components/portal-ui'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { countItems, formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'
import { usePlatformStore } from '@/stores/platformStore'
import type { MarketingRunType } from '@/types/marketingStudio'

const runTypeLabels: Record<MarketingRunType, string> = {
  manual: 'Execução manual',
  scheduled: 'Execução agendada',
  event: 'Execução disparada por evento',
  retry: 'Nova tentativa de execução',
}

const runTitle = (runType?: MarketingRunType) => (runType && runTypeLabels[runType]) || 'Execução do agente'

export function PortalAiAgentPage() {
  const portalPath = usePortalWorkspacePath()
  const canConfigure = useCanConfigureOmnichannel()
  const organizationId = usePlatformStore(state => state.organization?.id || state.activeContract?.clientId)
  const {
    loading,
    error,
    agents,
    workflowRuns,
    knowledgeDocuments,
    knowledgeMatches,
    brandProfile,
  } = usePortalMarketingContext({ resources: ['agents', 'workflowRuns', 'knowledgeDocuments', 'knowledgeMatches', 'brandProfile'] })

  const publishedDocuments = knowledgeDocuments.filter(document => document.status === 'published')
  const activeAgents = agents.filter(agent => agent.status === 'active')
  const failedRuns = countItems(workflowRuns, run => run.status === 'failed')

  return (
    <PortalPage
      eyebrow="Atendimento"
      title="Agente IA"
      description="Configure o agente que responde seus clientes, sugere respostas e transfere para uma pessoa quando precisa."
      metrics={[
        { label: 'Agentes', value: String(activeAgents.length), detail: 'Agentes ativos vinculados ao contrato.' },
        { label: 'Fontes', value: String(publishedDocuments.length), detail: 'Documentos publicados na base.' },
        { label: 'Execuções', value: String(workflowRuns.length), detail: `${failedRuns} com falha recente.` },
      ]}
      help={[
        'Veja e ajuste o objetivo, o tom de voz, as regras e os dados que o agente coleta.',
        'Teste o agente antes de publicar mudanças.',
        'Consulte as fontes usadas, o histórico de respostas e as perguntas sem resposta.',
        'Adicione conhecimento pela Base de Conhecimento da empresa.',
      ]}
      related={[
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Conversas', href: '/portal/atendimento/conversas' },
        { label: 'Filas e transferência para atendente', href: '/portal/atendimento/filas-handoff' },
        { label: 'Marca e tom de voz', href: '/portal/empresa/marca' },
      ]}
    >
      <PortalAssistantConfig organizationId={organizationId} canConfigure={canConfigure} />

      <section className="grid gap-4 lg:grid-cols-2">
        <SectionCard id="agente-prontidao" title="Prontidão do agente">
          {loading ? (
            <p className="text-sm text-yx-fg-2">Carregando agente IA...</p>
          ) : error ? (
            <p role="alert" className="text-sm text-yx-crit">{error}</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
                <p className="text-sm font-semibold text-yx-fg">Tom de voz</p>
                <p className="mt-1 text-[13px] text-yx-fg-2">{brandProfile?.toneOfVoice || 'Ainda não configurado.'}</p>
                <Link to={portalPath('/portal/empresa/marca')} className={`${sectionLinkClasses} mt-2`}>
                  Ajustar em Marca e tom de voz
                </Link>
              </div>
              <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
                <p className="text-sm font-semibold text-yx-fg">Fontes recuperadas</p>
                <p className="mt-1 text-[13px] text-yx-fg-2">{knowledgeMatches.length === 1 ? '1 trecho disponível' : `${knowledgeMatches.length} trechos disponíveis`} para consulta semântica.</p>
              </div>
              <PendingSection code="B16" title="Perguntas sem resposta" />
              <div>
                <PendingAction code="B12">Testar o agente</PendingAction>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard id="agente-execucoes" title="Execuções recentes">
          <div className="space-y-3">
            {workflowRuns.slice(0, 6).map(run => (
              <div key={run.id} className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-yx-fg">{runTitle(run.runType)}</p>
                  <StatusChip variant={run.status === 'failed' ? 'crit' : 'neutral'}>{statusLabel(run.status)}</StatusChip>
                </div>
                <p className="mt-1 text-xs text-yx-fg-3">Criado em {formatPortalDateTime(run.createdAt)}</p>
                {(run.status === 'failed' || run.errorMessage) && (
                  <p className="mt-2 text-xs text-yx-crit">A execução falhou. A equipe YUX foi avisada.</p>
                )}
              </div>
            ))}
            {!workflowRuns.length && (
              <EmptyState
                title="Nenhuma execução ainda"
                description="Quando o agente rodar, cada execução aparece aqui com o resultado."
              />
            )}
          </div>
        </SectionCard>
      </section>
    </PortalPage>
  )
}
