import { createHmac } from 'node:crypto'

const STRUCTURED_FIELDS = new Set([
  'missionId','correlationId','planId','planHash','capabilityKey','capabilityVersion',
  'capabilityDefinitionHash','status','durationMs','inputTokens','outputTokens','costBrl',
  'errorCode','attemptNumber','modelId','promptHash','contextHash','packVersion',
])
const PII_FIELDS = new Set(['email','phone','cpf','address','leadBody','contactName','leadName'])

export function redactMissionTelemetry(
  payload: unknown,
  context: { missionId: string; tokenKey: string },
): Record<string, unknown> {
  if (Buffer.byteLength(context.tokenKey) < 32) throw new Error('telemetry_redaction_key_invalid')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('telemetry_payload_invalid')
  const result: Record<string, unknown> = { missionId: context.missionId }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (PII_FIELDS.has(key)) {
      if (value !== null && value !== undefined) result[key] = token(context, String(value))
      continue
    }
    if (!STRUCTURED_FIELDS.has(key) || key === 'missionId') continue
    if (key === 'errorCode') {
      result[key] = String(value ?? 'unknown').slice(0, 120).replace(/[^a-zA-Z0-9_.:-]/g, '_')
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[key] = value
    }
  }
  return result
}

export function redactMissionTelemetryForExport(
  payload: unknown,
  context: { missionId: string; tokenKey: string },
  emit: (event: { eventType: string; missionId: string; errorCode: string }) => void,
): Record<string, unknown> | null {
  try {
    return redactMissionTelemetry(payload, context)
  } catch {
    emit({ eventType: 'mission.telemetry_redaction_failed', missionId: context.missionId, errorCode: 'telemetry_redaction_failed' })
    return null
  }
}

function token(context: { missionId: string; tokenKey: string }, value: string): string {
  return `pii_${createHmac('sha256', context.tokenKey).update(`${context.missionId}\u001f${value}`).digest('hex').slice(0, 16)}`
}
