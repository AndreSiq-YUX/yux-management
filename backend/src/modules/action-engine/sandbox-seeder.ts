import { hashCanonical, type Connectable, type Queryable } from './repository.js'
import { resolveMissionRecipe } from './recipes.js'

export type SandboxSeedManifest = { id: string; organizationId: string; recipeKey: string; recipeVersion: number; status: string; manifestHash: string; itemCount: number; reused?: boolean }
type SeedItem = { entityType: 'crm_pipeline' | 'crm_pipeline_stage' | 'lead' | 'interaction'; entityId: string; contentHash: string }

export async function seedMissionSandbox(pool: Connectable, input: { organizationId: string; recipeKey: string; recipeVersion: number; actorId: string }): Promise<SandboxSeedManifest> {
  return transaction(pool, async client => {
    await requireSandboxEntitlement(client, input.organizationId)
    const recipe = await resolveMissionRecipe(client, input.recipeKey, input.recipeVersion)
    const existing = await client.query<{ id: string; manifest_hash: string; item_count: number | string }>(
      `SELECT manifest.id,manifest.manifest_hash,COUNT(item.id)::INT AS item_count
       FROM public.action_sandbox_seed_manifests manifest LEFT JOIN public.action_sandbox_seed_items item ON item.manifest_id=manifest.id
       WHERE manifest.organization_id=$1 AND manifest.recipe_version_id=$2 AND manifest.status='active'
       GROUP BY manifest.id LIMIT 1`, [input.organizationId, recipe.id],
    )
    if (existing.rows[0]) return { id: existing.rows[0].id, organizationId: input.organizationId, recipeKey: recipe.key, recipeVersion: recipe.version, status: 'active', manifestHash: existing.rows[0].manifest_hash, itemCount: Number(existing.rows[0].item_count), reused: true }
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.action_sandbox_seed_manifests (organization_id,recipe_version_id,created_by) VALUES ($1,$2,$3) RETURNING id`,
      [input.organizationId, recipe.id, input.actorId],
    )
    const manifestId = required(created.rows[0]?.id)
    const items: SeedItem[] = []
    const pipelineData = { name: `[DEMO] Funil imobiliário ${manifestId.slice(0, 8)}`, description: 'Dados descartáveis da Recipe YUX', isDefault: false, isActive: true }
    const pipeline = await client.query<{ id: string }>(
      `INSERT INTO public.crm_pipelines (organization_id,name,description,is_default,is_active,is_demo,sandbox_seed_manifest_id)
       VALUES ($1,$2,$3,FALSE,TRUE,TRUE,$4) RETURNING id`, [input.organizationId, pipelineData.name, pipelineData.description, manifestId],
    )
    const pipelineId = required(pipeline.rows[0]?.id); items.push(item('crm_pipeline', pipelineId, pipelineData))
    const stages = [
      { key: 'demo_new', name: '[DEMO] Novo interesse', orderIndex: 0, isWon: false, isLost: false },
      { key: 'demo_visit', name: '[DEMO] Visita agendada', orderIndex: 1, isWon: false, isLost: false },
      { key: 'demo_proposal', name: '[DEMO] Proposta', orderIndex: 2, isWon: false, isLost: false },
      { key: 'demo_won', name: '[DEMO] Fechado', orderIndex: 3, isWon: true, isLost: false },
    ]
    const stageIds: string[] = []
    for (const stage of stages) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.crm_pipeline_stages (pipeline_id,key,name,order_index,is_won,is_lost,is_demo,sandbox_seed_manifest_id)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7) RETURNING id`, [pipelineId, stage.key, stage.name, stage.orderIndex, stage.isWon, stage.isLost, manifestId],
      )
      const id = required(inserted.rows[0]?.id); stageIds.push(id); items.push(item('crm_pipeline_stage', id, stage))
    }
    for (let index = 0; index < 6; index += 1) {
      const leadData = { name: `[DEMO] Comprador ${index + 1}`, email: `demo+${manifestId.slice(0, 8)}-${index + 1}@example.invalid`, company: '[DEMO] Imobiliária', source: 'Sandbox YUX', stage: index > 3 ? 'PROPOSAL' : 'QUALIFIED', status: 'demo', score: 40 + index * 5, value: (350000 + index * 25000).toFixed(2), stageId: stageIds[Math.min(index % 3, stageIds.length - 1)] }
      const lead = await client.query<{ id: string }>(
        `INSERT INTO public.leads (organization_id,pipeline_id,stage_id,name,email,company,source,stage,status,score,value,notes,last_activity_at,is_demo,sandbox_seed_manifest_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'[DEMO] Registro descartável',NOW()-($12::INT*INTERVAL '5 days'),TRUE,$13) RETURNING id`,
        [input.organizationId, pipelineId, leadData.stageId, leadData.name, leadData.email, leadData.company, leadData.source, leadData.stage, leadData.status, leadData.score, leadData.value, index + 1, manifestId],
      )
      const leadId = required(lead.rows[0]?.id); items.push(item('lead', leadId, leadData))
      const interactionData = { type: 'note', title: `[DEMO] Histórico ${index + 1}`, description: 'Interação sintética para simulação', leadId }
      const interaction = await client.query<{ id: string }>(
        `INSERT INTO public.interactions (organization_id,lead_id,type,title,description,date,is_demo,sandbox_seed_manifest_id)
         VALUES ($1,$2,'note',$3,$4,NOW()-($5::INT*INTERVAL '3 days'),TRUE,$6) RETURNING id`,
        [input.organizationId, leadId, interactionData.title, interactionData.description, index + 1, manifestId],
      )
      items.push(item('interaction', required(interaction.rows[0]?.id), interactionData))
    }
    for (const seed of items) await client.query(
      `INSERT INTO public.action_sandbox_seed_items (manifest_id,organization_id,entity_type,entity_id,content_hash) VALUES ($1,$2,$3,$4,$5)`,
      [manifestId, input.organizationId, seed.entityType, seed.entityId, seed.contentHash],
    )
    const manifestHash = hashCanonical(items)
    await client.query(`UPDATE public.action_sandbox_seed_manifests SET manifest_hash=$2 WHERE id=$1`, [manifestId, manifestHash])
    return { id: manifestId, organizationId: input.organizationId, recipeKey: recipe.key, recipeVersion: recipe.version, status: 'active', manifestHash, itemCount: items.length }
  })
}

export async function cleanupMissionSandbox(pool: Connectable, input: { organizationId: string; manifestId: string; actorId: string }) {
  return transaction(pool, async client => {
    const manifest = await client.query<{ id: string }>(`SELECT id FROM public.action_sandbox_seed_manifests WHERE id=$1 AND organization_id=$2 AND status='active' FOR UPDATE`, [input.manifestId, input.organizationId])
    if (!manifest.rows[0]) throw new Error('sandbox_manifest_not_found')
    const items = await client.query<{ entity_type: SeedItem['entityType']; entity_id: string; content_hash: string }>(
      `SELECT entity_type,entity_id,content_hash FROM public.action_sandbox_seed_items
       WHERE manifest_id=$1 AND organization_id=$2
       ORDER BY CASE entity_type WHEN 'interaction' THEN 1 WHEN 'lead' THEN 2 WHEN 'crm_pipeline_stage' THEN 3 ELSE 4 END, created_at DESC`,
      [input.manifestId, input.organizationId],
    )
    const deleted: string[] = []; const modified: string[] = []
    for (const seed of items.rows) {
      const current = await loadSeededEntity(client, seed.entity_type, seed.entity_id, input.organizationId, input.manifestId)
      if (current && hashCanonical(current) !== seed.content_hash) modified.push(`${seed.entity_type}:${seed.entity_id}`)
    }
    if (modified.length === 0) {
      for (const seed of items.rows) {
        await deleteSeededEntity(client, seed.entity_type, seed.entity_id, input.organizationId, input.manifestId)
        deleted.push(`${seed.entity_type}:${seed.entity_id}`)
      }
    }
    const status = modified.length ? 'review_required' : 'cleaned'
    await client.query(`UPDATE public.action_sandbox_seed_manifests SET status=$3,cleaned_by=$4,cleaned_at=NOW() WHERE id=$1 AND organization_id=$2`, [input.manifestId, input.organizationId, status, input.actorId])
    return { manifestId: input.manifestId, status, deleted, modified }
  })
}

export function seededEntityUnchanged(expectedHash: string, current: Record<string, unknown> | null) { return Boolean(current && hashCanonical(current) === expectedHash) }
function item(entityType: SeedItem['entityType'], entityId: string, value: Record<string, unknown>): SeedItem { return { entityType, entityId, contentHash: hashCanonical(value) } }

async function requireSandboxEntitlement(client: Queryable, organizationId: string) {
  const result = await client.query<{ allowed: boolean }>(`SELECT organization.kind='yux' OR EXISTS (SELECT 1 FROM public.contracts contract JOIN public.contract_modules module ON module.contract_id=contract.id WHERE contract.client_id=organization.client_id AND contract.status='active' AND module.module_key='mission_sandbox' AND module.enabled=TRUE) AS allowed FROM public.organizations organization WHERE organization.id=$1`, [organizationId])
  if (result.rows[0]?.allowed !== true) throw new Error('mission_sandbox_not_entitled')
}

async function loadSeededEntity(client: Queryable, type: SeedItem['entityType'], id: string, organizationId: string, manifestId: string): Promise<Record<string, unknown> | null> {
  const queries = {
    crm_pipeline: [`SELECT name,description,"is_default" AS "isDefault","is_active" AS "isActive" FROM public.crm_pipelines WHERE id=$1 AND organization_id=$2 AND sandbox_seed_manifest_id=$3`, [id, organizationId, manifestId]],
    crm_pipeline_stage: [`SELECT stage.key,stage.name,stage.order_index AS "orderIndex",stage.is_won AS "isWon",stage.is_lost AS "isLost" FROM public.crm_pipeline_stages stage JOIN public.crm_pipelines pipeline ON pipeline.id=stage.pipeline_id WHERE stage.id=$1 AND pipeline.organization_id=$2 AND stage.sandbox_seed_manifest_id=$3`, [id, organizationId, manifestId]],
    lead: [`SELECT name,email,company,source,stage,status,score,value::TEXT,stage_id AS "stageId" FROM public.leads WHERE id=$1 AND organization_id=$2 AND sandbox_seed_manifest_id=$3`, [id, organizationId, manifestId]],
    interaction: [`SELECT interaction.type,interaction.title,interaction.description,interaction.lead_id AS "leadId" FROM public.interactions interaction WHERE interaction.id=$1 AND interaction.organization_id=$2 AND interaction.sandbox_seed_manifest_id=$3`, [id, organizationId, manifestId]],
  } as const
  const [sql, params] = queries[type]; const result = await client.query<Record<string, unknown>>(sql, [...params]); return result.rows[0] ?? null
}

async function deleteSeededEntity(client: Queryable, type: SeedItem['entityType'], id: string, organizationId: string, manifestId: string) {
  if (type === 'crm_pipeline_stage') return client.query(`DELETE FROM public.crm_pipeline_stages stage USING public.crm_pipelines pipeline WHERE stage.id=$1 AND stage.pipeline_id=pipeline.id AND pipeline.organization_id=$2 AND stage.sandbox_seed_manifest_id=$3`, [id, organizationId, manifestId])
  const table = ({ crm_pipeline: 'crm_pipelines', lead: 'leads', interaction: 'interactions' } as const)[type]
  return client.query(`DELETE FROM public.${table} WHERE id=$1 AND organization_id=$2 AND sandbox_seed_manifest_id=$3`, [id, organizationId, manifestId])
}

function required(value?: string) { if (!value) throw new Error('sandbox_seed_persistence_failed'); return value }
async function transaction<T>(pool: Connectable, work: (client: Queryable) => Promise<T>): Promise<T> { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() } }
