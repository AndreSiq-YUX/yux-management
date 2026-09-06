import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { writeKnowledgeFile } from '../../src/modules/company-intelligence/file-storage.js'
import {
  applyReconciliationManifest,
  buildReconciliationManifest,
  verifyReconciliationManifest,
  type FailedQueueJob,
  type ReconciliationQueueAccess,
} from '../../src/modules/reconciliation/state-reconciliation.js'
import { fixtureIds, fixtureUsers } from './support/fixtures.js'
import { createIntegrationRig, getIntegrationDatabaseUrl } from './support/rig.js'

it('classifica, aplica em lote pequeno e repete o mesmo manifesto sem duplicar efeitos', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 4 })
  const previousStorage = process.env.KNOWLEDGE_STORAGE_DIR
  process.env.KNOWLEDGE_STORAGE_DIR = rig.storageRoot
  const queue = new FakeReconciliationQueue()
  try {
    const ids = await seedHistoricalState(pool)
    const manifest = await buildReconciliationManifest(pool, {
      limit: 20, cutoffAt: new Date('2020-01-02T00:00:00.000Z'), now: new Date('2020-01-03T00:00:00.000Z'), queue,
    })

    expect(manifest.items.map(item => [item.entityId,item.proposedAction])).toEqual(expect.arrayContaining([
      [ids.ingestionId,'request_reupload'],
      [ids.racedIngestionId,'request_reupload'],
      [ids.knowledgeRunId,'resume_knowledge_indexing'],
      [ids.agentRunId,'preserve_failed_agent_run'],
      [ids.conversationId,'await_user_decision'],
      [ids.missionId,'preserve_cancelled_mission'],
      ['failed-learning-1','retry_learning_job'],
    ]))
    expect(manifest.items.every(item => !JSON.stringify(item.currentState).includes('conteudo sigiloso'))).toBe(true)
    expect(verifyReconciliationManifest(manifest).manifestHash).toBe(manifest.manifestHash)
    const tampered = structuredClone(manifest)
    tampered.items[0]!.reason = 'changed'
    expect(() => verifyReconciliationManifest(tampered)).toThrow('reconciliation_manifest_item_hash_mismatch')

    await pool.query(`UPDATE public.yux_strategy_ingestion_jobs SET status='awaiting_upload' WHERE id=$1`, [ids.racedIngestionId])
    const first = await applyReconciliationManifest(pool, manifest, {
      approvedHash: manifest.manifestHash, limit: 20, queue, appliedBy: 'integration-operator',
    })
    expect(first.status).toBe('applied')
    expect(first.results.find(item => item.id === `strategy_ingestion:${ids.racedIngestionId}`)).toMatchObject({
      status: 'skipped', result: { reason: 'state_or_version_changed' },
    })
    expect(first.results.find(item => item.id === `strategy_ingestion:${ids.ingestionId}`)).toMatchObject({
      status: 'applied', result: { destination: 'awaiting_reupload', originIngestionId: ids.ingestionId },
    })

    const ingestion = (await pool.query(
      `SELECT status,failure_class,error_message,metadata FROM public.yux_strategy_ingestion_jobs WHERE id=$1`, [ids.ingestionId],
    )).rows[0]
    expect(ingestion).toMatchObject({
      status: 'failed', failure_class: 'recoverable', error_message: 'reconciliation_reupload_required',
      metadata: { reconciliationOriginIngestionId: ids.ingestionId, reconciliationManifestHash: manifest.manifestHash },
    })
    expect((await pool.query(`SELECT status FROM public.knowledge_intelligence_runs WHERE id=$1`, [ids.knowledgeRunId])).rows[0]?.status).toBe('cancelled')
    expect((await pool.query(`SELECT status FROM public.agent_execution_runs WHERE id=$1`, [ids.agentRunId])).rows[0]?.status).toBe('failed')
    expect((await pool.query(`SELECT status FROM public.action_mission_conversations WHERE id=$1`, [ids.conversationId])).rows[0]?.status).toBe('awaiting_user')
    expect((await pool.query(`SELECT status FROM public.action_missions WHERE id=$1`, [ids.missionId])).rows[0]?.status).toBe('cancelled')
    expect(queue.enqueued.map(job => job.name)).toEqual(['company-intelligence.indexKnowledge','action-engine.generateLearning'])

    const audit = await pool.query(
      `SELECT entity_type,entity_id,status,result FROM public.state_reconciliation_items
        WHERE manifest_hash=$1 ORDER BY entity_type,entity_id`, [manifest.manifestHash],
    )
    expect(audit.rows).toHaveLength(manifest.items.length)
    expect(audit.rows.every(row => row.result.destination || row.result.reason)).toBe(true)

    const repeated = await applyReconciliationManifest(pool, manifest, {
      approvedHash: manifest.manifestHash, limit: 20, queue, appliedBy: 'integration-operator',
    })
    expect(repeated).toMatchObject({ status: 'applied', handled: 0 })
    expect(queue.enqueued).toHaveLength(2)
    await expect(applyReconciliationManifest(pool, manifest, {
      approvedHash: '0'.repeat(64), limit: 20, queue,
    })).rejects.toThrow('reconciliation_manifest_not_approved')
  } finally {
    if (previousStorage === undefined) delete process.env.KNOWLEDGE_STORAGE_DIR
    else process.env.KNOWLEDGE_STORAGE_DIR = previousStorage
    await pool.end()
    await rig.close()
  }
})

class FakeReconciliationQueue implements ReconciliationQueueAccess {
  readonly failed: FailedQueueJob[] = [{
    queueName: 'legacy/yux-jobs', queueClass: 'legacy', id: 'failed-learning-1',
    name: 'action-engine.generateLearning', data: { limit: 50, window: '2019-01-01' }, attemptsMade: 3, finishedOn: 1546300800000,
  }]
  readonly enqueued: Array<{ name: string; data: Record<string, unknown>; jobId: string }> = []

  async scanFailed(limit: number) { return this.failed.slice(0, limit) }
  async getFailed(queueName: string, id: string) {
    return this.failed.find(job => job.queueName === queueName && job.id === id) ?? null
  }
  async enqueue(name: string, data: Record<string, unknown>, jobId: string) {
    if (!this.enqueued.some(job => job.jobId === jobId)) this.enqueued.push({ name, data, jobId })
    return { id: jobId }
  }
}

async function seedHistoricalState(pool: pg.Pool) {
  const ingestionId = randomUUID()
  const racedIngestionId = randomUUID()
  await pool.query(
    `INSERT INTO public.yux_strategy_ingestion_jobs
       (id,organization_id,source_name,source_kind,file_name,status,current_step,metadata,created_at,updated_at)
     VALUES ($1,$3,'PDF histórico','document','historico.pdf','uploaded','upload','{}',TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01'),
            ($2,$3,'PDF concorrente','document','concorrente.pdf','uploaded','upload','{}',TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01')`,
    [ingestionId,racedIngestionId,fixtureIds.organizationA],
  )

  const sourceId = randomUUID()
  const documentId = randomUUID()
  const knowledgeRunId = randomUUID()
  const stored = await writeKnowledgeFile({
    organizationId: fixtureIds.organizationA, documentId, fileName: 'origem.txt', mimeType: 'text/plain',
    content: Buffer.from('conteudo sigiloso existente e integro', 'utf8'),
  })
  await pool.query(
    `INSERT INTO public.knowledge_sources
       (id,organization_id,source_type,name,storage_path,status,visibility,mime_type,byte_size,checksum_sha256,metadata,created_at,updated_at)
     VALUES ($1,$2,'file',$3,$4,'draft','both','text/plain',$5,$6,'{}',TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01')`,
    [sourceId,fixtureIds.organizationA,`Fonte ${sourceId}`,stored.relativePath,stored.byteSize,stored.checksumSha256],
  )
  await pool.query(
    `INSERT INTO public.marketing_knowledge_documents
       (id,organization_id,client_id,contract_id,source_id,title,document_type,status,storage_path,metadata,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,'Documento histórico','other','indexing',$6,'{}',TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01')`,
    [documentId,fixtureIds.organizationA,fixtureIds.clientA,fixtureIds.contractA,sourceId,stored.relativePath],
  )
  await pool.query(
    `INSERT INTO public.knowledge_intelligence_runs
       (id,organization_id,client_id,contract_id,source_id,document_id,run_kind,status,stage,progress,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'document_curation','queued','queued',0,TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01')`,
    [knowledgeRunId,fixtureIds.organizationA,fixtureIds.clientA,fixtureIds.contractA,sourceId,documentId],
  )

  const missionId = randomUUID()
  await pool.query(
    `INSERT INTO public.action_missions
       (id,organization_id,contract_id,pack_version_id,title,objective,status,mode,create_idempotency_key,created_by,ended_at,created_at,updated_at)
     VALUES ($1,$2,$3,'71000000-0000-4000-8000-000000000001','Missão cancelada','Preservar cancelamento','cancelled','assisted',$4,$5,TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01')`,
    [missionId,fixtureIds.organizationA,fixtureIds.contractA,`reconciliation-${missionId}`,fixtureUsers.yux_admin.id],
  )
  const conversationId = randomUUID()
  await pool.query(
    `INSERT INTO public.action_mission_conversations
       (id,organization_id,contract_id,mission_id,status,title,create_idempotency_key,version,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'awaiting_user','Conversa aguardando usuário',$5,2,$6,TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01')`,
    [conversationId,fixtureIds.organizationA,fixtureIds.contractA,missionId,`reconciliation-conversation-${conversationId}`,fixtureUsers.yux_admin.id],
  )
  const agentRunId = randomUUID()
  await pool.query(
    `INSERT INTO public.agent_execution_runs
       (id,organization_id,contract_id,run_source,profile_key,workflow_key,status,error_message,created_at,updated_at)
     VALUES ($1,$2,$3,'runtime','growth_strategist','historical','failed','erro histórico preservado',TIMESTAMPTZ '2019-01-01',TIMESTAMPTZ '2019-01-01')`,
    [agentRunId,fixtureIds.organizationA,fixtureIds.contractA],
  )
  return { ingestionId,racedIngestionId,sourceId,documentId,knowledgeRunId,missionId,conversationId,agentRunId }
}
