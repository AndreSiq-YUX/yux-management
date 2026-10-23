import { expect,it } from 'vitest'
import pg from 'pg'
import { createIntegrationRig,getIntegrationDatabaseUrl } from './support/rig.js'
import { createPublishedRadarRule } from './support/radar-knowledge-fixture.js'
import { retrieveRadarMissionKnowledge } from '../../src/modules/action-engine/radar-knowledge-context.js'
import { verifyMissionKnowledgeContext } from '../../src/modules/action-engine/mission-source-verifier.js'

it('retrieves only governed Radar bindings and invalidates a revoked publication',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub'}),pool=new pg.Pool({connectionString:getIntegrationDatabaseUrl()})
 try{
  const input={organizationId:rig.ids.organizationA,contractId:rig.ids.contractA}
  await expect(retrieveRadarMissionKnowledge(pool,input)).rejects.toThrow('published_knowledge_required')
  const publication=await createPublishedRadarRule(rig,'client_safe','Radar Comercial: salvar não inicia pesquisa')
  const context=await retrieveRadarMissionKnowledge(pool,input)
  expect(context.verified.strategyItems.map(item=>item.id)).toContain(publication.cardId)
  expect(context.retrievalMode).toBe('lexical')
  await expect(retrieveRadarMissionKnowledge(pool,{organizationId:rig.ids.organizationB,contractId:rig.ids.contractB})).rejects.toThrow('published_knowledge_required')
  await rig.sql("UPDATE public.yux_strategy_pack_bindings SET workflow_key='mission_intake_conversation' WHERE id=$1",[publication.bindingId])
  await expect(retrieveRadarMissionKnowledge(pool,input)).rejects.toThrow('published_knowledge_required')
  await rig.sql("UPDATE public.yux_strategy_pack_bindings SET workflow_key='radar_commercial_mission' WHERE id=$1",[publication.bindingId])
  await retrieveRadarMissionKnowledge(pool,input)
  await rig.sql("UPDATE public.yux_strategy_packs SET status='draft',current_release_id=NULL WHERE id=$1",[publication.packId])
  await expect(verifyMissionKnowledgeContext(pool,{...input,audience:'internal_operator',agentProfileKey:'growth_strategist',moduleKey:'radar',workflowKey:'radar_commercial_mission',sourceRefs:context.verified.sources})).rejects.toThrow('mission_source_verification_failed')
 }finally{await pool.end();await rig.close()}
})
