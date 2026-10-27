import type { PackMetricCollector } from './collector.js'

export const crmPreparationMetricCollector: PackMetricCollector = {
  packKey: 'crm_preparation',
  async collect(client, mission) {
    const row = (await client.query<Record<string, number | string>>(
      `WITH runs AS (
         SELECT run.id,run.status,step.capability_key FROM public.action_runs run
         JOIN public.action_plan_steps step ON step.id=run.plan_step_id
         JOIN public.action_missions mission ON mission.id=run.mission_id AND mission.active_plan_id=run.plan_id
         WHERE run.organization_id=$1 AND run.mission_id=$2
       ), drafts AS (
         SELECT version.id,version.action_run_id,version.content_hash FROM public.crm_pipeline_versions version
         JOIN public.crm_instances instance ON instance.id=version.crm_instance_id
         WHERE instance.organization_id=$1 AND version.mission_id=$2 AND version.status='draft'
         UNION ALL
         SELECT version.id,template.action_run_id,version.content_hash FROM public.email_template_versions version
         JOIN public.email_templates template ON template.id=version.template_id
         WHERE template.organization_id=$1 AND template.mission_id=$2 AND template.status='draft' AND version.published_by IS NULL
         UNION ALL
         SELECT version.id,version.action_run_id,version.content_hash FROM public.crm_sequence_versions version
         JOIN public.crm_sequences sequence ON sequence.id=version.sequence_id AND sequence.organization_id=$1
         WHERE version.organization_id=$1 AND version.mission_id=$2 AND version.status='draft' AND sequence.is_active=FALSE
       ) SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='succeeded')::int AS succeeded,
         COUNT(*) FILTER(WHERE status IN('failed','blocked','cancelled','skipped'))::int AS failed,
         COUNT(*) FILTER(WHERE capability_key NOT IN('system.readiness.check','crm.pipeline.inspect','crm.pipeline.simulate',
           'crm.pipeline.create_draft','email.template.create_draft','crm.sequence.create_draft'))::int AS unsafe,
         (SELECT COUNT(DISTINCT draft.id)::int FROM drafts draft JOIN runs run ON run.id=draft.action_run_id AND run.status='succeeded'
          JOIN public.action_mission_command_results result ON result.action_run_id=run.id AND result.organization_id=$1 AND result.mission_id=$2
            AND result.result->>'versionId'=draft.id::text AND result.result->>'contentHash'=draft.content_hash
            AND result.result->>'status'='draft') AS persisted FROM runs`,
      [mission.organizationId, mission.id],
    )).rows[0] ?? {}
    const count = (key: string) => Number(row[key] ?? 0)
    const known = (value: number) => ({ kind: 'known' as const, value: String(value) as `${number}`, unit: 'count' })
    return { packKey: 'crm_preparation', measuredAt: new Date().toISOString(),
      metrics: { persisted_draft_count: known(count('persisted')), completed_action_count: known(count('succeeded')),
        total_action_count: known(count('total')), failed_action_count: known(count('failed')), unsafe_action_count: known(count('unsafe')) },
      evidence: { persisted_draft_count: { sourceType: 'persisted_mission_drafts' } },
      signals: { criticalGuardrailBreached: count('unsafe') > 0 || mission.mode !== 'prepare', killSwitchActive: false,
        minimumSampleReached: count('total') === 8 && count('succeeded') === 8,
        offTrack: false, requiredMetricUnknownIsBlocking: false, reasons: [] } }
  },
  evaluate({ mission, snapshot, now }) {
    const count = (key: string) => { const metric = snapshot.metrics[key]; return metric?.kind === 'known' ? Number(metric.value) : 0 }
    if (snapshot.signals.criticalGuardrailBreached || count('failed_action_count') > 0) return { conclusion: 'block', reasons: ['crm_preparation_requires_review'] }
    if (count('total_action_count') === 8 && count('completed_action_count') === 8 && count('persisted_draft_count') === 5) return { conclusion: 'succeed', reasons: ['crm_drafts_persisted_for_review'] }
    if (mission.deadlineAt && Date.parse(mission.deadlineAt) < Date.parse(now)) return { conclusion: 'expire', reasons: ['deadline_passed'] }
    return { conclusion: 'continue', reasons: ['crm_preparation_pending'] }
  },
}
