import type pg from 'pg'
import { sendEmailRequest, type EmailDeliveryResult } from '../../modules/email-delivery/service.js'

export type EmailSendJobData = {
  requestId: string
}

export async function handleEmailSend(
  pool: Pick<pg.Pool, 'query'>,
  data: Record<string, unknown> | EmailSendJobData,
  keyMaterial = process.env.SESSION_SECRET ?? '',
): Promise<EmailDeliveryResult> {
  const requestId = typeof data.requestId === 'string' ? data.requestId.trim() : ''
  if (!requestId) throw new Error('requestId is required')
  if (!keyMaterial) throw new Error('email_key_material_required')
  return sendEmailRequest(pool, requestId, keyMaterial)
}
