import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import pg from 'pg'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import type { MissionSourceRefWire } from '../../src/modules/action-engine/generated/mission-wire.js'
import { hashCanonical, insertMissionContextSnapshot } from '../../src/modules/action-engine/repository.js'
import { revalidateMissionGrounding } from '../../src/modules/action-engine/mission-source-verifier.js'
import { retrieveAuthorizedKnowledge } from '../../src/modules/company-intelligence/retrieval-policy.js'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'

it('mantém a mesma regra publicada nos consumidores e invalida novas decisões após revogação', async () => {
  const rig = await createIntegrationRig()
  const apiPool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_api') }), 'api')
  const workerPool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }), 'worker')
  try {
    const publicRule = await createPublishedRule(rig, 'client_safe', 'grounding exclusiva aprovada')
    const internalRule = await createPublishedRule(rig, 'internal_only', 'grounding segredo interno')
    const consumerScopes = [
      { name: 'marketing', audience: 'client_user', workflowKey: 'marketing_generation', channel: null },
      { name: 'radar', audience: 'client_user', workflowKey: 'commercial_radar_local_niche', channel: null },
      { name: 'automation_ai', audience: 'client_user', workflowKey: 'ai_generate_message', channel: 'email' },
      { name: 'omnichannel', audience: 'external_contact', workflowKey: 'whatsapp_conversation_turn', channel: 'whatsapp' },
      { name: 'strategy_chat', audience: 'internal_operator', workflowKey: 'diagnostic_48h', channel: null },
      { name: 'supervisor', audience: 'client_user', workflowKey: 'mission_intake_conversation', channel: null },
    ] as const

    let supervisorSource: any
    for (const scope of consumerScopes) {
      const retrieval = await queryKnowledge(apiPool, rig, {
        audience: scope.audience,
        workflowKey: scope.workflowKey,
        channel: scope.channel,
        queryText: 'grounding exclusiva aprovada',
      })
      expect(retrieval.result.sources, scope.name).toEqual(expect.arrayContaining([
        expect.objectContaining({
          namespace: 'strategy', id: publicRule.cardId,
          publicationId: publicRule.releaseId, itemId: publicRule.itemId,
          knowledgePolicyVersion: 1,
        }),
      ]))
      if (scope.name === 'supervisor') supervisorSource = retrieval.candidates.find(source => source.id === publicRule.cardId)
    }

    const blocked = await queryKnowledge(apiPool, rig, {
      profileKey: 'blocked_profile', queryText: 'grounding exclusiva aprovada',
    })
    expect(blocked.result.sources.map(source => source.id)).not.toContain(publicRule.cardId)

    const external = await queryKnowledge(apiPool, rig, {
      audience: 'external_contact', channel: 'whatsapp', queryText: 'grounding segredo interno',
    })
    expect(external.result.sources.map(source => source.id)).not.toContain(internalRule.cardId)

    const sourceRef: MissionSourceRefWire = {
      ref: `yux:${publicRule.cardId}`,
      kind: 'strategy_card',
      id: publicRule.cardId,
      version: publicRule.releaseId,
      contentHash: hashCanonical({ id: publicRule.cardId, version: publicRule.releaseId, content: publicRule.content }),
      visibility: 'client_safe',
      title: publicRule.concept,
      displayMode: 'named',
      publicationId: publicRule.releaseId,
      itemId: publicRule.itemId,
      knowledgePolicyVersion: 1,
      useMode: supervisorSource.useMode,
      bindingFingerprint: supervisorSource.bindingFingerprint,
    }
    expect(sourceRef.contentHash).toBe(supervisorSource.contentHash)
    const contextSnapshot = await runWithDatabaseRequestContext(
      { role: 'yux_operator', organizationIds: [rig.ids.organizationA], serviceRole: 'worker' },
      () => insertMissionContextSnapshot(workerPool, {
        organizationId: rig.ids.organizationA,
        missionId: rig.ids.missionA,
        query: 'grounding exclusiva aprovada',
        companyContext: {},
        knowledgeItems: [],
        strategyItems: [sourceRef as unknown as Record<string, unknown>],
        approvedLearningMemory: [],
        liveState: {},
        capabilityManifest: [],
        capabilityCatalogHash: 'c'.repeat(64),
        sourceIds: [publicRule.cardId],
      }),
    )
    const groundingInput = {
      organizationId: rig.ids.organizationA,
      contextSnapshotId: contextSnapshot.id,
      audience: 'client_user' as const,
      agentProfileKey: 'growth_strategist',
      contractId: rig.ids.contractA,
      moduleKey: 'marketing_studio',
      workflowKey: 'mission_intake_conversation',
    }
    const verified = await runWithDatabaseRequestContext(
      { role: 'yux_operator', organizationIds: [rig.ids.organizationA], serviceRole: 'worker' },
      () => revalidateMissionGrounding(workerPool, groundingInput),
    )
    expect(verified.sources[0]).toMatchObject({
      publicationId: publicRule.releaseId,
      itemId: publicRule.itemId,
      bindingFingerprint: supervisorSource.bindingFingerprint,
    })

    await rig.sql(`UPDATE public.yux_strategy_pack_bindings SET status='archived' WHERE id=$1`, [publicRule.bindingId])
    const afterRevocation = await queryKnowledge(apiPool, rig, { queryText: 'grounding exclusiva aprovada' })
    expect(afterRevocation.result.sources.map(source => source.id)).not.toContain(publicRule.cardId)
    await expect(runWithDatabaseRequestContext(
      { role: 'yux_operator', organizationIds: [rig.ids.organizationA], serviceRole: 'worker' },
      () => revalidateMissionGrounding(workerPool, groundingInput),
    )).rejects.toThrow(`mission_source_verification_failed:yux:${publicRule.cardId}`)
    expect(verified.sources[0]?.content).toBe(publicRule.content)
  } finally {
    await apiPool.end()
    await workerPool.end()
    await rig.close()
  }
})

async function queryKnowledge(pool: pg.Pool, rig: IntegrationRig, override: Record<string, unknown>) {
  const input = {
    schemaVersion: 1 as const,
    organizationId: rig.ids.organizationA,
    contractId: rig.ids.contractA,
    profileKey: 'growth_strategist',
    audience: 'client_user' as 'internal_operator' | 'client_user' | 'external_contact',
    moduleKey: 'marketing_studio',
    workflowKey: null as string | null,
    channel: null as string | null,
    queryText: '',
    matchLimit: 5,
    ...override,
  }
  return runWithDatabaseRequestContext(
    {
      role: input.audience === 'internal_operator' ? 'yux_operator' : 'client_member',
      organizationIds: [rig.ids.organizationA],
      serviceRole: 'api',
    },
    () => retrieveAuthorizedKnowledge(pool, input),
  )
}

async function createPublishedRule(rig: IntegrationRig, visibility: 'internal_only' | 'client_safe', concept: string) {
  const packId = randomUUID()
  const itemId = randomUUID()
  const releaseId = randomUUID()
  const cardId = randomUUID()
  const bindingId = randomUUID()
  const problem = visibility === 'client_safe' ? 'Regra comum dos consumidores' : 'Nunca expor ao contato externo'
  const decisionRules = ['Validar o contexto publicado']
  const recommendedActions = ['Usar a regra aprovada']
  const content = [concept, problem, ...decisionRules, ...recommendedActions].join('\n')
  await rig.sql(
    `INSERT INTO public.yux_strategy_packs (id,pack_key,name,description,scope,visibility,status,owner_organization_id)
     VALUES ($1,$2,$3,'Grounding integrado','client',$4,'draft',$5)`,
    [packId, `grounding-${packId}`, concept, visibility, rig.ids.organizationA],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_pack_items (id,pack_id,item_type,title,summary,body,status,content_hash)
     VALUES ($1,$2,'concept_card',$3,$4,$5,'approved',$6)`,
    [itemId, packId, concept, problem, content, createHash('sha256').update(content).digest('hex')],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_pack_releases (
       id,pack_id,version,content_hash,policy_version,snapshot,visibility,
       allowed_agent_profile_keys,blocked_agent_profile_keys,approved_item_ids
     ) VALUES ($1,$2,1,$3,'strategy:v1','{"schemaVersion":1}'::jsonb,$4,
               ARRAY[]::TEXT[],ARRAY['blocked_profile']::TEXT[],$5)`,
    [releaseId, packId, createHash('sha256').update(releaseId).digest('hex'), visibility, [itemId]],
  )
  await rig.sql(`INSERT INTO public.yux_strategy_release_items(release_id,item_id) VALUES ($1,$2)`, [releaseId, itemId])
  await rig.sql(
    `INSERT INTO public.yux_strategy_concept_cards (
       id,pack_release_id,pack_item_id,concept,category,source_scope,visibility,problem_solved,
       decision_rules,recommended_actions,allowed_agent_profile_keys,human_review_status,metadata
     ) VALUES ($1,$2,$3,$4,'grounding','client',$5,$6,$7,$8,ARRAY[]::TEXT[],'approved','{}')`,
    [cardId, releaseId, itemId, concept, visibility, problem, decisionRules, recommendedActions],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_pack_bindings (id,pack_id,organization_id,module_key,status,priority)
     VALUES ($1,$2,$3,'marketing_studio','active',1)`,
    [bindingId, packId, rig.ids.organizationA],
  )
  await rig.sql(`UPDATE public.yux_strategy_packs SET current_release_id=$2,status='published' WHERE id=$1`, [packId, releaseId])
  const fingerprint = await rig.sql(
    `SELECT encode(public.digest(string_agg(
       binding.id::TEXT || ':' || EXTRACT(EPOCH FROM binding.updated_at)::TEXT,
       ',' ORDER BY binding.priority,binding.id
     ),'sha256'),'hex') AS value
     FROM public.yux_strategy_pack_bindings binding
     WHERE binding.pack_id=$1 AND binding.status='active'`,
    [packId],
  )
  return {
    packId, itemId, releaseId, cardId, bindingId, concept, content,
    bindingFingerprint: String(fingerprint.rows[0]?.value),
  }
}
