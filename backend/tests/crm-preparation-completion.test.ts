import { expect, it } from 'vitest'
import { crmPreparationMetricCollector } from '../src/modules/action-engine/metrics/crm-preparation.js'
import { publishSequenceDraft } from '../src/modules/automations/mission-commands.js'

it('requires five persisted drafts and all eight successful actions before completion', async () => {
  const mission = { id: 'mission-a', organizationId: 'org-a', mode: 'prepare' } as never
  for (const row of [{ total: 8, succeeded: 8, persisted: 5, unsafe: 0 },
    { total: 8, succeeded: 7, persisted: 5, unsafe: 0 }, { total: 8, succeeded: 8, persisted: 4, unsafe: 0 },
    { total: 8, succeeded: 8, persisted: 5, unsafe: 1 }]) {
    const pool = { async query(_sql: string, params: unknown[]) { expect(params).toEqual(['org-a', 'mission-a']); return { rows: [row] } } }
    const snapshot = await crmPreparationMetricCollector.collect(pool as never, mission)
    const decision = crmPreparationMetricCollector.evaluate({ mission, snapshot, economics: {} as never, now: new Date().toISOString() })
    expect(decision.conclusion).toBe(row.unsafe ? 'block' : row.succeeded === 8 && row.persisted === 5 ? 'succeed' : 'continue')
  }
})

it('does not activate a draft sequence while any referenced template is unpublished, even with a sender connected', async () => {
  const writes: string[] = []
  const db = { async query(sql: string) {
    if (sql.includes('FROM public.action_mission_command_results')) return {rows:[]}
    if (sql.includes('SELECT sequence.id')) return {rows:[{id:'sequence',content_hash:'a'.repeat(64)}]}
    if (sql.includes('email_provider_connections')) return {rows:[{ready:true}]}
    if (sql.includes('BOOL_AND')) return {rows:[{ready:false}]}
    writes.push(sql); return {rows:[]}
  } }
  await expect(publishSequenceDraft(db as never, {organizationId:'org',missionId:'mission',actionRunId:'run',actorId:'actor',idempotencyKey:'publish'},
    {sequenceId:'sequence',versionId:'version',expectedContentHash:'a'.repeat(64)})).rejects.toThrow('sequence_templates_not_published')
  expect(writes).toEqual([])
})
