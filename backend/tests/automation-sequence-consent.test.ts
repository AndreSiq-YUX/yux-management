import { describe, expect, it } from 'vitest'
import { createDefaultAutomationCommandServices } from '../src/modules/automation/command-adapters.js'

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001', crmInstanceId: '00000000-0000-4000-8000-000000000002',
  leadId: '00000000-0000-4000-8000-000000000003', idempotencyKey: 'consent-test',
  correlationId: '00000000-0000-4000-8000-000000000004', causationId: '00000000-0000-4000-8000-000000000005',
  depth: 0, automationTrace: [], actor: { type: 'system' as const },
}
const sequenceId = '00000000-0000-4000-8000-000000000006'

describe('automation sequence consent boundary', () => {
  it('blocks enrollment when explicit e-mail permission is absent', async () => {
    const db = new ScriptedDb([
      [{ id: sequenceId }],
      [{ email: 'lead@example.com', consent_granted: false, suppressed: false }],
    ])
    const services = createDefaultAutomationCommandServices(db as never)
    await expect(services.enrollLeadInSequence(context, { sequenceId, requireEmailConsent: true, checkEmailSuppression: true })).rejects.toThrow('automation_sequence_consent_required')
    expect(db.sql.some((sql) => sql.includes('INSERT INTO public.crm_sequence_enrollments'))).toBe(false)
  })

  it('blocks suppressed addresses even when consent exists', async () => {
    const db = new ScriptedDb([
      [{ id: sequenceId }],
      [{ email: 'lead@example.com', consent_granted: true, suppressed: true }],
    ])
    const services = createDefaultAutomationCommandServices(db as never)
    await expect(services.enrollLeadInSequence(context, { sequenceId, requireEmailConsent: true, checkEmailSuppression: true })).rejects.toThrow('automation_sequence_email_suppressed')
    expect(db.sql.some((sql) => sql.includes('INSERT INTO public.crm_sequence_enrollments'))).toBe(false)
  })

  it('enrolls an eligible lead once the two policy checks pass', async () => {
    const enrollmentId = '00000000-0000-4000-8000-000000000007'
    const db = new ScriptedDb([
      [{ id: sequenceId }],
      [{ email: 'lead@example.com', consent_granted: true, suppressed: false }],
      [],
      [{ id: enrollmentId }],
    ])
    const services = createDefaultAutomationCommandServices(db as never)
    await expect(services.enrollLeadInSequence(context, { sequenceId, requireEmailConsent: true, checkEmailSuppression: true })).resolves.toMatchObject({ enrollmentId })
  })
})

class ScriptedDb {
  sql: string[] = []
  constructor(private readonly rows: Array<Array<Record<string, unknown>>>) {}
  async query<T>(sql: string) { this.sql.push(sql); return { rows: (this.rows.shift() ?? []) as T[] } }
}
