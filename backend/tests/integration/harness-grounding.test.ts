import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import type { MissionSourceRefWire } from '../../src/modules/action-engine/generated/mission-wire.js'
import { hashCanonical } from '../../src/modules/action-engine/repository.js'
import { verifyMissionKnowledgeContext } from '../../src/modules/action-engine/mission-source-verifier.js'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'

it('mantém a mesma regra publicada nos consumidores e invalida novas decisões após revogação', async () => {
  const rig = await createIntegrationRig()
  try {
    const publicRule = await createPublishedRule(rig, 'client_safe', 'grounding exclusiva aprovada')
    const internalRule = await createPublishedRule(rig, 'internal_only', 'grounding segredo interno')
    const consumerScopes = [
      { name: 'marketing', audience: 'client_user', workflowKey: 'marketing_generation', channel: null },
      { name: 'radar', audience: 'client_user', workflowKey: 'commercial_radar_local_niche', channel: null },
      { name: 'automation_ai', audience: 'client_user', workflowKey: 'ai_generate_message', channel: 'email' },
      { name: 'omnichannel', audience: 'external_contact', workflowKey: 'whatsapp_conversation_turn', channel: 'whatsapp' },
      { name: 'supervisor', audience: 'client_user', workflowKey: 'mission_intake_conversation', channel: null },
    ] as const

    let supervisorSource: any
    for (const scope of consumerScopes) {
      const response = await queryKnowledge(rig, {
        audience: scope.audience,
        workflowKey: scope.workflowKey,
        channel: scope.channel,
        queryText: 'grounding exclusiva aprovada',
      })
      expect(response.statusCode, `${scope.name}:${JSON.stringify(response.body)}`).toBe(200)
      expect(response.body.sources).toEqual(expect.arrayContaining([
        expect.objectContaining({
          namespace: 'strategy', id: publicRule.cardId,
          publicationId: publicRule.releaseId, itemId: publicRule.itemId,
          knowledgePolicyVersion: 1,
        }),
      ]))
      if (scope.name === 'supervisor') supervisorSource = response.body.sources.find((source: any) => source.id === publicRule.cardId)
    }

    const blocked = await queryKnowledge(rig, {
      profileKey: 'blocked_profile', queryText: 'grounding exclusiva aprovada',
    })
    expect(blocked.statusCode, JSON.stringify(blocked.body)).toBe(200)
    expect(blocked.body.sources.map((source: any) => source.id)).not.toContain(publicRule.cardId)

    const external = await queryKnowledge(rig, {
      audience: 'external_contact', channel: 'whatsapp', queryText: 'grounding segredo interno',
    })
    expect(external.statusCode, JSON.stringify(external.body)).toBe(200)
    expect(external.body.sources.map((source: any) => source.id)).not.toContain(internalRule.cardId)

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
      bindingFingerprint: publicRule.bindingFingerprint,
    }
    expect(sourceRef.contentHash).toBe(supervisorSource.contentHash)
    const database = { query: rig.sql }
    const verified = await verifyMissionKnowledgeContext(database as never, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      audience: 'client_user',
      workflowKey: 'mission_intake_conversation',
      sourceRefs: [sourceRef],
    })
    expect(verified.sources[0]).toMatchObject({
      publicationId: publicRule.releaseId,
      itemId: publicRule.itemId,
      bindingFingerprint: publicRule.bindingFingerprint,
    })

    await rig.sql(`UPDATE public.yux_strategy_pack_bindings SET status='archived' WHERE id=$1`, [publicRule.bindingId])
    const afterRevocation = await queryKnowledge(rig, { queryText: 'grounding exclusiva aprovada' })
    expect(afterRevocation.body.sources.map((source: any) => source.id)).not.toContain(publicRule.cardId)
    await expect(verifyMissionKnowledgeContext(database as never, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      audience: 'client_user',
      workflowKey: 'mission_intake_conversation',
      sourceRefs: [sourceRef],
    })).rejects.toThrow(`mission_source_verification_failed:yux:${publicRule.cardId}`)
    expect(verified.sources[0]?.content).toBe(publicRule.content)
  } finally {
    await rig.close()
  }
})

async function queryKnowledge(rig: IntegrationRig, override: Record<string, unknown>) {
  return rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
    schemaVersion: 1,
    organizationId: rig.ids.organizationA,
    contractId: rig.ids.contractA,
    profileKey: 'growth_strategist',
    audience: 'client_user',
    moduleKey: 'marketing_studio',
    workflowKey: null,
    channel: null,
    matchLimit: 5,
    ...override,
  })
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
