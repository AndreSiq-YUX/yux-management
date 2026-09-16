import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { loadPlatformProviderSecret } from './adminRepository.js'

type Provider = 'openrouter' | 'openai_direct'
export type EmbeddingAttempt = { provider: Provider; model: string; apiKey?: string; baseUrl: string; approved: boolean; credentialError?: string }
export type EmbeddingConfiguration = { attempts: EmbeddingAttempt[]; dimensions: number }
export type LlmScope = { organizationId?: string | null; clientId?: string | null; contractId?: string | null; agentId?: string | null; routingTier?: string }

export function legacyEmbeddingConfiguration(env: AppEnv): EmbeddingConfiguration {
  const model = env.OPENROUTER_EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b'
  const approved = model === 'openrouter/free' || model.endsWith(':free') || (env.OPENROUTER_ALLOWED_PAID_MODELS || '').split(',').map(v => v.trim()).includes(model)
  return { dimensions: env.OPENROUTER_EMBEDDING_DIMENSIONS || 1024, attempts: [{ provider: 'openrouter', model, approved, apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' }] }
}

/** A request/batch snapshot. Never persist or expose this object: it contains credentials. */
export async function resolveEmbeddingConfiguration(pool: pg.Pool, env: AppEnv, scope: LlmScope = {}): Promise<EmbeddingConfiguration> {
  const scopeKeys = ['organization_id', 'client_id', 'contract_id', 'agent_id'] as const
  const scopeValues = [scope.organizationId, scope.clientId, scope.contractId, scope.agentId]
  const result = await pool.query(
    `SELECT * FROM public.model_routing_rules WHERE agent_type IN ('knowledge_embeddings','global_embeddings')
      AND (organization_id IS NULL OR organization_id=$1::uuid) AND (client_id IS NULL OR client_id=$2::uuid)
      AND (contract_id IS NULL OR contract_id=$3::uuid) AND (agent_id IS NULL OR agent_id=$4::uuid)`, scopeValues.map(value => value || null),
  )
  const tier = scope.routingTier || 'default'
  const rows = result.rows.filter(row => scopeKeys.every((key, index) => !row[key] || String(row[key]) === String(scopeValues[index] || '')) && [tier, 'default'].includes(row.routing_tier || 'default'))
  rows.sort((a, b) => scopeKeys.filter(key => b[key]).length - scopeKeys.filter(key => a[key]).length || Number(b.routing_tier === tier) - Number(a.routing_tier === tier) || Number(b.version || 1) - Number(a.version || 1) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  const global = rows.find(row => row.agent_type === 'global_embeddings')
  const selected = rows.find(row => row.agent_type === 'knowledge_embeddings') || global
  if (selected && selected.status !== 'active') throw new Error('llm_route_not_active')
  const legacy = legacyEmbeddingConfiguration(env)
  const attempts: EmbeddingAttempt[] = []
  function append(provider: Provider, model: string, explicit = true) {
    if (!['openrouter', 'openai_direct'].includes(provider) || !model?.trim()) throw new Error('invalid_llm_route')
    if (attempts.some(a => a.provider === provider && a.model === model.trim())) return
    attempts.push({ provider, model: model.trim(), approved: explicit || legacy.attempts[0].approved,
      baseUrl: provider === 'openai_direct' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1' })
  }
  function extend(row: typeof selected) {
    if (!row) return
    append(row.provider, row.model_name)
    for (const fallback of row.fallback_routes || []) append(fallback.provider, fallback.modelName)
    if (row.fallback_model_name) append(row.provider, row.fallback_model_name)
  }
  if (selected) extend(selected)
  else append('openrouter', legacy.attempts[0].model, false)
  if (global?.status === 'active') extend(global)
  const credentials = new Map<Provider, Pick<EmbeddingAttempt, 'apiKey' | 'baseUrl' | 'credentialError'>>()
  for (const attempt of attempts) {
    if (!credentials.has(attempt.provider)) {
      const { rows: providers } = await pool.query(
        `SELECT id,status,secret_reference,public_config FROM public.platform_provider_connections
         WHERE provider_key=$1 AND provider_type='llm' AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`, [attempt.provider],
      )
      const provider = providers[0]
      const credential: Pick<EmbeddingAttempt, 'apiKey' | 'baseUrl' | 'credentialError'> = { baseUrl: attempt.baseUrl }
      if (provider?.public_config?.baseUrl) {
        try {
          const url = new URL(String(provider.public_config.baseUrl).trim())
          const wrongVendor = attempt.provider === 'openrouter' ? 'api.openai.com' : 'openrouter.ai'
          if (url.protocol !== 'https:' || url.username || url.password || url.hostname === wrongVendor) throw new Error('invalid_provider_base_url')
          credential.baseUrl = url.toString().replace(/\/$/, '')
        } catch { credential.credentialError = 'invalid_provider_base_url' }
      }
      if (provider && ['disabled', 'needs_reauth', 'failed'].includes(provider.status)) credential.credentialError = 'llm_provider_not_active'
      else if (provider) {
        try {
          credential.apiKey = await loadPlatformProviderSecret(pool, provider.id, 'api_key', env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 ? `provider-key:${env.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : env.SESSION_SECRET) || undefined
          if (!credential.apiKey) credential.apiKey = attempt.provider === 'openai_direct' ? env.OPENAI_API_KEY : env.OPENROUTER_API_KEY
        } catch { credential.credentialError = 'llm_provider_credentials_invalid' }
      } else credential.apiKey = attempt.provider === 'openai_direct' ? env.OPENAI_API_KEY : env.OPENROUTER_API_KEY
      credentials.set(attempt.provider, credential)
    }
    Object.assign(attempt, credentials.get(attempt.provider))
  }
  return { dimensions: legacy.dimensions, attempts }
}
