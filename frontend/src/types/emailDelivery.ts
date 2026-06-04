export type EmailKind = 'transactional' | 'marketing' | 'operational'
export type EmailSendStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'rejected' | 'suppressed'
export type EmailSuppressionReason = 'bounce' | 'spam' | 'unsubscribe' | 'manual' | 'provider_reject'
export type Smtp2goWebhookEventType =
  | 'processed'
  | 'delivered'
  | 'open'
  | 'click'
  | 'bounce'
  | 'spam'
  | 'unsubscribe'
  | 'resubscribe'
  | 'reject'
  | 'temporary_failure'

export interface EmailSendEligibilityInput {
  emailKind: EmailKind
  recipientOptIn?: boolean
  suppressed: boolean
  dailyLimit: number
  sentToday: number
}

export interface EmailSendEligibility {
  ok: boolean
  reason?: 'recipient_not_opted_in' | 'recipient_suppressed' | 'daily_quota_exhausted'
}

export interface EmailProviderConnection {
  id: string
  organizationId: string
  provider: 'smtp2go'
  status: 'connected' | 'stale' | 'needs_setup' | 'failed'
  defaultFromEmail?: string
  defaultFromName?: string
  dailySendLimit: number
  lastVerifiedAt?: string
}
