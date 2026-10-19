import type pg from 'pg'
import {reconcileRadarCaptureOutbox as dispatchRadarOutbox} from '../../modules/radar/capture-dispatch.js'
import {runRadarResearchWatchdog} from '../../modules/radar/stalled-research.js'
export async function reconcileRadarCaptureOutbox(pool:pg.Pool,queue:Parameters<typeof dispatchRadarOutbox>[1],window:number){
 let result:Awaited<ReturnType<typeof dispatchRadarOutbox>>|undefined,deliveryFailure:unknown,deliveryFailed=false
 try{result=await dispatchRadarOutbox(pool,queue,window)}catch(cause){deliveryFailure=cause;deliveryFailed=true}
 // Still diagnose when queue delivery failed; the watchdog never enqueues or
 // repeats provider effects. Existing outbox delivery retains its stable IDs.
 await runRadarResearchWatchdog(pool,deliveryFailed?false:undefined)
 if(deliveryFailed)throw deliveryFailure
 return result!
}

export async function purgeExpiredTraces(pool: Pick<pg.Pool, 'query'>) {
  // agent_execution_steps, agent_context_snapshots, agent_verification_results
  // and strategy_subagent_runs reference agent_execution_runs with ON DELETE
  // CASCADE, but we delete them explicitly so retention does not silently
  // depend on FK configuration of the deployed database.
  const dependentTables = ['agent_execution_steps', 'agent_context_snapshots', 'agent_verification_results', 'strategy_subagent_runs']
  const dependentCounts: Record<string, number> = {}
  for (const table of dependentTables) {
    const result = await pool.query(
      `DELETE FROM public.${table} record
       USING public.agent_execution_runs run, public.omnichannel_settings settings
       WHERE record.run_id = run.id
         AND settings.organization_id = run.organization_id
         AND run.created_at < NOW() - make_interval(months => settings.retention_months)`,
    )
    dependentCounts[table] = result.rowCount ?? 0
  }

  const traces = await pool.query(
    `DELETE FROM public.agent_execution_runs run
     USING public.omnichannel_settings settings
     WHERE settings.organization_id = run.organization_id
       AND run.created_at < NOW() - make_interval(months => settings.retention_months)`,
  )
  // agent_events keep the raw inbound payload (message text, phone numbers);
  // they must follow the same retention window as the traces.
  const events = await pool.query(
    `DELETE FROM public.agent_events event
     USING public.omnichannel_settings settings
     WHERE settings.organization_id = event.organization_id
       AND event.created_at < NOW() - make_interval(months => settings.retention_months)`,
  )
  const messages = await pool.query(
    `DELETE FROM public.messages message
     USING public.conversations conversation, public.omnichannel_settings settings
     WHERE conversation.id = message.conversation_id
       AND settings.organization_id = conversation.organization_id
       AND message.created_at < NOW() - make_interval(months => settings.retention_months)`,
  )
  return {
    tracesPurged: traces.rowCount ?? 0,
    eventsPurged: events.rowCount ?? 0,
    messagesPurged: messages.rowCount ?? 0,
    ...dependentCounts,
  }
}
