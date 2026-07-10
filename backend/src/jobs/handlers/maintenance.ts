import type pg from 'pg'

export async function purgeExpiredTraces(pool: Pick<pg.Pool, 'query'>) {
  const traces = await pool.query(
    `DELETE FROM public.agent_execution_runs run
     USING public.omnichannel_settings settings
     WHERE settings.organization_id = run.organization_id
       AND run.created_at < NOW() - make_interval(months => settings.retention_months)`,
  )
  const messages = await pool.query(
    `DELETE FROM public.messages message
     USING public.conversations conversation, public.omnichannel_settings settings
     WHERE conversation.id = message.conversation_id
       AND settings.organization_id = conversation.organization_id
       AND message.created_at < NOW() - make_interval(months => settings.retention_months)`,
  )
  return { tracesPurged: traces.rowCount ?? 0, messagesPurged: messages.rowCount ?? 0 }
}
