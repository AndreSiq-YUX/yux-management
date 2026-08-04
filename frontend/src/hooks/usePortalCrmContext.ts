import { useCallback, useEffect, useState } from 'react'
import { crmService } from '@/services/crmService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmLead, CrmPipeline, CrmTaskListItem } from '@/types/crm'

interface PortalCrmContextState {
  pipelines: CrmPipeline[]
  leads: CrmLead[]
  tasks: CrmTaskListItem[]
}

const emptyState: PortalCrmContextState = {
  pipelines: [],
  leads: [],
  tasks: [],
}

export function usePortalCrmContext() {
  const organization = usePlatformStore(state => state.organization)
  const activeContract = usePlatformStore(state => state.activeContract)
  const enabledModuleKeys = usePlatformStore(state => state.enabledModuleKeys)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [state, setState] = useState<PortalCrmContextState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (isPlatformLoading) {
      setLoading(true)
      return
    }

    if (!activeContract || !organization || organization.kind !== 'client' || !enabledModuleKeys.includes('crm')) {
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
      const crmInstanceIds = [...new Set(pipelines.map(pipeline => pipeline.crmInstanceId).filter((id): id is string => Boolean(id)))]
      const taskPages = await Promise.all(crmInstanceIds.map(crmInstanceId => crmService.getTaskPage({
        organizationId: organization.id,
        crmInstanceId,
        limit: 100,
      })))

      setState({
        pipelines,
        leads,
        tasks: taskPages.flatMap(page => page.items),
      })
    } catch (loadError) {
      console.error('Erro ao carregar CRM do portal:', loadError)
      setState(emptyState)
      setError('Nao foi possivel carregar os dados comerciais.')
    } finally {
      setLoading(false)
    }
  }, [activeContract, enabledModuleKeys, isPlatformLoading, organization])

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
