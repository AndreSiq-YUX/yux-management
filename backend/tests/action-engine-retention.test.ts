import { describe, expect, it } from 'vitest'
import { selectMissionRetentionCandidates } from '../src/modules/action-engine/retention.js'

describe('Mission retention', () => {
  it('applies 30/90-day limits, preserves 24-month manifests and every legal hold', () => {
    const now = new Date('2026-08-22T12:00:00.000Z')
    const records = [
      { id: 'effect-old', kind: 'encrypted_reconciliation_body' as const, createdAt: '2026-07-01T00:00:00Z', legalHold: false },
      { id: 'effect-new', kind: 'encrypted_reconciliation_body' as const, createdAt: '2026-08-10T00:00:00Z', legalHold: false },
      { id: 'trace-old', kind: 'redacted_model_trace' as const, createdAt: '2026-04-01T00:00:00Z', legalHold: false },
      { id: 'audit-young', kind: 'audit_manifest' as const, createdAt: '2025-01-01T00:00:00Z', legalHold: false },
      { id: 'audit-old', kind: 'audit_manifest' as const, createdAt: '2023-01-01T00:00:00Z', legalHold: false },
      { id: 'held', kind: 'redacted_model_trace' as const, createdAt: '2020-01-01T00:00:00Z', legalHold: true },
    ]
    expect(selectMissionRetentionCandidates(records, now).map((item) => item.id)).toEqual(['effect-old','trace-old','audit-old'])
  })
})
