import type pg from 'pg'

export async function recordDeliveryEvent(
  client: Pick<pg.PoolClient, 'query'>,
  event: {
    projectId: string
    type: 'deliverable_created' | 'approval_requested' | 'status_changed'
    title: string
    body?: string | null
    referenceKey: 'deliverable_id' | 'approval_request_id'
    referenceId: string
    visible: boolean
    actorId: string
  }
) {
  // Legacy installations may still have real timeline triggers; avoid duplicating their event.
  await client.query(
    `INSERT INTO public.project_timeline_entries
    (project_id, entry_type, title, body, metadata, origin, is_client_visible, created_by)
    SELECT $1, $2, $3, $4, $5::jsonb, 'automatic', $6, $7
    WHERE $2 = 'status_changed' OR NOT EXISTS (
      SELECT 1 FROM public.project_timeline_entries
      WHERE project_id = $1 AND entry_type = $2 AND metadata ->> $8 = $9
    )`,
    [
      event.projectId,
      event.type,
      event.title,
      event.body || null,
      JSON.stringify({ [event.referenceKey]: event.referenceId }),
      event.visible,
      event.actorId,
      event.referenceKey,
      event.referenceId,
    ]
  )
}
