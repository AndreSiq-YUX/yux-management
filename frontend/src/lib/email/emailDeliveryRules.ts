import type { EmailSendEligibility, EmailSendEligibilityInput, Smtp2goWebhookEventType } from '@/types/emailDelivery'

export function canSendEmail(input: EmailSendEligibilityInput): EmailSendEligibility {
  if (input.suppressed) return { ok: false, reason: 'recipient_suppressed' }
  if (input.sentToday >= input.dailyLimit) return { ok: false, reason: 'daily_quota_exhausted' }
  if (input.emailKind === 'marketing' && !input.recipientOptIn) return { ok: false, reason: 'recipient_not_opted_in' }
  return { ok: true }
}

export function calculateRemainingDailyEmailQuota(input: { dailyLimit: number; sentToday: number }) {
  return Math.max(0, input.dailyLimit - input.sentToday)
}

export function isSmtp2goWebhookRetryable(eventType: Smtp2goWebhookEventType | string) {
  return eventType === 'temporary_failure'
}

export function sanitizeEmailForPortal<T extends Record<string, unknown>>(input: T) {
  const {
    providerMessageId: _providerMessageId,
    tokenReference: _tokenReference,
    protectedError: _protectedError,
    providerPayload: _providerPayload,
    ...safe
  } = input

  return safe
}
