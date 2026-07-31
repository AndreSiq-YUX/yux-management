import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { refreshGoogleAccessToken } from '../../lib/edge-compat/providerOAuth.js'
import {
  getProviderSecretReference,
  loadProviderSecretFromPool,
  storeProviderSecretToPool,
  type SecretConnectionTable,
  type SecretTargetKind,
} from '../../lib/edge-compat/providerSecrets.js'

type GoogleProvider = 'google_business_profile' | 'google_ads'

type ExpiringSecretRow = {
  reference: string
  organization_id: string
  client_id: string | null
  contract_id: string | null
  provider: GoogleProvider
  target_kind: SecretTargetKind
  connection_table: SecretConnectionTable
  connection_id: string
  metadata: Record<string, unknown> | null
}

// Only tables with a compatible status column can be flagged for re-auth.
const reauthStatusTables = new Set<SecretConnectionTable>(['publishing_connections', 'ad_provider_connections'])

export async function refreshExpiringGoogleTokens(
  pool: Pick<pg.Pool, 'query'>,
  env: Pick<AppEnv, 'GOOGLE_OAUTH_CLIENT_ID' | 'GOOGLE_OAUTH_CLIENT_SECRET'>,
  options: { expiryWindowMinutes?: number; fetcher?: typeof fetch } = {},
) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return { refreshed: 0, failed: 0, skipped: 'google_oauth_not_configured' as const }
  }

  const windowMinutes = options.expiryWindowMinutes ?? 60
  const { rows } = await pool.query<ExpiringSecretRow>(
    `SELECT reference, organization_id, client_id, contract_id, provider, target_kind,
            connection_table, connection_id, metadata
     FROM public.provider_integration_secrets
     WHERE provider IN ('google_business_profile', 'google_ads')
       AND secret_kind = 'access_token'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW() + make_interval(mins => $1)`,
    [windowMinutes],
  )

  let refreshed = 0
  let failed = 0
  for (const row of rows) {
    try {
      const refreshReference = getProviderSecretReference({
        provider: row.provider,
        targetKind: row.target_kind,
        connectionTable: row.connection_table,
        connectionId: row.connection_id,
        secretKind: 'refresh_token',
      })
      const refreshSecret = await loadProviderSecretFromPool(pool, refreshReference)
      const token = await refreshGoogleAccessToken({
        provider: row.provider,
        refreshToken: refreshSecret.value,
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        fetcher: options.fetcher,
      })
      await storeProviderSecretToPool(pool, {
        organizationId: row.organization_id,
        clientId: row.client_id,
        contractId: row.contract_id,
        provider: row.provider,
        targetKind: row.target_kind,
        connectionTable: row.connection_table,
        connectionId: row.connection_id,
        secretKind: 'access_token',
        value: token.accessToken,
        expiresAt: token.expiresAt ?? null,
        metadata: { ...(row.metadata ?? {}), refreshed_at: new Date().toISOString() },
      })
      refreshed += 1
    } catch (error) {
      failed += 1
      const status = (error as { status?: string }).status
      if (status === 'needs_reauth' && reauthStatusTables.has(row.connection_table)) {
        await pool.query(
          `UPDATE public.${row.connection_table}
           SET status = 'needs_reauth', updated_at = NOW()
           WHERE id = $1`,
          [row.connection_id],
        ).catch(() => undefined)
      }
      console.error(`[google-token-refresh] failed to refresh ${row.reference}`, error)
    }
  }

  return { refreshed, failed }
}
