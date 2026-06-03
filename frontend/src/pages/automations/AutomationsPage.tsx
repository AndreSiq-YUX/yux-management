import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AutomationWorkspace } from '@/components/automations/AutomationWorkspace'
import { automationService } from '@/services/automationService'
import { usePlatformStore } from '@/stores/platformStore'
import type { AutomationFlow } from '@/types/automation'

export function AutomationsPage() {
  const organization = usePlatformStore(state => state.organization)
  const organizationId = organization?.id || 'local-yux'
  const [flows, setFlows] = useState<AutomationFlow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setFlows(await automationService.getFlows({ organizationId }))
    } catch (error) {
      console.error('Erro ao carregar automacoes:', error)
      toast.error('Erro ao carregar automacoes')
      setFlows([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    load()
  }, [load])

  const withToast = async (action: () => Promise<unknown>, success: string) => {
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
