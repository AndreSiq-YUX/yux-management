import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AutomationWorkspace } from '@/components/automations/AutomationWorkspace'
import { isPersistedOrganizationId } from '@/lib/crm/followUpRules'
import { automationService, isAutomationBackendUnavailableError } from '@/services/automationService'
import { usePlatformStore } from '@/stores/platformStore'
import type { AutomationFlow } from '@/types/automation'

export function AutomationsPage() {
  const organization = usePlatformStore(state => state.organization)
  const platformError = usePlatformStore(state => state.error)
  const organizationId = organization?.id || 'local-yux'
  const [flows, setFlows] = useState<AutomationFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [backendUnavailable, setBackendUnavailable] = useState(false)

  const load = useCallback(async () => {
    if (!isPersistedOrganizationId(organizationId)) {
      setFlows([])
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
        ? 'A base de automacoes ainda nao esta disponivel no Supabase alvo. Aplique as migrations/probes de automacoes e confira os grants da Data API.'
        : 'Nao foi possivel carregar automacoes para esta organizacao.')
      if (!isBackendMissing) toast.error('Erro ao carregar automacoes')
      setFlows([])
    } finally {
      setLoading(false)
    }
  }, [organizationId, platformError])

  useEffect(() => {
    load()
  }, [load])

  const withToast = async (action: () => Promise<unknown>, success: string) => {
    if (!isPersistedOrganizationId(organizationId) || backendUnavailable) {
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
      loadError={loadError}
      backendUnavailable={backendUnavailable}
      onRetry={load}
      onCreateFlow={() => withToast(async () => {
        const flow = await automationService.createFlow({
          organizationId,
          name: 'Novo fluxo comercial',
          description: 'Trigger de lead com tarefa comercial.',
          sectorTemplateKey: 'manual',
        })
        await automationService.addTrigger(flow.id, { triggerType: 'lead.stage_changed', config: {} })
        await automationService.addCondition(flow.id, { field: 'source', operator: 'exists' })
        await automationService.addAction(flow.id, { actionType: 'create_task', orderIndex: 1, payload: { title: 'Follow-up comercial' } })
      }, 'Fluxo criado')}
      onToggleFlow={(flowId, isEnabled) => withToast(() => automationService.setFlowEnabled(flowId, isEnabled), 'Fluxo atualizado')}
      onPublishFlow={flowId => withToast(() => automationService.publishFlow(flowId), 'Fluxo publicado')}
    />
  )
}
