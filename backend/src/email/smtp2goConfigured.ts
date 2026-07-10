import type pg from 'pg'
import { loadPlatformProviderSecret } from '../modules/platform/adminRepository.js'
import { sendSmtp2GoEmail, type EmailSendResult, type Smtp2GoSendInput } from './smtp2go.js'
import { assertEmailSendAllowed, recordSuccessfulEmailSend, type EmailCategory } from './delivery-policy.js'
import { runWithDatabaseRequestContext } from '../db/request-context.js'

type Smtp2GoConfiguredInput = Omit<Smtp2GoSendInput, 'apiKey' | 'senderEmail' | 'senderName'> & {
  organizationId?: string
  emailCategory?: EmailCategory
  recipientOptIn?: boolean
}

function stringConfig(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export async function sendConfiguredSmtp2GoEmail(
  pool: pg.Pool,
  keyMaterial: string,
  input: Smtp2GoConfiguredInput,
): Promise<EmailSendResult> {
  return runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, async () => {
  if (input.organizationId) {
    try {
      await assertEmailSendAllowed(pool, {
        organizationId: input.organizationId,
        recipient: input.to,
        category: input.emailCategory ?? 'transactional',
        recipientOptIn: input.recipientOptIn,
      })
    } catch (error) {
      return { sent: false, reason: 'smtp2go_rejected', error: error instanceof Error ? error.message : 'email_delivery_blocked' }
    }
  }
  const providerResult = await pool.query<{
    id: string
    display_name: string
    status: string
    public_config: Record<string, unknown> | null
  }>(
    `SELECT id, display_name, status, public_config
     FROM public.platform_provider_connections
     WHERE provider_type = 'email'
       AND provider_key = 'smtp2go'
       AND environment = 'production'
     ORDER BY is_default DESC, updated_at DESC
     LIMIT 1`,
  )

  const provider = providerResult.rows[0]
  if (!provider) {
    return { sent: false, reason: 'smtp2go_not_configured', error: 'SMTP2GO provider is not configured in Admin.' }
  }

  if (provider.status !== 'active') {
    return {
      sent: false,
      reason: 'smtp2go_not_configured',
      error: `SMTP2GO provider status is ${provider.status}.`,
    }
  }

  const apiKey = await loadPlatformProviderSecret(pool, provider.id, 'api_key', keyMaterial)
  const config = provider.public_config && typeof provider.public_config === 'object' ? provider.public_config : {}
  const senderEmail = stringConfig(config, ['invitationFromEmail', 'defaultFromEmail', 'senderEmail', 'fromEmail'])
  const senderName = stringConfig(config, ['invitationFromName', 'defaultFromName', 'senderName', 'fromName'])
    ?? provider.display_name
    ?? 'YUX Hub'

  if (!apiKey) {
    return { sent: false, reason: 'smtp2go_not_configured', error: 'SMTP2GO API key is not stored in Admin.' }
  }

  if (!senderEmail) {
    return { sent: false, reason: 'smtp2go_not_configured', error: 'SMTP2GO sender email is not configured in Admin.' }
  }

  const result = await sendSmtp2GoEmail({
    ...input,
    apiKey,
    senderEmail,
    senderName,
  })
  if (result.sent && input.organizationId) await recordSuccessfulEmailSend(pool, input.organizationId)
  return result
  })
}
