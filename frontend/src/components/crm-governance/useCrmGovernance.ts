import { useCallback, useEffect, useRef, useState } from 'react'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmGovernanceContext } from '@/types/crm'

export type CrmGovernanceState =
  | { status: 'loading' }
  /** Não há CRM publicado (ou organização) para esta empresa. */
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; context: CrmGovernanceContext }

type LoadResult = { context: CrmGovernanceContext | null }

// Os três painéis aparecem juntos em Empresa › Equipe: pedidos iguais e simultâneos viram um só.
const inflight = new Map<string, Promise<LoadResult>>()

function loadGovernance(organizationId: string): Promise<LoadResult> {
  const existing = inflight.get(organizationId)
  if (existing) return existing
  const request = (async () => {
    const instance = await crmGovernanceService.getActiveInstanceForOrganization(organizationId)
    if (!instance) return { context: null }
    return { context: await crmGovernanceService.getGovernanceContext(instance.id) }
  })().finally(() => {
    inflight.delete(organizationId)
  })
  inflight.set(organizationId, request)
  return request
}

/** Carrega a instância ativa do CRM da empresa e o contexto de governança (pessoas, equipes e vagas). */
export function useCrmGovernance() {
  const organizationId = usePlatformStore(state => state.organization?.id)
  const platformLoading = usePlatformStore(state => state.isLoading)
  const [state, setState] = useState<CrmGovernanceState>({ status: 'loading' })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const safeSet = useCallback((next: CrmGovernanceState) => { if (mounted.current) setState(next) }, [])

  const load = useCallback(async () => {
    if (platformLoading) {
      safeSet({ status: 'loading' })
      return
    }
    if (!organizationId) {
      safeSet({ status: 'unavailable' })
      return
    }
    safeSet({ status: 'loading' })
    try {
      const { context } = await loadGovernance(organizationId)
      safeSet(context ? { status: 'ready', context } : { status: 'unavailable' })
    } catch (error) {
      console.error('Erro ao carregar a governança do CRM:', error)
      safeSet({ status: 'error' })
    }
  }, [organizationId, platformLoading, safeSet])

  useEffect(() => { void load() }, [load])

  return { state, reload: load }
}
