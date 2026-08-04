import { GitBranch, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { PipelineEditorDialog } from '@/components/crm/funnels/PipelineEditorDialog'
import { PipelineSummaryBoard } from '@/components/crm/funnels/PipelineSummaryBoard'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { formatPortalCurrency } from '@/lib/client-portal/portalDisplay'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmService } from '@/services/crmService'
import type {
  CrmGovernanceContext,
  CrmPipeline,
  CrmPipelineCreateInput,
  CrmPipelinePatch,
  CrmPipelineStage,
  CrmPipelineStageCreateInput,
  CrmPipelineStagePatch,
} from '@/types/crm'

function canManagePipelineConfiguration(governance: CrmGovernanceContext | null) {
  if (!governance?.currentMember) return false
  if (governance.currentMember.role === 'yux_admin') return true
  if (governance.currentMember.role !== 'client_admin' && governance.currentMember.role !== 'manager') return false
  return governance.instance.allowClientPipelineCustomization
}

function canMoveLead(governance: CrmGovernanceContext | null) {
  return ['seller', 'manager', 'client_admin', 'yux_admin'].includes(governance?.currentMember?.role || '')
}

export function PortalCommercialFunnelsPage() {
  const { organization, loading, error, pipelines, leads, reload } = usePortalCrmContext()
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const [editingPipeline, setEditingPipeline] = useState<CrmPipeline | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null)
  const [governance, setGovernance] = useState<CrmGovernanceContext | null>(null)
  const [governanceLoading, setGovernanceLoading] = useState(true)
  const [governanceError, setGovernanceError] = useState<string | null>(null)

  const selectedPipeline = useMemo(
    () => pipelines.find(pipeline => pipeline.id === selectedPipelineId) || pipelines[0],
    [pipelines, selectedPipelineId],
  )
  const openLeads = leads.filter(lead => (lead.status || 'open') === 'open')
  const openValue = openLeads.reduce((sum, lead) => sum + (lead.value || 0), 0)
  const selectedPipelineLeads = selectedPipeline
    ? leads.filter(lead => lead.pipelineId === selectedPipeline.id)
    : []
  const leadCountsByStage = selectedPipelineLeads.reduce<Record<string, number>>((counts, lead) => {
    counts[lead.stageId] = (counts[lead.stageId] || 0) + 1
    return counts
  }, {})
  const pipelineLeadCount = selectedPipelineLeads.length
  const canConfigure = canManagePipelineConfiguration(governance)
  const canMove = canMoveLead(governance)
  const maxPipelineCount = governance?.instance.maxPipelineCount || Math.max(pipelines.length, 1)
  const crmInstanceId = governance?.instance.id || selectedPipeline?.crmInstanceId || ''

  useEffect(() => {
    if (!pipelines.length) {
      setSelectedPipelineId('')
      return
    }
    setSelectedPipelineId(current => (
      pipelines.some(pipeline => pipeline.id === current)
        ? current
        : (pipelines.find(pipeline => pipeline.isDefault) || pipelines[0]).id
    ))
  }, [pipelines])

  useEffect(() => {
    let active = true
    if (!organization?.id) {
      setGovernance(null)
      setGovernanceLoading(false)
      setGovernanceError(null)
      return () => { active = false }
    }

    setGovernanceLoading(true)
    setGovernanceError(null)
    void crmGovernanceService.getActiveInstanceForOrganization(organization.id)
      .then(instance => instance ? crmGovernanceService.getGovernanceContext(instance.id) : null)
      .then(context => {
        if (!active) return
        setGovernance(context)
      })
      .catch(loadError => {
        if (!active) return
        console.error('Erro ao carregar governança do CRM:', loadError)
        setGovernance(null)
        setGovernanceError('Não foi possível validar as permissões de configuração do CRM.')
      })
      .finally(() => {
        if (active) setGovernanceLoading(false)
      })

    return () => { active = false }
  }, [organization?.id])

  const moveLead = async (leadId: string, stageId: string) => {
    setMovingLeadId(leadId)
    try {
      await crmService.moveLeadToStage(leadId, stageId)
      await reload()
      toast.success('Lead movido para a nova etapa.')
    } catch (moveError) {
      console.error('Erro ao mover lead no funil:', moveError)
      toast.error('Não foi possível mover o lead.')
    } finally {
      setMovingLeadId(null)
    }
  }

  const createPipeline = async (input: CrmPipelineCreateInput) => {
    const created = await crmService.createPipeline(input)
    await reload()
    toast.success('Funil criado.')
    return created
  }

  const updatePipeline = async (id: string, patch: CrmPipelinePatch) => {
    const updated = await crmService.updatePipeline(id, patch)
    await reload()
    toast.success('Funil atualizado.')
    return updated
  }

  const createStage = async (input: CrmPipelineStageCreateInput) => {
    const created = await crmService.createPipelineStage(input)
    await reload()
    toast.success('Etapa criada.')
    return created
  }

  const updateStage = async (id: string, patch: CrmPipelineStagePatch) => {
    const updated = await crmService.updatePipelineStage(id, patch)
    await reload()
    toast.success('Etapa atualizada.')
    return updated
  }

  const reorderStages = async (pipelineId: string, stageIds: string[]) => {
    const reordered = await crmService.reorderPipelineStages(pipelineId, stageIds)
    await reload()
    toast.success('Ordem das etapas atualizada.')
    return reordered
  }

  const openCreateEditor = () => {
    setEditingPipeline(null)
    setEditorOpen(true)
  }

  const openEditEditor = () => {
    if (!selectedPipeline) return
    setEditingPipeline(selectedPipeline)
    setEditorOpen(true)
  }

  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Funis"
      description="Visualize a operação por etapa, acompanhe métricas reais e configure a estrutura comercial quando seu perfil permitir."
      icon={GitBranch}
      metrics={[
        { label: 'Funis', value: String(pipelines.length), detail: 'Pipelines ativos para a organização.' },
        { label: 'Oportunidades', value: String(openLeads.length), detail: 'Leads abertos nos funis.' },
        { label: 'Valor aberto', value: formatPortalCurrency(openValue), detail: 'Soma das oportunidades abertas.' },
      ]}
      capabilities={[
        'Visualizar leads, valor, conversão e gargalos por etapa.',
        'Mover leads entre etapas e manter o histórico comercial integrado ao CRM.',
        'Configurar funis, etapas e ordem somente com a autorização da governança.',
        'Preservar a leitura para sellers e demais perfis sem permissão estrutural.',
      ]}
      primaryAction={{ label: 'Abrir Leads', href: '/portal/comercial/leads' }}
      secondaryActions={[
        { label: 'Empresas / Contas', href: '/portal/comercial/contas' },
        { label: 'Tarefas e Follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    >
      <section className="rounded-lg border bg-white p-5" aria-labelledby="funnels-operation-title">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 id="funnels-operation-title" className="text-base font-semibold text-gray-900">Operação dos funis</h2>
            <p className="mt-1 text-sm text-gray-600">Selecione um funil para acompanhar a distribuição e agir nos leads.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canConfigure && (
              <Button type="button" variant="outline" onClick={openCreateEditor} disabled={governanceLoading || !crmInstanceId}>
                <Plus className="mr-2 h-4 w-4" />
                Novo funil
              </Button>
            )}
            {selectedPipeline && canConfigure && (
              <Button type="button" onClick={openEditEditor} disabled={governanceLoading}>
                <Settings2 className="mr-2 h-4 w-4" />
                Configurar funil
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-gray-600" role="status">Carregando funis comerciais...</p>
        ) : error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-700" role="alert">{error}</p>
            <Button type="button" variant="outline" onClick={() => void reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            {governanceLoading && (
              <p className="mt-4 text-sm text-gray-600" role="status">Verificando permissões de configuração...</p>
            )}
            {governanceError && (
              <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="alert">{governanceError} A visualização continua disponível em modo somente leitura.</p>
            )}
            {!governanceLoading && !governanceError && governance && !canConfigure && (
              <p className="mt-4 rounded-md bg-gray-50 p-3 text-sm text-gray-600">Seu perfil pode acompanhar e operar leads, mas não alterar a estrutura dos funis.</p>
            )}

            {pipelines.length > 0 && (
              <div className="mt-4 max-w-md">
                <label htmlFor="selected-pipeline" className="text-sm font-medium text-gray-700">Funil em análise</label>
                <select
                  id="selected-pipeline"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedPipeline?.id || ''}
                  onChange={event => setSelectedPipelineId(event.target.value)}
                >
                  {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
                </select>
              </div>
            )}

            {selectedPipeline ? (
              <div className="mt-5">
                <PipelineSummaryBoard
                  pipeline={selectedPipeline}
                  leads={selectedPipelineLeads}
                  allPipelines={pipelines}
                  canMoveLeads={canMove}
                  movingLeadId={movingLeadId}
                  onMoveLead={moveLead}
                />
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-dashed p-8 text-center">
                <GitBranch className="mx-auto h-6 w-6 text-gray-400" aria-hidden="true" />
                <p className="mt-2 text-sm text-gray-600">Nenhum funil ativo encontrado para esta organização.</p>
                {canConfigure && <Button type="button" className="mt-4" onClick={openCreateEditor}>Criar primeiro funil</Button>}
              </div>
            )}
          </>
        )}
      </section>

      <PipelineEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        pipeline={editingPipeline}
        pipelines={pipelines}
        organizationId={organization?.id || ''}
        crmInstanceId={crmInstanceId}
        maxPipelineCount={maxPipelineCount}
        canEdit={canConfigure}
        pipelineLeadCount={pipelineLeadCount}
        leadCountsByStage={leadCountsByStage}
        onCreatePipeline={createPipeline}
        onUpdatePipeline={updatePipeline}
        onCreateStage={createStage}
        onUpdateStage={updateStage}
        onReorderStages={reorderStages}
      />
    </PortalJourneyPage>
  )
}
