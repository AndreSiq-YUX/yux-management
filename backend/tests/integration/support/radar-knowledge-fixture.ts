import { createHash,randomUUID } from 'node:crypto'
import type {IntegrationRig} from './rig.js'

export async function createPublishedRadarRule(rig: IntegrationRig, visibility: 'internal_only' | 'client_safe', concept: string) {
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
     VALUES ($1,$2,$3,'radar','active',1)`,
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
