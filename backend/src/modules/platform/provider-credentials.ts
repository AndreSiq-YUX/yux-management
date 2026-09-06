import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { loadPlatformProviderSecret } from './adminRepository.js'

export type EffectiveProviderCredential = {
  configured: boolean
  source: 'database'|'environment'|'none'
  value?: string
  providerConnectionId?: string
}

export async function resolveEffectiveProviderCredential(
  pool: pg.Pool,
  env: AppEnv,
  providerKey: 'jina_ai'|'smtp2go',
): Promise<EffectiveProviderCredential> {
  const selected = await pool.query<{id:string;status:string;secret_reference:string|null}>(
    `SELECT id,status,secret_reference FROM public.platform_provider_connections
      WHERE provider_key=$1 AND environment='production'
      ORDER BY is_default DESC,updated_at DESC LIMIT 1`,
    [providerKey],
  )
  const row = selected.rows[0]
  if (row?.status === 'active' && row.secret_reference) {
    const value = await loadPlatformProviderSecret(pool,row.id,'api_key',env.SESSION_SECRET).catch(()=>null)
    if (value) return {configured:true,source:'database',value,providerConnectionId:row.id}
  }
  const value = providerKey === 'jina_ai' ? env.JINA_API_KEY : env.SMTP2GO_API_KEY
  return value ? {configured:true,source:'environment',value} : {configured:false,source:'none'}
}
