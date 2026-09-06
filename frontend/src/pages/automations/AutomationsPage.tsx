import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AutomationWorkspace } from '@/components/automations/AutomationWorkspace'
import { isPersistedOrganizationId } from '@/lib/crm/followUpRules'
import { getSectorTemplate } from '@/lib/automations/sectorTemplateCatalog'
import { automationService, isAutomationBackendUnavailableError } from '@/services/automationService'
import { automationSequenceService } from '@/services/automationSequenceService'
import { usePlatformStore } from '@/stores/platformStore'
import type { AutomationFlow } from '@/types/automation'
import type { AutomationSequence } from '@/types/automationSequence'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'

type AutomationSection = 'Dashboard' | 'Automacoes' | 'Sequencias' | 'Templates' | 'Execucoes' | 'Configuracoes'

export function AutomationsPage({ workspaceContext: suppliedContext, initialSection = 'Automacoes' }: {
  workspaceContext?: WorkspaceContextV1 | null
  initialSection?: AutomationSection
} = {}) {
  const storedContext = usePlatformStore(state => state.workspaceContext)
  const platformError = usePlatformStore(state => state.error)
  const workspaceContext = suppliedContext ?? storedContext
  const organizationId = workspaceContext?.organizationId ?? ''
  const [flows, setFlows] = useState<AutomationFlow[]>([])
  const [sequences, setSequences] = useState<AutomationSequence[]>([])
  const [loading, setLoading] = useState(true)
  const [sequencesLoading, setSequencesLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [backendUnavailable, setBackendUnavailable] = useState(false)

  const load = useCallback(async () => {
    if (!organizationId || !isPersistedOrganizationId(organizationId)) {
      setFlows([])
      setSequences([])
      setLoadError(platformError || 'Nao foi possivel carregar uma organizacao real para automacoes. Verifique a sessao do usuario e o acesso a organizations.')
      setBackendUnavailable(false)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      setLoadError(null)
      setBackendUnavailable(false)
      setFlows(await automationService.getFlows({ organizationId }))
    } catch (error) {
      console.error('Erro ao carregar automacoes:', error)
      const isBackendMissing = isAutomationBackendUnavailableError(error)
      setBackendUnavailable(isBackendMissing)
      setLoadError(isBackendMissing
        ? 'A base de automacoes ainda nao esta disponivel no backend alvo. Aplique as migrations/probes de automacoes e confira as permissoes da API.'
        : 'Nao foi possivel carregar automacoes para esta organizacao.')
      if (!isBackendMissing) toast.error('Erro ao carregar automacoes')
      setFlows([])
    } finally {
      setLoading(false)
    }
  }, [organizationId, platformError])

  const loadSequences = useCallback(async () => {
    if (!organizationId || !isPersistedOrganizationId(organizationId) || backendUnavailable) return

    setSequencesLoading(true)
    try {
      setSequences(await automationSequenceService.getSequences(organizationId))
    } catch (error) {
      console.error('Erro ao carregar sequencias:', error)
    } finally {
      setSequencesLoading(false)
    }
  }, [organizationId, backendUnavailable])

  useEffect(() => {
    load()
    loadSequences()
  }, [load, loadSequences])

  const withToast = async (action: () => Promise<unknown>, success: string) => {
    if (!organizationId || !isPersistedOrganizationId(organizationId) || backendUnavailable || !workspaceContext?.canConfigure) {
      toast.error('Automacoes ainda nao estao prontas para gravacao neste ambiente')
      return
    }

    try {
      await action()
      toast.success(success)
      load()
    } catch (error) {
      console.error('Erro em automacao:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar automacao')
    }
  }

  if (loading) return <p className="text-sm text-slate-600">Carregando automacoes...</p>

  return (
    <AutomationWorkspace
      flows={flows}
      workspaceContext={workspaceContext ?? undefined}
      initialSection={initialSection}
      sequences={sequences}
      sequencesLoading={sequencesLoading}
      loadError={loadError}
      backendUnavailable={backendUnavailable}
      onRetry={() => { load(); loadSequences() }}
      onCreateFlow={input => withToast(async () => {
        const flow = await automationService.createFlow({ ...input, organizationId })

        if (input.sectorTemplateKey) {
          const template = getSectorTemplate(input.sectorTemplateKey)
          if (template) {
            for (const trigger of template.triggers) {
              await automationService.addTrigger(flow.id, trigger)
            }
            for (const condition of template.conditions) {
              await automationService.addCondition(flow.id, condition)
            }
            for (const [index, action] of template.actions.entries()) {
              await automationService.addAction(flow.id, { actionType: action.actionType, orderIndex: index + 1, payload: action.payload })
            }
          }
        }
      }, 'Fluxo criado')}
      onUpdateFlow={(flowId, input) => withToast(() => automationService.updateFlow(flowId, input), 'Fluxo atualizado')}
      onDeleteFlow={flowId => withToast(() => automationService.deleteFlow(flowId), 'Fluxo excluido')}
      onDuplicateFlow={flowId => withToast(async () => {
        await automationService.duplicateFlow(flowId, organizationId)
      }, 'Fluxo duplicado')}
      onToggleFlow={(flowId, isEnabled) => withToast(async () => {
        if (isEnabled) await automationService.activateFlow(flowId, organizationId)
        else {
          const paused = await automationService.pauseFlow(flowId, organizationId)
          if (paused.activeRuns > 0) toast(`Pausa aplicada; ${paused.activeRuns} execução(ões) já iniciada(s) continuarão.`)
        }
      }, isEnabled ? 'Fluxo ativado' : 'Fluxo pausado')}
      onPublishFlow={flowId => withToast(async () => {
        await automationService.activateFlow(flowId, organizationId)
      }, 'Fluxo publicado')}
      onBulkToggle={(flowIds, isEnabled) => withToast(async () => {
        for (const flowId of flowIds) {
          if (isEnabled) await automationService.activateFlow(flowId, organizationId)
          else await automationService.pauseFlow(flowId, organizationId)
        }
      }, `${flowIds.length} fluxo(s) atualizado(s)`)}
      onBulkDelete={flowIds => withToast(async () => {
        for (const flowId of flowIds) {
          await automationService.deleteFlow(flowId)
        }
      }, `${flowIds.length} fluxo(s) excluido(s)`)}
      onAddTrigger={(flowId, triggerType, config) => withToast(() => automationService.addTrigger(flowId, { triggerType, config }), 'Trigger adicionado')}
      onUpdateTrigger={(flowId, triggerId, triggerType, config) => withToast(() => automationService.updateTrigger(triggerId, { triggerType, config }), 'Trigger atualizado')}
      onDeleteTrigger={(flowId, triggerId) => withToast(() => automationService.deleteTrigger(triggerId), 'Trigger removido')}
      onAddCondition={(flowId, field, operator, value) => withToast(() => automationService.addCondition(flowId, { field, operator, value }), 'Condicao adicionada')}
      onUpdateCondition={(flowId, conditionId, field, operator, value) => withToast(() => automationService.updateCondition(conditionId, { field, operator, value }), 'Condicao atualizada')}
      onDeleteCondition={(flowId, conditionId) => withToast(() => automationService.deleteCondition(conditionId), 'Condicao removida')}
      onAddAction={(flowId, actionType, payload) => withToast(() => automationService.addAction(flowId, { actionType, payload }), 'Acao adicionada')}
      onUpdateAction={(flowId, actionId, actionType, payload) => withToast(() => automationService.updateAction(actionId, { actionType, payload }), 'Acao atualizada')}
      onDeleteAction={(flowId, actionId) => withToast(() => automationService.deleteAction(actionId), 'Acao removida')}
      onReorderActions={(flowId, actions) => withToast(async () => {
        for (const action of actions) {
          await automationService.updateAction(action.id, { orderIndex: action.orderIndex })
        }
      }, 'Acoes reordenadas')}
      onSaveSimulation={result => withToast(async () => {
        await automationService.simulateFlow(result.flowId, {
          organizationId, eventType: result.eventType, samplePayload: result.samplePayload,
        })
      }, 'Simulacao salva')}
      onRollbackVersion={(flowId, versionId) => withToast(() => automationService.activateVersion(flowId, versionId, organizationId), 'Versao restaurada')}
      onRetryExecution={runId => withToast(async () => {
        console.log('Retry execution:', runId)
      }, 'Execucao reprocessada')}
      onCreateFromTemplate={templateKey => withToast(async () => {
        const template = getSectorTemplate(templateKey)
        if (!template) return
        const flow = await automationService.createFlow({
          organizationId,
          name: `Fluxo ${template.label}`,
          description: template.description,
          sectorTemplateKey: templateKey,
        })
        for (const trigger of template.triggers) {
          await automationService.addTrigger(flow.id, trigger)
        }
        for (const condition of template.conditions) {
          await automationService.addCondition(flow.id, condition)
        }
        for (const [index, action] of template.actions.entries()) {
          await automationService.addAction(flow.id, { actionType: action.actionType, orderIndex: index + 1, payload: action.payload })
        }
      }, 'Fluxo criado a partir do template')}
      onToggleDryRun={(flowId, dryRun) => withToast(() => automationService.updateFlow(flowId, { riskLevel: dryRun ? 'test' : 'low' }), 'Modo teste atualizado')}
      onCreateSequence={input => withToast(async () => {
        await automationSequenceService.createSequence({ ...input, organizationId })
        loadSequences()
      }, 'Sequencia criada')}
      onDeleteSequence={sequenceId => withToast(() => automationSequenceService.deleteSequence(sequenceId), 'Sequencia excluida')}
      onToggleSequence={(sequenceId, status) => withToast(() => automationSequenceService.setSequenceStatus(sequenceId, status), 'Sequencia atualizada')}
      onAddSequenceStep={(sequenceId, step) => withToast(async () => {
        await automationSequenceService.addStep(sequenceId, step)
        loadSequences()
      }, 'Passo adicionado')}
      onDeleteSequenceStep={(sequenceId, stepId) => withToast(() => automationSequenceService.deleteStep(stepId), 'Passo removido')}
    />
  )
}
