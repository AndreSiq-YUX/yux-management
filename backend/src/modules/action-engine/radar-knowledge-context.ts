import type { Queryable } from './repository.js'
import { retrieveAuthorizedKnowledge,recordAuthorizedKnowledgeRetrieval } from '../company-intelligence/retrieval-policy.js'
import { verifyMissionKnowledgeContext } from './mission-source-verifier.js'
import type { MissionSourceRefWire } from './generated/mission-wire.js'

export const RADAR_MISSION_KNOWLEDGE_SCOPE={agentProfileKey:'growth_strategist',moduleKey:'radar',workflowKey:'radar_commercial_mission',audience:'internal_operator' as const,channel:null}
/** Uses only publications authorized for this tenant and this consumer. No file-to-prompt shortcut. */
export async function retrieveRadarMissionKnowledge(pool:Queryable,input:{organizationId:string;contractId?:string}){
 const query={schemaVersion:1 as const,organizationId:input.organizationId,contractId:input.contractId??null,
  profileKey:RADAR_MISSION_KNOWLEDGE_SCOPE.agentProfileKey,audience:RADAR_MISSION_KNOWLEDGE_SCOPE.audience,
  moduleKey:RADAR_MISSION_KNOWLEDGE_SCOPE.moduleKey,workflowKey:RADAR_MISSION_KNOWLEDGE_SCOPE.workflowKey,
  channel:null,queryText:'Radar Comercial',matchLimit:20}
 const retrieval=await retrieveAuthorizedKnowledge(pool,query)
 await recordAuthorizedKnowledgeRetrieval(pool,query,retrieval)
 const sourceRefs:MissionSourceRefWire[]=retrieval.candidates.map(source=>({
   ref:`${source.namespace==='strategy'?'yux':'customer'}:${source.id}`,kind:source.namespace==='strategy'?'strategy_card':'knowledge_chunk',
   id:source.id,version:source.publicationId,contentHash:source.contentHash,visibility:'client_safe',title:'Guia do Radar Comercial',displayMode:'named',
   publicationId:source.publicationId,itemId:source.itemId,knowledgePolicyVersion:1,useMode:source.useMode,bindingFingerprint:source.bindingFingerprint,
 }))
 const verified=await verifyMissionKnowledgeContext(pool,{...input,...RADAR_MISSION_KNOWLEDGE_SCOPE,sourceRefs})
 verified.sourceIds=[...new Set([...verified.sources.map(source=>source.id),...verified.sourceIds])].sort()
 if(!verified.sources.length)throw new Error('radar_mission_published_knowledge_required')
 return{verified,queryId:retrieval.result.queryId,contextHash:retrieval.result.contextHash,retrievalMode:retrieval.result.retrievalMode}
}
