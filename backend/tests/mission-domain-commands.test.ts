import { describe, expect, it } from 'vitest'
import { createPipelineDraft, validateFunnelDraft } from '../src/modules/crm/mission-commands.js'
import { publishEmailTemplateVersion, validateEmailTemplateDraft } from '../src/modules/emailTemplates/mission-commands.js'
import { buildAutomationRuntimeSnapshot, createAutomationFlowDraft, simulateSequenceDraft, validateSequenceDraft } from '../src/modules/automations/mission-commands.js'

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001', missionId: '00000000-0000-4000-8000-000000000002',
  actionRunId: '00000000-0000-4000-8000-000000000003', actorId: '00000000-0000-4000-8000-000000000004', idempotencyKey: 'command-1',
}

describe('Mission-safe revenue domain commands', () => {
  it('enforces funnel stage uniqueness and outcome invariants before persistence', () => {
    expect(() => validateFunnelDraft({ name: 'Funil', stages: [stage('lead'), stage('lead')] })).toThrow('pipeline_stage_key_invalid')
    expect(() => validateFunnelDraft({ name: 'Funil', stages: [stage('lead', true, true), stage('won')] })).toThrow('pipeline_stage_outcome_invalid')
    expect(() => validateFunnelDraft({ name: 'Funil', stages: [stage('won_a', true), stage('won_b', true)] })).toThrow('pipeline_stage_outcome_duplicate')
  })

  it('rejects ungrounded copy and invalid sequence order', () => {
    expect(() => validateEmailTemplateDraft({ name: 'E-mail', subject: 'Olá', bodyHtml: '<p>Oi</p>', bodyText: 'Oi', sourceIds: [], complianceNotes: [] })).toThrow('email_template_citations_required')
    expect(() => validateSequenceDraft({ name: 'Nutrição', steps: [{ templateVersionId: 'v1', delayMinutes: 0, exitConditions: [] }, { templateVersionId: 'v2', delayMinutes: 0, exitConditions: [] }] })).toThrow('sequence_step_invalid')
    expect(() => validateSequenceDraft({ name: 'Nutrição', steps: [{ templateVersionId: 'v1', delayMinutes: 0, exitConditions: [] }, { templateVersionId: 'v1', delayMinutes: 60, exitConditions: [] }] })).toThrow('sequence_template_version_duplicate')
  })

  it('reuses an existing command result without creating or activating another draft', async () => {
    const prior = { entityId: 'draft-1', versionId: 'draft-1', status: 'draft', contentHash: 'a'.repeat(64), evidence: { activated: false } }
    const db = new ScriptedDatabase([{ match: 'SELECT result FROM public.action_mission_command_results', rows: [{ result: prior }] }])
    const result = await createPipelineDraft(db as never, context, { name: 'Funil', stages: [stage('lead'), stage('won', true)] })
    expect(result).toEqual(prior)
    expect(db.sql).toHaveLength(1)
  })

  it('deduplicates automation draft commands before any flow or enrollment mutation', async () => {
    const prior = { entityId: 'flow-1', versionId: 'flow-version-1', status: 'draft', contentHash: 'd'.repeat(64), evidence: { activated: false, existingEnrollments: 0 } }
    const db = new ScriptedDatabase([{ match: 'SELECT result FROM public.action_mission_command_results', rows: [{ result: prior }] }])
    const result = await createAutomationFlowDraft(db as never, context, {
      name: 'Entrada', trigger: { type: 'lead.created' }, eligibilityConditions: [],
      sequenceVersionId: 'sequence-version-1', exitConditions: ['replied'],
      consentPolicy: 'require_granted', suppressionPolicy: 'check_before_enrollment', dailyRunLimit: 100,
    })
    expect(result).toEqual(prior)
    expect(db.sql).toHaveLength(1)
  })

  it('compiles the mission flow artifact into the executable runtime snapshot', () => {
    const snapshot = buildAutomationRuntimeSnapshot({
      name: 'Entrada', trigger: { type: 'lead.stage_changed', pipelineId: 'pipeline-1', stageId: 'stage-1' },
      eligibilityConditions: [{ field: 'lead.status', operator: 'equals', value: 'open' }],
      sequenceVersionId: 'sequence-version-1', exitConditions: ['replied'], consentPolicy: 'require_granted',
      suppressionPolicy: 'check_before_enrollment', dailyRunLimit: 100,
    }, 'sequence-1')
    expect(snapshot.triggers).toEqual([{ triggerType: 'lead.stage_changed', config: { pipelineId: 'pipeline-1', stageId: 'stage-1' } }])
    expect(snapshot.actions).toEqual([expect.objectContaining({
      actionType: 'enroll_sequence',
      payload: expect.objectContaining({ sequenceId: 'sequence-1', sequenceVersionId: 'sequence-version-1', requireEmailConsent: true, checkEmailSuppression: true }),
    })])
  })

  it('fails closed on stale hashes and reports a disabled provider without activation', async () => {
    const stale = new ScriptedDatabase([
      { match: 'SELECT result FROM public.action_mission_command_results', rows: [] },
      { match: 'SELECT id, content_hash FROM public.email_templates', rows: [{ id: 'template-1', content_hash: 'a'.repeat(64) }] },
    ])
    await expect(publishEmailTemplateVersion(stale as never, context, { templateId: 'template-1', expectedContentHash: 'b'.repeat(64) })).rejects.toThrow('email_template_hash_changed')

    const simulation = new ScriptedDatabase([{ match: 'SELECT sequence.id', rows: [{ id: 'sequence-1', content_hash: 'c'.repeat(64), step_count: 4, provider_ready: false }] }])
    const result = await simulateSequenceDraft(simulation as never, context, { sequenceId: 'sequence-1', expectedContentHash: 'c'.repeat(64) })
    expect(result.evidence).toMatchObject({ providerReady: false, existingEnrollments: 0, activationPerformed: false })
  })

  it('binds every lookup to the requested organization and mission', async () => {
    const simulation = new ScriptedDatabase([{ match: 'SELECT sequence.id', rows: [] }])
    await expect(simulateSequenceDraft(simulation as never, context, { sequenceId: 'sequence-1', expectedContentHash: 'c'.repeat(64) })).rejects.toThrow('sequence_draft_not_found')
    expect(simulation.params[0]).toEqual(['sequence-1', context.organizationId, context.missionId])
  })
})

function stage(key: string, isWon = false, isLost = false) { return { key, name: key, exitCriteria: ['Avançar'], isWon, isLost } }
class ScriptedDatabase {
  sql: string[] = []; params: unknown[][] = []
  constructor(private scripts: Array<{ match: string; rows: any[] }>) {}
  async query(sql: string, params: unknown[] = []) { this.sql.push(sql); this.params.push(params); const script = this.scripts.shift(); if (!script || !sql.includes(script.match)) throw new Error(`unexpected_query:${sql}`); return { rows: script.rows } }
}
