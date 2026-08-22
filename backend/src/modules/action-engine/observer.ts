import type { DomainEventEnvelope } from '../events/types.js'
import { recordObservation, type Queryable } from './repository.js'

export async function observeDomainEvent(client: Queryable, event: DomainEventEnvelope): Promise<{ observed: number }> {
  const missionIds = new Set<string>()
  if (event.aggregateType === 'mission') missionIds.add(event.aggregateId)
  const explicitMissionId = typeof event.payload.missionId === 'string' ? event.payload.missionId : undefined
  if (explicitMissionId) missionIds.add(explicitMissionId)
  if (event.leadId) {
    const entities = await client.query<{ mission_id: string }>(
      `SELECT entity.mission_id FROM public.action_mission_entities entity
       JOIN public.action_missions mission ON mission.id = entity.mission_id
       WHERE entity.organization_id = $1 AND entity.entity_type = 'lead' AND entity.entity_id = $2
         AND entity.active = TRUE AND mission.status IN ('active','paused','blocked','evaluating','pending_replan_approval')
         AND $3::TIMESTAMPTZ >= COALESCE(mission.started_at, mission.created_at)
         AND $3::TIMESTAMPTZ <= COALESCE(mission.ended_at, mission.deadline_at, 'infinity'::TIMESTAMPTZ)`,
      [event.organizationId, event.leadId, event.occurredAt],
    )
    for (const row of entities.rows) missionIds.add(row.mission_id)
  }

  let observed = 0
  for (const missionId of missionIds) {
    const mission = await client.query<{ id: string }>(
      `SELECT id FROM public.action_missions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [missionId, event.organizationId],
    )
    if (!mission.rows[0]) continue
    await recordObservation(client, {
      organizationId: event.organizationId, missionId, observationType: mapObservationType(event.eventType),
      idempotencyKey: `${missionId}:${event.eventId}`, sourceType: 'domain_event', sourceRecordId: event.aggregateId,
      sourceEventId: event.eventId, correlationId: event.correlationId,
      payload: { eventType: event.eventType, leadId: event.leadId, ...event.payload }, observedAt: event.occurredAt,
    })
    observed += 1
  }
  return { observed }
}

function mapObservationType(eventType: string): string {
  const mapping: Record<string, string> = {
    'email.sent': 'external_message_sent', 'email.delivered': 'external_message_delivered',
    'email.opened': 'message_opened', 'email.clicked': 'positive_response',
    'email.unsubscribed': 'unsubscribe', 'email.complained': 'complaint',
    'lead.task_completed': 'human_task_completed', 'lead.stage_changed': 'pipeline_progress',
  }
  return mapping[eventType] ?? eventType.replaceAll('.', '_')
}
