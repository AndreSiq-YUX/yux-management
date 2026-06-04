import type {
  AdminHubSummary,
  PlatformLimitStatus,
  PlatformProviderStatus,
} from '@/types/adminPlatform'

const failingProviderStatuses: PlatformProviderStatus[] = [
  'degraded',
  'failed',
  'needs_reauth',
  'stale',
]

const activeContractStatuses = new Set(['active'])
const attentionLimitStatuses: PlatformLimitStatus[] = ['near_limit', 'over_limit', 'blocked']

export function getLimitStatus(usedValue: number, limitValue?: number | null): PlatformLimitStatus {
  if (!Number.isFinite(usedValue)) return 'ok'
  if (!limitValue || limitValue <= 0) return 'ok'
  if (usedValue > limitValue) return 'over_limit'
  if (usedValue / limitValue >= 0.8) return 'near_limit'

  return 'ok'
}

export function isProviderFailing(status: PlatformProviderStatus) {
  return failingProviderStatuses.includes(status)
}

export function maskSecretReference(secretReference?: string | null) {
  if (!secretReference) return 'Nao configurado'

  const separatorIndex = secretReference.indexOf(':')
  if (separatorIndex === -1) return '***********'

  const prefix = secretReference.slice(0, separatorIndex)
  return `${prefix}:***********`
}

export function summarizeAdminHub(input: {
  clients: Array<{ id: string }>
  contracts: Array<{ id: string; status: string }>
  modules: string[]
  providers: Array<{ id: string; status: PlatformProviderStatus }>
  usage: Array<{ id: string; status: PlatformLimitStatus }>
}): AdminHubSummary {
  return {
    clientCount: input.clients.length,
    activeContractCount: input.contracts.filter(contract => activeContractStatuses.has(contract.status)).length,
    activeModuleCount: new Set(input.modules).size,
    failingProviderCount: input.providers.filter(provider => isProviderFailing(provider.status)).length,
    nearLimitCount: input.usage.filter(item => attentionLimitStatuses.includes(item.status)).length,
  }
}
