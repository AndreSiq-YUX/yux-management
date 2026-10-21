import type pg from 'pg'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { ensureWhatsAppWabaSubscribed, inspectWhatsAppConnection, verifyWhatsAppSignupAssets } from '../../lib/whatsapp-graph.js'
import { upsertVerifiedWhatsAppConnection } from './whatsapp-connections.js'

export const whatsAppTestProvisionSchema = z.object({
  organizationId: z.string().uuid(), phoneNumberId: z.string().regex(/^\d{5,30}$/), wabaId: z.string().regex(/^\d{5,30}$/),
  accessToken: z.string().trim().min(20).max(4096),
})

export async function provisionWhatsAppTestNumber(pool: pg.Pool, env: AppEnv, userId: string, input: z.infer<typeof whatsAppTestProvisionSchema>) {
  if (env.META_WHATSAPP_TEST_ORGANIZATION_ID !== input.organizationId || env.META_WHATSAPP_TEST_PHONE_NUMBER_ID !== input.phoneNumberId) {
    throw new ApiError(403, 'whatsapp_test_provisioning_disabled')
  }
  const organization = await pool.query<{ kind: string }>('SELECT kind FROM public.organizations WHERE id=$1', [input.organizationId])
  if (organization.rows[0]?.kind !== 'yux') throw new ApiError(403, 'whatsapp_test_internal_organization_required')
  let health = await inspectWhatsAppConnection({ env, ...input })
  if (health.checks.subscription === 'failed' && health.checks.credential === 'passed' && health.checks.permissions === 'passed' && health.checks.phoneNumber === 'passed') {
    await ensureWhatsAppWabaSubscribed({ env, ...input, appId: env.META_APP_ID || '' })
    health = await inspectWhatsAppConnection({ env, ...input })
  }
  if (health.healthStatus !== 'connected') throw new ApiError(400, 'whatsapp_test_remote_verification_failed')
  const [phone] = await verifyWhatsAppSignupAssets({ env, ...input, phoneNumberIds: [input.phoneNumberId] })
  if (!phone) throw new ApiError(400, 'whatsapp_test_remote_verification_failed')
  return upsertVerifiedWhatsAppConnection(pool, {
    ...input, userId, displayPhoneNumber: phone.displayPhoneNumber, verifiedName: phone.verifiedName,
    expiresAt: health.expiresAt || null, responseModeOverride: 'manual',
  })
}
