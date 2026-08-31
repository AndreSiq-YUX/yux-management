import { hashCanonical, type Queryable } from './repository.js'

export type LearningExperiment = {
  id:string;organizationId:string;recommendationId:string;contextSnapshotId?:string;baselineHash:string
  candidateConfig:Record<string,unknown>;candidateConfigHash:string;status:'queued'|'running'|'completed'|'failed'|'rejected'
  baselineMetrics:Record<string,string>;candidateMetrics:Record<string,string>;comparison:Record<string,unknown>
  goldenCorpusHash?:string;goldenGatePassed?:boolean;productionEffectsObserved:false;failureReason?:string;createdBy:string;createdAt:string
}

export type LearningPromotionRequest = {
  id:string;organizationId:string;recommendationId:string;experimentId:string
  changeType:'pack_change'|'prompt_change'|'policy_change'|'knowledge_candidate';targetKey:string
  requestedChange:Record<string,unknown>;requestedChangeHash:string;status:'pending'|'approved'|'rejected'|'implemented'
  requestedBy:string;decidedBy?:string;decidedAt?:string;createdAt:string
}

type ExperimentRow = {
  id:string;organization_id:string;recommendation_id:string;context_snapshot_id:string|null;baseline_hash:string
  candidate_config:Record<string,unknown>;candidate_config_hash:string;status:LearningExperiment['status']
  baseline_metrics:Record<string,string>;candidate_metrics:Record<string,string>;comparison:Record<string,unknown>
  golden_corpus_hash:string|null;golden_gate_passed:boolean|null;production_effects_observed:boolean
  failure_reason:string|null;created_by:string;created_at:string|Date
}
type PromotionRow = {
  id:string;organization_id:string;recommendation_id:string;experiment_id:string;change_type:LearningPromotionRequest['changeType']
  target_key:string;requested_change:Record<string,unknown>;requested_change_hash:string;status:LearningPromotionRequest['status']
  requested_by:string;decided_by:string|null;decided_at:string|Date|null;created_at:string|Date
}

export function validateShadowCandidateConfig(value:Record<string,unknown>) {
  const forbidden=/provider|credential|secret|token|tool|capabilit|mutation|dispatch|webhook|sql|http/i
  const walk=(input:unknown,path:string[])=>{
    if(Array.isArray(input)){input.forEach((item,index)=>walk(item,[...path,String(index)]));return}
    if(!input||typeof input!=='object')return
    for(const [key,item] of Object.entries(input as Record<string,unknown>)){
      if(forbidden.test(key))throw new Error(`shadow_candidate_mutation_field_forbidden:${[...path,key].join('.')}`)
      walk(item,[...path,key])
    }
  }
  walk(value,[])
}

export function compareShadowMetrics(baseline:Record<string,string>,candidate:Record<string,string>) {
  const keys=[...new Set([...Object.keys(baseline),...Object.keys(candidate)])].sort()
  const deltas=Object.fromEntries(keys.map(key=>{
    const before=Number(baseline[key]);const after=Number(candidate[key])
    return [key,Number.isFinite(before)&&Number.isFinite(after)?String(after-before):'unknown']
  }))
  const regressions=keys.filter(key=>/cost|latency|failed|blocked|rejection/i.test(key)
    ? Number(candidate[key])>Number(baseline[key]):Number(candidate[key])<Number(baseline[key]))
  return {deltas,regressions,passed:regressions.length===0}
}

export async function createShadowExperiment(client:Queryable,input:{
  organizationId:string;recommendationId:string;candidateConfig:Record<string,unknown>;createdBy:string
}):Promise<LearningExperiment>{
  validateShadowCandidateConfig(input.candidateConfig)
  const source=await client.query<{recommendation_hash:string;summary:Record<string,unknown>;context_snapshot_id:string|null}>(
    `SELECT recommendation.recommendation_hash,memory.summary,
       (SELECT snapshot.id FROM public.action_mission_context_snapshots snapshot
        WHERE snapshot.mission_id=recommendation.mission_id AND snapshot.organization_id=recommendation.organization_id
        ORDER BY snapshot.created_at DESC LIMIT 1) AS context_snapshot_id
     FROM public.action_learning_recommendations recommendation
     JOIN public.action_mission_memory_summaries memory ON memory.id=recommendation.memory_summary_id
     WHERE recommendation.id=$1 AND recommendation.organization_id=$2 AND recommendation.status IN ('proposed','approved') LIMIT 1`,
    [input.recommendationId,input.organizationId],
  )
  if(!source.rows[0])throw new Error('learning_recommendation_not_experimentable')
  const baselineMetrics=extractBaselineMetrics(source.rows[0].summary)
  const baselineHash=hashCanonical({recommendationHash:source.rows[0].recommendation_hash,baselineMetrics})
  const candidateConfigHash=hashCanonical(input.candidateConfig)
  const result=await client.query<ExperimentRow>(
    `INSERT INTO public.action_learning_experiments
       (organization_id,recommendation_id,context_snapshot_id,baseline_hash,candidate_config,candidate_config_hash,baseline_metrics,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (organization_id,recommendation_id,candidate_config_hash)
     DO UPDATE SET updated_at=NOW() RETURNING *`,
    [input.organizationId,input.recommendationId,source.rows[0].context_snapshot_id,baselineHash,input.candidateConfig,candidateConfigHash,baselineMetrics,input.createdBy],
  )
  if(!result.rows[0])throw new Error('learning_experiment_create_failed')
  await client.query(`UPDATE public.action_learning_recommendations SET status='shadow_testing',updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND status='proposed'`,[input.recommendationId,input.organizationId])
  return mapExperiment(result.rows[0])
}

export async function completeShadowExperiment(client:Queryable,input:{
  organizationId:string;experimentId:string;candidateMetrics:Record<string,string>;goldenCorpusHash:string;goldenGatePassed:boolean
}):Promise<LearningExperiment>{
  if(!/^[a-f0-9]{64}$/.test(input.goldenCorpusHash))throw new Error('golden_corpus_hash_invalid')
  const current=await client.query<ExperimentRow>(`SELECT * FROM public.action_learning_experiments WHERE id=$1 AND organization_id=$2 LIMIT 1`,[input.experimentId,input.organizationId])
  if(!current.rows[0]||!['queued','running'].includes(current.rows[0].status))throw new Error('learning_experiment_not_runnable')
  const comparison=compareShadowMetrics(current.rows[0].baseline_metrics,input.candidateMetrics)
  const result=await client.query<ExperimentRow>(
    `UPDATE public.action_learning_experiments SET status='completed',candidate_metrics=$3,comparison=$4,
       golden_corpus_hash=$5,golden_gate_passed=$6,production_effects_observed=FALSE,completed_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND organization_id=$2 RETURNING *`,
    [input.experimentId,input.organizationId,input.candidateMetrics,comparison,input.goldenCorpusHash,input.goldenGatePassed],
  )
  if(!result.rows[0])throw new Error('learning_experiment_complete_failed')
  return mapExperiment(result.rows[0])
}

export async function decideShadowExperiment(client:Queryable,input:{
  organizationId:string;experimentId:string;decision:'approved'|'rejected';actorId:string
}):Promise<{experiment:LearningExperiment;promotion?:LearningPromotionRequest}>{
  const result=await client.query<ExperimentRow & { recommendation_type:LearningPromotionRequest['changeType'];target_key:string;recommendation_id:string }>(
    `SELECT experiment.*,recommendation.recommendation_type,recommendation.target_key
     FROM public.action_learning_experiments experiment JOIN public.action_learning_recommendations recommendation ON recommendation.id=experiment.recommendation_id
     WHERE experiment.id=$1 AND experiment.organization_id=$2 LIMIT 1`,[input.experimentId,input.organizationId],
  )
  const row=result.rows[0]
  if(!row||row.status!=='completed')throw new Error('learning_experiment_not_decidable')
  if(input.decision==='approved'&&(!row.golden_gate_passed||row.comparison.passed!==true))throw new Error('learning_experiment_promotion_gate_failed')
  if(input.decision==='rejected'){
    const rejected=await client.query<ExperimentRow>(`UPDATE public.action_learning_experiments SET status='rejected',updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`,[input.experimentId,input.organizationId])
    await client.query(`UPDATE public.action_learning_recommendations SET status='rejected',decided_by=$3,decided_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[row.recommendation_id,input.organizationId,input.actorId])
    return {experiment:mapExperiment(rejected.rows[0]!)}
  }
  const requestedChange={schemaVersion:1,candidateConfig:row.candidate_config,experimentId:row.id,baselineHash:row.baseline_hash,candidateConfigHash:row.candidate_config_hash,goldenCorpusHash:row.golden_corpus_hash,comparison:row.comparison}
  const requestedChangeHash=hashCanonical(requestedChange)
  const promotion=await client.query<PromotionRow>(
    `INSERT INTO public.action_learning_promotion_requests
       (organization_id,recommendation_id,experiment_id,change_type,target_key,requested_change,requested_change_hash,requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (organization_id,experiment_id) DO UPDATE SET updated_at=NOW() RETURNING *`,
    [input.organizationId,row.recommendation_id,row.id,row.recommendation_type,row.target_key,requestedChange,requestedChangeHash,input.actorId],
  )
  await client.query(`UPDATE public.action_learning_recommendations SET status='approved',decided_by=$3,decided_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[row.recommendation_id,input.organizationId,input.actorId])
  return {experiment:mapExperiment(row),promotion:mapPromotion(promotion.rows[0]!)}
}

export async function listLearningExperiments(client:Queryable,organizationId:string){
  const [experiments,promotions]=await Promise.all([
    client.query<ExperimentRow>(`SELECT * FROM public.action_learning_experiments WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200`,[organizationId]),
    client.query<PromotionRow>(`SELECT * FROM public.action_learning_promotion_requests WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200`,[organizationId]),
  ])
  return {experiments:experiments.rows.map(mapExperiment),promotions:promotions.rows.map(mapPromotion)}
}

function extractBaselineMetrics(summary:Record<string,unknown>):Record<string,string>{
  const economics=typeof summary.economics==='object'&&summary.economics?summary.economics as Record<string,unknown>:{}
  const actions=typeof summary.actionCounts==='object'&&summary.actionCounts?summary.actionCounts as Record<string,unknown>:{}
  return Object.fromEntries([...Object.entries(economics),...Object.entries(actions)].filter(([,value])=>['string','number'].includes(typeof value)).map(([key,value])=>[key,String(value)]))
}
function iso(value:string|Date){return value instanceof Date?value.toISOString():new Date(value).toISOString()}
function mapExperiment(row:ExperimentRow):LearningExperiment{return{id:row.id,organizationId:row.organization_id,recommendationId:row.recommendation_id,...(row.context_snapshot_id?{contextSnapshotId:row.context_snapshot_id}:{}),baselineHash:row.baseline_hash,candidateConfig:row.candidate_config,candidateConfigHash:row.candidate_config_hash,status:row.status,baselineMetrics:row.baseline_metrics??{},candidateMetrics:row.candidate_metrics??{},comparison:row.comparison??{},...(row.golden_corpus_hash?{goldenCorpusHash:row.golden_corpus_hash}:{}),...(row.golden_gate_passed!==null?{goldenGatePassed:row.golden_gate_passed}:{}),productionEffectsObserved:false,...(row.failure_reason?{failureReason:row.failure_reason}:{}),createdBy:row.created_by,createdAt:iso(row.created_at)}}
function mapPromotion(row:PromotionRow):LearningPromotionRequest{return{id:row.id,organizationId:row.organization_id,recommendationId:row.recommendation_id,experimentId:row.experiment_id,changeType:row.change_type,targetKey:row.target_key,requestedChange:row.requested_change,requestedChangeHash:row.requested_change_hash,status:row.status,requestedBy:row.requested_by,...(row.decided_by?{decidedBy:row.decided_by}:{}),...(row.decided_at?{decidedAt:iso(row.decided_at)}:{}),createdAt:iso(row.created_at)}}
