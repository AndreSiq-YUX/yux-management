import type pg from 'pg'
import { ApiError } from '../../http/errors.js'
import { hashCanonical, type Queryable } from '../action-engine/repository.js'
import { verifyMissionKnowledgeContext } from '../action-engine/mission-source-verifier.js'
import type { MissionSourceRefWire } from '../action-engine/generated/mission-wire.js'
import { assertCompanyStrategyWrite, getCompanyStrategy, getCompanyStrategyRevisionForEditing, lockStrategyOrganization, saveCompanyStrategyDraftInTransaction, withCompanyStrategyTransaction } from './repository.js'
import { companyStrategyProposalSchema, type CompanyStrategyAccess, type CompanyStrategyContentV1, type CompanyStrategyProposalInput } from './schemas.js'

type ProposalRow = { id:string;organization_id:string;strategy_id:string|null;conversation_id:string;message_id:string;base_revision_id:string|null;base_strategy_version:number|null;content:CompanyStrategyContentV1;source_refs:string[];response_hash:string;status:'suggested'|'applied';applied_strategy_id:string|null;applied_revision_id:string|null }
export async function validateMissionStrategyProposal(db: Queryable, access: CompanyStrategyAccess, input: unknown) {
  assertCompanyStrategyWrite(access)
  const proposal=companyStrategyProposalSchema.parse(input)
  if(proposal.strategyId) await getCompanyStrategyRevisionForEditing(db,access,proposal.strategyId,proposal.baseRevisionId!)
  return proposal
}
export async function persistMissionStrategyProposalInTransaction(db: Queryable, access: CompanyStrategyAccess, input: {proposalId?:string;conversationId:string;messageId:string;responseHash:string;proposal:CompanyStrategyProposalInput}) {
  const proposal=await validateMissionStrategyProposal(db,access,input.proposal)
  const message=(await db.query<{structured_payload:Record<string,unknown>;source_refs:MissionSourceRefWire[]}>(`SELECT message.structured_payload,message.source_refs FROM public.action_mission_conversation_messages message
    JOIN public.action_mission_conversations conversation ON conversation.id=message.conversation_id AND conversation.organization_id=message.organization_id
    WHERE message.id=$1 AND message.conversation_id=$2 AND message.organization_id=$3 AND message.actor_type='agent'`,[input.messageId,input.conversationId,access.organizationId])).rows[0]
  if(!message) throw new ApiError(404,'company_strategy_proposal_message_not_found')
  const stored=companyStrategyProposalSchema.safeParse(message.structured_payload.strategyProposal)
  const hash=hashCanonical(proposal)
  if(!stored.success || hashCanonical(stored.data)!==hash || input.responseHash!==hash) throw new ApiError(409,'company_strategy_proposal_message_changed')
  const available=new Set(message.source_refs.map(source=>source.ref))
  if(proposal.sourceRefs.some(ref=>!available.has(ref))) throw new ApiError(409,'company_strategy_proposal_source_invalid')
  const prior=(await db.query<ProposalRow>('SELECT * FROM public.company_strategy_proposals WHERE organization_id=$1 AND message_id=$2',[access.organizationId,input.messageId])).rows[0]
  if(prior) {
    if(prior.response_hash!==hash) throw new ApiError(409,'company_strategy_proposal_message_changed')
    return {proposalId:prior.id,strategyId:prior.strategy_id,status:prior.status,appliedStrategyId:prior.applied_strategy_id}
  }
  const row=(await db.query<ProposalRow>(`INSERT INTO public.company_strategy_proposals(id,organization_id,strategy_id,conversation_id,message_id,base_revision_id,base_strategy_version,content,source_refs,response_hash,created_by)
    VALUES(COALESCE($11::uuid,gen_random_uuid()),$1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`,[access.organizationId,proposal.strategyId??null,input.conversationId,input.messageId,proposal.baseRevisionId??null,proposal.baseStrategyVersion??null,JSON.stringify(proposal.content),JSON.stringify(proposal.sourceRefs),hash,access.actorId,input.proposalId??null])).rows[0]!
  return {proposalId:row.id,strategyId:row.strategy_id,status:row.status,appliedStrategyId:null}
}
export async function persistMissionStrategyProposal(db: pg.Pool, access: CompanyStrategyAccess, input: Parameters<typeof persistMissionStrategyProposalInTransaction>[2]) {
  return withCompanyStrategyTransaction(db,client=>persistMissionStrategyProposalInTransaction(client,access,input))
}
async function proposalRow(db: Queryable,access: CompanyStrategyAccess,id:string,lock=false) {
  assertCompanyStrategyWrite(access)
  const row=(await db.query<ProposalRow>(`SELECT * FROM public.company_strategy_proposals WHERE organization_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[access.organizationId,id])).rows[0]
  if(!row) throw new ApiError(404,'company_strategy_proposal_not_found')
  return row
}
export async function getCompanyStrategyProposal(db: Queryable,access:CompanyStrategyAccess,id:string) {
  const row=await proposalRow(db,access,id)
  const targetId=row.applied_strategy_id??row.strategy_id
  const currentStrategy=targetId?await getCompanyStrategy(db,access,targetId):null
  const baseRevision=row.strategy_id&&row.base_revision_id?await getCompanyStrategyRevisionForEditing(db,access,row.strategy_id,row.base_revision_id):null
  // Explicit presentation DTO: no raw message, source metadata or provider diagnostics.
  return {proposalId:row.id,strategyId:row.strategy_id,baseRevisionId:row.base_revision_id,baseStrategyVersion:row.base_strategy_version,content:row.content,status:row.status,appliedStrategyId:row.applied_strategy_id,currentStrategy,baseRevision}
}
export async function applyCompanyStrategyProposal(db:pg.Pool,access:CompanyStrategyAccess,input:{proposalId:string;expectedStrategyVersion:number|null;idempotencyKey:string;reviewedContent?:CompanyStrategyContentV1}) {
  assertCompanyStrategyWrite(access)
  return withCompanyStrategyTransaction(db,async client=>{
    await lockStrategyOrganization(client,access)
    const proposal=await proposalRow(client,access,input.proposalId,true)
    const content=input.reviewedContent??proposal.content
    if(input.expectedStrategyVersion!==proposal.base_strategy_version) throw new ApiError(409,'company_strategy_proposal_base_changed')
    if(proposal.status==='applied') {
      const revision=(await client.query<{content_hash:string;idempotency_key:string}>('SELECT content_hash,idempotency_key FROM public.company_strategy_revisions WHERE organization_id=$1 AND strategy_id=$2 AND id=$3',[access.organizationId,proposal.applied_strategy_id,proposal.applied_revision_id])).rows[0]
      if(!revision || revision.idempotency_key!==input.idempotencyKey || revision.content_hash!==hashCanonical(content)) throw new ApiError(409,'company_strategy_proposal_already_applied')
      return getCompanyStrategy(client,access,proposal.applied_strategy_id!)
    }
    if(proposal.strategy_id) {
      const current=await getCompanyStrategy(client,access,proposal.strategy_id)
      if(current.version!==proposal.base_strategy_version || (current.draftRevision??current.publishedRevision)?.id!==proposal.base_revision_id) throw new ApiError(409,'company_strategy_proposal_base_changed')
    }
    const message=(await client.query<{source_refs:MissionSourceRefWire[]}>('SELECT source_refs FROM public.action_mission_conversation_messages WHERE organization_id=$1 AND id=$2',[access.organizationId,proposal.message_id])).rows[0]
    const references=(message?.source_refs??[]).filter(source=>proposal.source_refs.includes(source.ref))
    if(references.length!==proposal.source_refs.length) throw new ApiError(409,'company_strategy_proposal_source_invalid')
    const conversation=(await client.query<{contract_id:string|null}>('SELECT contract_id FROM public.action_mission_conversations WHERE organization_id=$1 AND id=$2',[access.organizationId,proposal.conversation_id])).rows[0]
    await verifyMissionKnowledgeContext(client,{organizationId:access.organizationId,audience:access.role.startsWith('yux_')?'internal_operator':'client_user',sourceRefs:references,contractId:conversation?.contract_id,agentProfileKey:'growth_strategist',moduleKey:'marketing_studio',workflowKey:'mission_intake_conversation'})
    const saved=await saveCompanyStrategyDraftInTransaction(client,access,{...(proposal.strategy_id?{strategyId:proposal.strategy_id}:{}),expectedVersion:proposal.base_strategy_version,content,idempotencyKey:input.idempotencyKey,origin:{kind:'mission',proposalId:proposal.id}})
    await client.query("UPDATE public.company_strategy_proposals SET status='applied',applied_strategy_id=$3,applied_revision_id=$4 WHERE organization_id=$1 AND id=$2",[access.organizationId,proposal.id,saved.id,saved.draftRevision!.id])
    return saved
  })
}
