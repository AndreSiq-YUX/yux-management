import type pg from 'pg'
import { loadPlatformProviderSecret } from '../modules/platform/adminRepository.js'
import { sendSmtp2GoEmail, type EmailSendResult, type Smtp2GoSendInput } from './smtp2go.js'
import { assertEmailSendAllowed, recordSuccessfulEmailSend, type EmailCategory } from './delivery-policy.js'
import { runWithDatabaseRequestContext } from '../db/request-context.js'
import { requireCommercialSender, requireCurrentLeadRecipient } from './commercial-sender.js'
import { appendOptOutFooter } from './contact-policy.js'

type Smtp2GoConfiguredInput = Omit<Smtp2GoSendInput, 'apiKey' | 'senderEmail' | 'senderName'> & {
  organizationId?: string
  emailCategory?: EmailCategory
  recipientOptIn?: boolean
  /**
   * Organization commercial identity. `revision: null` uses the current approved
   * identity; `optional: true` falls back to the platform sender when none is approved.
   */
  commercialSender?: { organizationId: string; revision: string | null; leadId: string | null; optional?: boolean }
  /** One-click opt-out link appended to commercial messages (footer + RFC 8058 headers). */
  optOutUrl?: string
  /** Routed reply address (reply capture) or the lead's address on reply copies. */
  replyToOverride?: string
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
  try {
    return await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, async () => {
      const commercial = input.commercialSender
      const sender = commercial
        ? await requireCommercialSender(pool, commercial.organizationId, commercial.revision).catch(() => null)
        : null
      if (commercial && ((!sender && !commercial.optional) || commercial.organizationId !== input.organizationId
        || commercial.leadId === '' || (sender && commercial.leadId === null && sender.replyTo !== input.to))) {
        return { sent: false, reason: 'smtp2go_rejected', error: 'commercial_sender_not_ready' }
      }
      if (input.organizationId) {
        try {
          if (commercial?.leadId) {
            await requireCurrentLeadRecipient(pool, input.organizationId, commercial.leadId, input.to)
          }
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
      const senderEmail = sender?.fromEmail ?? stringConfig(config, ['invitationFromEmail', 'defaultFromEmail', 'senderEmail', 'fromEmail'])
      const senderName = sender?.fromName ?? stringConfig(config, ['invitationFromName', 'defaultFromName', 'senderName', 'fromName'])
        ?? provider.display_name
        ?? 'YUX Hub'

      if (!apiKey) {
        return { sent: false, reason: 'smtp2go_not_configured', error: 'SMTP2GO API key is not stored in Admin.' }
      }

      if (!senderEmail) {
        return { sent: false, reason: 'smtp2go_not_configured', error: 'SMTP2GO sender email is not configured in Admin.' }
      }

      const body = input.optOutUrl
        ? appendOptOutFooter({ text: input.textBody ?? '', html: input.htmlBody ?? '' }, senderName, input.optOutUrl)
        : null
      const headers = [
        ...(input.customHeaders ?? []),
        ...(input.replyToOverride || sender
          ? [{ header: 'Reply-To', value: input.replyToOverride ?? sender!.replyTo }]
          : []),
        ...(input.optOutUrl
          ? [
              { header: 'List-Unsubscribe', value: `<${input.optOutUrl}>` },
              { header: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
            ]
          : []),
      ]
      const { optOutUrl: _optOutUrl, commercialSender: _commercialSender, replyToOverride: _replyTo, ...providerInput } = input
      const result = await sendSmtp2GoEmail({
        ...providerInput,
        ...(body ? { textBody: body.text, htmlBody: body.html } : {}),
        apiKey,
        senderEmail,
        senderName,
        customHeaders: headers.length ? headers : undefined,
      })
      if (result.sent && input.organizationId) await recordSuccessfulEmailSend(pool, input.organizationId)
      return result
    })
  } catch (error) {
    return {
      sent: false,
      reason: 'smtp2go_not_configured',
      error: 'Não foi possível carregar a configuração do provedor de e-mail. Revise o SMTP2GO e tente novamente.',
      diagnosticError: error,
    }
  }
}
