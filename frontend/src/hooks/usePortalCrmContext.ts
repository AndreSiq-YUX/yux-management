import { useCallback, useEffect, useState } from 'react'
import { crmService } from '@/services/crmService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmLead, CrmPipeline, CrmTask } from '@/types/crm'

interface PortalCrmContextState {
  pipelines: CrmPipeline[]
  leads: CrmLead[]
  tasks: CrmTask[]
}

const emptyState: PortalCrmContextState = {
  pipelines: [],
  leads: [],
  tasks: [],
}

export function usePortalCrmContext() {
  const organization = usePlatformStore(state => state.organization)
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const [state, setState] = useState<PortalCrmContextState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!organization || !enabledModuleKeys.includes('crm')) {
      setState(emptyState)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const pipelines = await crmService.getPipelines(organization.id)
      const leadGroups = await Promise.all(pipelines.map(pipeline => (
        pipeline.crmInstanceId
          ? crmService.getLeadsForInstance(pipeline.crmInstanceId, pipeline.id)
          : crmService.getLeads(organization.id, pipeline.id)
      )))
      const leads = leadGroups.flat()
      const taskGroups = await Promise.all(leads.slice(0, 50).map(lead => crmService.getTasks(lead.id)))

      setState({
        pipelines,
        leads,
        tasks: taskGroups.flat(),
      })
    } catch (loadError) {
      console.error('Erro ao carregar CRM do portal:', loadError)
      setState(emptyState)
      setError('Nao foi possivel carregar os dados comerciais.')
    } finally {
      setLoading(false)
    }
  }, [enabledModuleKeys, organization])

  useEffect(() => {
    load()
  }, [load])

  return {
    organization,
    enabledModuleKeys,
    loading,
    error,
    reload: load,
    ...state,
  }
}
