import { describe, expect, it } from 'vitest'
import {
  canSendEmail,
  calculateRemainingDailyEmailQuota,
  isSmtp2goWebhookRetryable,
  sanitizeEmailForPortal,
} from './emailDeliveryRules'

describe('emailDeliveryRules', () => {
  it('blocks marketing email without opt-in', () => {
    expect(canSendEmail({
      emailKind: 'marketing',
      recipientOptIn: false,
      suppressed: false,
      dailyLimit: 100,
      sentToday: 0,
    })).toEqual({ ok: false, reason: 'recipient_not_opted_in' })
  })

  it('allows transactional email when quota is available', () => {
    expect(canSendEmail({
      emailKind: 'transactional',
      recipientOptIn: false,
      suppressed: false,
      dailyLimit: 100,
      sentToday: 99,
    })).toEqual({ ok: true })
  })

  it('blocks suppressed recipients and exhausted quota', () => {
    expect(canSendEmail({ emailKind: 'transactional', suppressed: true, dailyLimit: 10, sentToday: 0 })).toEqual({
      ok: false,
      reason: 'recipient_suppressed',
    })
    expect(canSendEmail({ emailKind: 'transactional', suppressed: false, dailyLimit: 10, sentToday: 10 })).toEqual({
      ok: false,
      reason: 'daily_quota_exhausted',
    })
  })

  it('calculates remaining daily quota', () => {
    expect(calculateRemainingDailyEmailQuota({ dailyLimit: 100, sentToday: 30 })).toBe(70)
  })

  it('treats rejects and unsubscribes as non-retryable webhook outcomes', () => {
    expect(isSmtp2goWebhookRetryable('reject')).toBe(false)
    expect(isSmtp2goWebhookRetryable('unsubscribe')).toBe(false)
    expect(isSmtp2goWebhookRetryable('temporary_failure')).toBe(true)
  })

  it('redacts provider references from portal email data', () => {
    expect(sanitizeEmailForPortal({ providerMessageId: 'smtp2go-1', tokenReference: 'secret', subject: 'Fatura' })).toEqual({
      subject: 'Fatura',
    })
  })
})
