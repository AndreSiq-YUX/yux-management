import type { Queryable } from './repository.js'

export type MissionRetentionKind = 'encrypted_reconciliation_body' | 'redacted_model_trace' | 'audit_manifest'
export type MissionRetentionRecord = { id: string; kind: MissionRetentionKind; createdAt: string; legalHold: boolean }

const RETENTION_DAYS: Record<MissionRetentionKind, number> = {
  encrypted_reconciliation_body: 30,
  redacted_model_trace: 90,
  audit_manifest: 730,
}

export function selectMissionRetentionCandidates(records: MissionRetentionRecord[], now = new Date()): MissionRetentionRecord[] {
  return records.filter((record) => {
    if (record.legalHold) return false
    const createdAt = Date.parse(record.createdAt)
    if (!Number.isFinite(createdAt)) throw new Error('retention_record_time_invalid')
    return createdAt < now.getTime() - RETENTION_DAYS[record.kind] * 86_400_000
  })
}

export async function enforceMissionRetention(client: Queryable, now = new Date()): Promise<{
  telemetryPurged: number; reconciliationBodiesScrubbed: number
}> {
  const scrubbed = await client.query(
    `UPDATE public.action_external_effects effect
     SET request_metadata = request_metadata - 'encryptedBody' - 'requestBody',
         outcome_evidence = outcome_evidence - 'encryptedBody' - 'responseBody', updated_at = NOW()
     WHERE effect.created_at < $1::TIMESTAMPTZ - INTERVAL '30 days'
       AND (request_metadata ?| ARRAY['encryptedBody','requestBody']
         OR outcome_evidence ?| ARRAY['encryptedBody','responseBody'])
       AND NOT EXISTS (
         SELECT 1 FROM public.action_mission_telemetry hold
         WHERE hold.mission_id = effect.mission_id AND hold.legal_hold = TRUE
       )`,
    [now.toISOString()],
  )
  const purged = await client.query(
    `DELETE FROM public.action_mission_telemetry
     WHERE legal_hold = FALSE AND (
       (artifact_kind = 'encrypted_reconciliation_body' AND created_at < $1::TIMESTAMPTZ - INTERVAL '30 days') OR
       (artifact_kind = 'redacted_model_trace' AND created_at < $1::TIMESTAMPTZ - INTERVAL '90 days') OR
       (artifact_kind = 'audit_manifest' AND created_at < $1::TIMESTAMPTZ - INTERVAL '24 months')
     )`,
    [now.toISOString()],
  )
  return { telemetryPurged: purged.rowCount ?? 0, reconciliationBodiesScrubbed: scrubbed.rowCount ?? 0 }
}
