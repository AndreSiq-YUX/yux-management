import { describe, expect, it, vi } from 'vitest'
import { redactMissionTelemetry, redactMissionTelemetryForExport } from '../src/modules/action-engine/telemetry-redaction.js'

describe('Mission telemetry redaction', () => {
  it('allowlists structure, drops secrets and tokenizes PII stably per mission', () => {
    const payload = {
      missionId: 'mission-1', status: 'running', durationMs: 1200, authorization: 'Bearer secret',
      headers: { cookie: 'session=secret' }, email: 'ana@example.com', phone: '+5511999999999',
      cpf: '123.456.789-00', address: 'Rua A, 10', leadBody: 'Quero comprar o plano premium',
      arbitraryPrompt: 'should not leave',
    }
    const first = redactMissionTelemetry(payload, { missionId: 'mission-1', tokenKey: 'redaction-key-at-least-32-characters' })
    const second = redactMissionTelemetry(payload, { missionId: 'mission-1', tokenKey: 'redaction-key-at-least-32-characters' })
    expect(first).toEqual(second)
    expect(first).toMatchObject({ missionId: 'mission-1', status: 'running', durationMs: 1200 })
    expect(first.email).toMatch(/^pii_[a-f0-9]{16}$/)
    expect(JSON.stringify(first)).not.toMatch(/secret|ana@example|123\.456|Rua A|plano premium|arbitraryPrompt/)
  })

  it('fails closed and emits only a structured failure event', () => {
    const emit = vi.fn()
    const hostile = Object.defineProperty({}, 'missionId', { enumerable: true, get() { throw new Error('raw pii') } })
    expect(redactMissionTelemetryForExport(hostile, { missionId: 'mission-1', tokenKey: 'redaction-key-at-least-32-characters' }, emit)).toBeNull()
    expect(emit).toHaveBeenCalledWith({ eventType: 'mission.telemetry_redaction_failed', missionId: 'mission-1', errorCode: 'telemetry_redaction_failed' })
  })
})
