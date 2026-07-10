import type pg from 'pg'

export type EmailCategory = 'transactional' | 'operational' | 'marketing'

export class EmailDeliveryPolicyError extends Error {
  statusCode = 422
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!email) throw new EmailDeliveryPolicyError('recipient_email_required')
  return email
}

export async function assertEmailSendAllowed(
  pool: Pick<pg.Pool, 'query'>,
  input: { organizationId: string; recipient: string; category: EmailCategory; recipientOptIn?: boolean },
) {
  const recipient = normalizeEmail(input.recipient)
  const suppressed = await pool.query<{ id: string }>(
    `SELECT id FROM public.email_suppression_entries
      WHERE organization_id = $1 AND lower(email) = $2 LIMIT 1`,
    [input.organizationId, recipient],
  )
  if (suppressed.rows[0]) throw new EmailDeliveryPolicyError('recipient_suppressed')
  if (input.category === 'marketing' && input.recipientOptIn !== true) throw new EmailDeliveryPolicyError('recipient_not_opted_in')

  const usage = await pool.query<{ daily_limit: number; sent_count: number }>(
    `SELECT COALESCE((
         SELECT daily_send_limit FROM public.email_provider_connections
          WHERE organization_id = $1 AND provider = 'smtp2go' AND status = 'connected' LIMIT 1
       ), 500) AS daily_limit,
       COALESCE((
         SELECT sent_count FROM public.email_usage_counters
          WHERE organization_id = $1 AND subaccount_id IS NULL AND period_date = CURRENT_DATE LIMIT 1
       ), 0) AS sent_count`,
    [input.organizationId],
  )
  const row = usage.rows[0]
  if (row && Number(row.sent_count) >= Number(row.daily_limit)) throw new EmailDeliveryPolicyError('daily_quota_exhausted')
  return { recipient, dailyLimit: Number(row?.daily_limit ?? 500), sentToday: Number(row?.sent_count ?? 0) }
}

export async function recordSuccessfulEmailSend(pool: Pick<pg.Pool, 'query'>, organizationId: string) {
  await pool.query(
    `INSERT INTO public.email_usage_counters (organization_id, subaccount_id, period_date, sent_count, failed_count)
     VALUES ($1, NULL, CURRENT_DATE, 1, 0)
     ON CONFLICT (organization_id, subaccount_id, period_date)
     DO UPDATE SET sent_count = public.email_usage_counters.sent_count + 1, updated_at = NOW()`,
    [organizationId],
  )
}
