import { describe, expect, it } from 'vitest'
import { assertEmailSendAllowed } from '../src/email/delivery-policy.js'

describe('server-side email delivery policy', () => {
  it('rejects a suppressed recipient before an SMTP request', async () => {
    const pool = { query: async (sql: string) => sql.includes('email_suppression_entries') ? { rows: [{ id: 'suppression-1' }] } : { rows: [] } }
    await expect(assertEmailSendAllowed(pool as never, { organizationId: 'org-1', recipient: 'blocked@example.com', category: 'transactional' })).rejects.toThrow('recipient_suppressed')
  })

  it('requires opt-in for marketing and enforces the daily quota', async () => {
    let calls = 0
    const pool = { query: async () => ({ rows: calls++ === 0 ? [] : [{ daily_limit: 5, sent_count: 5 }] }) }
    await expect(assertEmailSendAllowed(pool as never, { organizationId: 'org-1', recipient: 'allowed@example.com', category: 'marketing', recipientOptIn: true })).rejects.toThrow('daily_quota_exhausted')
    const optInPool = { query: async () => ({ rows: [] }) }
    await expect(assertEmailSendAllowed(optInPool as never, { organizationId: 'org-1', recipient: 'allowed@example.com', category: 'marketing' })).rejects.toThrow('recipient_not_opted_in')
  })
})
