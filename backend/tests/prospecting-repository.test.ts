import { describe, expect, it } from 'vitest'
import {
  normalizeChannelAddress,
  resolveProspectingEligibility,
} from '../src/modules/prospecting/repository.js'
import type { Queryable } from '../src/modules/prospecting/repository.js'

type Row = Record<string, unknown>

function fakePool(overrides: {
  policy?: Row
  permission?: Row
  connection?: Row
  optedOut?: boolean
  dailyCount?: number
  attemptCount?: number
}): Queryable {
  return {
    async query<T = Row>(sql: string) {
      if (sql.includes('FROM public.prospecting_policies')) return { rows: (overrides.policy ? [overrides.policy] : []) as T[] }
      if (sql.includes('FROM public.lead_channel_permissions')) return { rows: (overrides.permission ? [overrides.permission] : []) as T[] }
      if (sql.includes('FROM public.channel_connections')) return { rows: (overrides.connection ? [overrides.connection] : []) as T[] }
      if (sql.includes('FROM public.radar_compliance_logs')) return { rows: (overrides.optedOut ? [{ blocked: true }] : []) as T[] }
      if (sql.includes('AS daily_count')) return { rows: [{ daily_count: overrides.dailyCount ?? 0 }] as T[] }
      if (sql.includes('AS attempt_count')) return { rows: [{ attempt_count: overrides.attemptCount ?? 0 }] as T[] }
      throw new Error(`unexpected query: ${sql}`)
    },
  }
}

const activePolicy = {
  id: 'policy-1',
  organization_id: 'org-1',
  crm_instance_id: 'crm-1',
  default_sequence_id: 'sequence-1',
  whatsapp_connection_id: 'connection-1',
  enabled: true,
  kill_switch: false,
  require_human_first_contact: true,
  require_whatsapp_permission: true,
  require_template_outside_window: true,
  daily_limit: 20,
  max_attempts_per_lead: 5,
  quiet_hours: { timezone: 'America/Sao_Paulo', start: '20:00', end: '08:00' },
  policy_version: '1.0',
  legal_reviewed_at: '2026-08-01T12:00:00.000Z',
  legal_reviewed_by: 'user-1',
}

describe('prospecting policy repository', () => {
  it('normalizes e-mail and Brazilian phone addresses', () => {
    expect(normalizeChannelAddress('email', '  Comercial@Empresa.COM ')).toBe('comercial@empresa.com')
    expect(normalizeChannelAddress('whatsapp', '(11) 99999-9999')).toBe('5511999999999')
  })

  it('blocks WhatsApp before the provider when permission is missing', async () => {
    const result = await resolveProspectingEligibility(fakePool({ policy: activePolicy, connection: { id: 'connection-1' } }), {
      organizationId: 'org-1',
      leadId: 'lead-1',
      opportunityId: 'opportunity-1',
      channel: 'whatsapp',
      address: '(11) 99999-9999',
      now: new Date('2026-08-04T15:00:00.000Z'),
    })

    expect(result.allowed).toBe(false)
    expect(result.blockedReasons).toContain('channel_permission_required')
  })

  it('allows a governed WhatsApp plan when every server-side guard passes', async () => {
    const result = await resolveProspectingEligibility(fakePool({
      policy: activePolicy,
      permission: { status: 'granted' },
      connection: { id: 'connection-1' },
    }), {
      organizationId: 'org-1',
      leadId: 'lead-1',
      opportunityId: 'opportunity-1',
      channel: 'whatsapp',
      address: '+55 11 99999-9999',
      now: new Date('2026-08-04T15:00:00.000Z'),
    })

    expect(result.allowed).toBe(true)
    expect(result.blockedReasons).toEqual([])
    expect(result.policy.policyVersion).toBe('1.0')
  })

  it('lets opt-out and the kill switch override an otherwise valid permission', async () => {
    const [optedOut, killed] = await Promise.all([
      resolveProspectingEligibility(fakePool({
        policy: activePolicy,
        permission: { status: 'granted' },
        connection: { id: 'connection-1' },
        optedOut: true,
      }), {
        organizationId: 'org-1', leadId: 'lead-1', opportunityId: 'opportunity-1',
        channel: 'whatsapp', address: '11999999999', now: new Date('2026-08-04T15:00:00.000Z'),
      }),
      resolveProspectingEligibility(fakePool({ policy: { ...activePolicy, kill_switch: true } }), {
        organizationId: 'org-1', leadId: 'lead-1', channel: 'task', now: new Date('2026-08-04T15:00:00.000Z'),
      }),
    ])

    expect(optedOut.blockedReasons).toContain('prospect_opted_out')
    expect(killed.blockedReasons).toContain('prospecting_kill_switch_active')
  })
})
