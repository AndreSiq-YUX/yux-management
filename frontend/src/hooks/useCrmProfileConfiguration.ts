import { useCallback, useEffect, useState } from 'react'
import { crmRecordProfileService } from '@/services/crmRecordProfileService'
import type { CrmProfileConfiguration } from '@/types/crmRecordProfile'

export function useCrmProfileConfiguration(crmInstanceId?: string) {
  const [state, setState] = useState<{ instanceId?: string; configuration?: CrmProfileConfiguration; error?: string; loading: boolean }>({ loading: false })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    if (!crmInstanceId) return
    let cancelled = false
    setState({ instanceId: crmInstanceId, loading: true })
    crmRecordProfileService.getConfiguration(crmInstanceId).then(configuration => {
      if (!cancelled) setState({ instanceId: crmInstanceId, configuration, loading: false })
    }).catch(error => {
      if (!cancelled) setState({ instanceId: crmInstanceId, error: error instanceof Error ? error.message : 'Não foi possível carregar os campos.', loading: false })
    })
    return () => { cancelled = true }
  }, [crmInstanceId, revision])
  return { configuration: state.instanceId === crmInstanceId ? state.configuration : undefined,
    error: state.instanceId === crmInstanceId ? state.error : undefined,
    loading: Boolean(crmInstanceId) && (state.instanceId !== crmInstanceId || state.loading), reload }
}
