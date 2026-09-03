import { hashCanonical, type Queryable } from './repository.js'
import type {
  LearningRecommendation,
  LearningRecommendationStatus,
  LearningRecommendationType,
  MissionLearningMemory,
} from './types.js'

type OutcomeRow = {
  mission_id: string
  organization_id: string
  mission_status: string
  mission_version: number | string
  pack_key: string
  pack_version: string
  evaluations: Array<Record<string, unknown>>
  approvals: Array<Record<string, unknown>>
  action_counts: Record<string, unknown>
  economics: Record<string, unknown>
}

type MemoryRow = {
  id: string; organization_id: string; mission_id: string; pack_key: string; pack_version: string
  outcome_hash: string; summary: Record<string, unknown>; evidence_ids: string[]
  review_status: 'pending' | 'approved' | 'rejected'; reviewed_by: string | null
  reviewed_at: string | Date | null; created_at: string | Date
}

type RecommendationRow = {
  id: string; organization_id: string; mission_id: string; memory_summary_id: string
  recommendation_type: LearningRecommendationType; target_key: string; rationale: string
  evidence_ids: string[]; expected_impact: Record<string, string>; recommendation_hash: string
  status: LearningRecommendationStatus; decided_by: string | null; decided_at: string | Date | null
  created_at: string | Date
}

export type LearningRecommendationCandidate = Omit<LearningRecommendation, 'id' | 'organizationId' | 'missionId' | 'memorySummaryId' | 'recommendationHash' | 'status' | 'createdAt'>

export function buildLearningRecommendationCandidate(input: {
  packKey: string
  missionStatus: string
  evaluations: Array<Record<string, unknown>>
  approvals: Array<Record<string, unknown>>
  evidenceIds: string[]
}): LearningRecommendationCandidate {
  const decisions = input.evaluations.map(item => String(item.decision ?? ''))
  const approvalStatuses = input.approvals.map(item => String(item.status ?? ''))
  let recommendationType: LearningRecommendationType = 'knowledge_candidate'
  let rationale = 'Reutilizar o padrão de execução e resultado como memória operacional revisável.'
  let expectedImpact: Record<string,string> = { consistency: 'increase', planningLatency: 'decrease' }

  if (input.missionStatus === 'failed' || decisions.includes('replan')) {
    recommendationType = 'pack_change'
    rationale = 'Revisar a topologia ou os limites do pack porque a missão falhou ou exigiu replanejamento.'
    expectedImpact = { invalidPlans: 'decrease', completionRate: 'increase' }
  } else if (approvalStatuses.some(status => ['rejected','changes_requested'].includes(status))) {
    recommendationType = 'prompt_change'
    rationale = 'Avaliar instruções de planejamento porque decisões humanas rejeitaram ou solicitaram mudanças.'
    expectedImpact = { rejectionRate: 'decrease', humanIntervention: 'decrease' }
  } else if (decisions.includes('pause')) {
    recommendationType = 'policy_change'
    rationale = 'Revisar o envelope ou guardrail que provocou contenção, sem alterar a política automaticamente.'
    expectedImpact = { incidents: 'decrease', safeCompletionRate: 'increase' }
  }

  return {
    recommendationType,
    targetKey: input.packKey,
    rationale,
    evidenceIds: [...new Set(input.evidenceIds)].sort(),
    expectedImpact,
  }
}

export async function recordCompletedMissionLearning(client: Queryable, input: {
  organizationId: string
  missionId: string
}): Promise<{ memory: MissionLearningMemory; recommendation: LearningRecommendation; created: boolean }> {
  const outcomeResult = await client.query<OutcomeRow>(OUTCOME_QUERY, [input.missionId, input.organizationId])
  const outcome = outcomeResult.rows[0]
  if (!outcome) throw new Error('mission_not_found')
  if (!['succeeded','failed','expired','cancelled'].includes(outcome.mission_status)) throw new Error('mission_learning_requires_terminal_mission')

  const evaluations = sanitizeCollection(outcome.evaluations)
  const approvals = sanitizeCollection(outcome.approvals)
  const evidenceIds = [...new Set([
    ...evaluations.map(item => String(item.id ?? '')).filter(Boolean),
    ...approvals.map(item => String(item.id ?? '')).filter(Boolean),
  ])].sort()
  const summary = {
    schemaVersion: 1,
    terminalStatus: outcome.mission_status,
    missionVersion: Number(outcome.mission_version),
    pack: { key: outcome.pack_key, version: outcome.pack_version },
    actionCounts: sanitizeRecord(outcome.action_counts),
    economics: sanitizeRecord(outcome.economics),
    evaluationPatterns: evaluations.map(item => ({
      id: item.id, checkpointKey: item.checkpointKey, decision: item.decision,
      metrics: sanitizeRecord(asRecord(item.metrics)), economics: sanitizeRecord(asRecord(item.economics)),
    })),
    approvalPatterns: approvals.map(item => ({ id: item.id, type: item.type, status: item.status })),
  }
  const outcomeHash = hashCanonical({ organizationId: input.organizationId, missionId: input.missionId, summary, evidenceIds })
  const insertedMemory = await client.query<MemoryRow>(
    `INSERT INTO public.action_mission_memory_summaries
       (organization_id,mission_id,pack_key,pack_version,outcome_hash,summary,evidence_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (organization_id,mission_id,outcome_hash) DO NOTHING RETURNING *`,
    [input.organizationId,input.missionId,outcome.pack_key,outcome.pack_version,outcomeHash,summary,evidenceIds],
  )
  const memoryRow = insertedMemory.rows[0] ?? (await client.query<MemoryRow>(
    `SELECT * FROM public.action_mission_memory_summaries
     WHERE organization_id=$1 AND mission_id=$2 AND outcome_hash=$3 LIMIT 1`,
    [input.organizationId,input.missionId,outcomeHash],
  )).rows[0]
  if (!memoryRow) throw new Error('mission_learning_memory_insert_failed')

  const candidate = buildLearningRecommendationCandidate({
    packKey: outcome.pack_key, missionStatus: outcome.mission_status, evaluations, approvals, evidenceIds,
  })
  const recommendationHash = hashCanonical({
    organizationId: input.organizationId, missionId: input.missionId, memorySummaryId: memoryRow.id, ...candidate,
  })
  const insertedRecommendation = await client.query<RecommendationRow>(
    `INSERT INTO public.action_learning_recommendations
       (organization_id,mission_id,memory_summary_id,recommendation_type,target_key,rationale,evidence_ids,expected_impact,recommendation_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (organization_id,recommendation_hash) DO NOTHING RETURNING *`,
    [input.organizationId,input.missionId,memoryRow.id,candidate.recommendationType,candidate.targetKey,
      candidate.rationale,candidate.evidenceIds,candidate.expectedImpact,recommendationHash],
  )
  const recommendationRow = insertedRecommendation.rows[0] ?? (await client.query<RecommendationRow>(
    `SELECT * FROM public.action_learning_recommendations
     WHERE organization_id=$1 AND recommendation_hash=$2 LIMIT 1`,
    [input.organizationId,recommendationHash],
  )).rows[0]
  if (!recommendationRow) throw new Error('mission_learning_recommendation_insert_failed')
  return { memory: mapMemory(memoryRow), recommendation: mapRecommendation(recommendationRow), created: Boolean(insertedMemory.rows[0]) }
}

export async function processCompletedMissionLearning(client: Queryable, limit = 50) {
  const candidates = await client.query<{ mission_id: string; organization_id: string }>(
    `SELECT mission.id AS mission_id,mission.organization_id
     FROM public.action_missions mission
     WHERE mission.status IN ('succeeded','failed','expired','cancelled')
       AND NOT EXISTS (
         SELECT 1 FROM public.action_mission_memory_summaries memory
         WHERE memory.mission_id=mission.id AND memory.organization_id=mission.organization_id
       )
     ORDER BY mission.ended_at NULLS LAST,mission.id LIMIT $1`, [Math.max(1, Math.min(limit, 200))],
  )
  let created = 0
  for (const candidate of candidates.rows) {
    const result = await recordCompletedMissionLearning(client, {
      organizationId:candidate.organization_id,missionId:candidate.mission_id,
    })
    if (result.created) created += 1
  }
  return { candidates:candidates.rows.length,created }
}

export async function reviewMissionLearningMemory(client: Queryable, input: {
  organizationId: string; memoryId: string; decision: 'approved' | 'rejected'; actorId: string
}): Promise<MissionLearningMemory> {
  const result = await client.query<MemoryRow>(
    `UPDATE public.action_mission_memory_summaries SET review_status=$3,reviewed_by=$4,reviewed_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND organization_id=$2 AND review_status='pending' RETURNING *`,
    [input.memoryId,input.organizationId,input.decision,input.actorId],
  )
  if (!result.rows[0]) throw new Error('mission_learning_memory_not_pending')
  return mapMemory(result.rows[0])
}

export async function listMissionLearning(client: Queryable, input: {
  organizationId: string; status?: LearningRecommendationStatus; limit?: number
}): Promise<{ memories: MissionLearningMemory[]; recommendations: LearningRecommendation[] }> {
  const limit = Math.max(1,Math.min(input.limit ?? 100,200))
  const [memory,recommendation] = await Promise.all([
    client.query<MemoryRow>(
      `SELECT * FROM public.action_mission_memory_summaries WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [input.organizationId,limit],
    ),
    client.query<RecommendationRow>(
      `SELECT * FROM public.action_learning_recommendations WHERE organization_id=$1
       AND ($2::TEXT IS NULL OR status=$2) ORDER BY created_at DESC LIMIT $3`,
      [input.organizationId,input.status ?? null,limit],
    ),
  ])
  return { memories:memory.rows.map(mapMemory),recommendations:recommendation.rows.map(mapRecommendation) }
}

const OUTCOME_QUERY = `SELECT mission.id AS mission_id,mission.organization_id,mission.status AS mission_status,
  mission.version AS mission_version,COALESCE(mission.pack_selection->>'supervisorKey',pack.key) AS pack_key,
  version.semantic_version AS pack_version,
  COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',evaluation.id::TEXT,'checkpointKey',evaluation.checkpoint_key,
    'decision',evaluation.decision,'metrics',evaluation.metric_snapshot,'economics',evaluation.economics_snapshot)
    ORDER BY evaluation.evaluated_at) FROM public.action_evaluations evaluation
    WHERE evaluation.mission_id=mission.id AND evaluation.organization_id=mission.organization_id),'[]'::JSONB) AS evaluations,
  COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',approval.id::TEXT,'type',approval.approval_type,'status',approval.status)
    ORDER BY approval.created_at) FROM public.action_approvals approval
    WHERE approval.mission_id=mission.id AND approval.organization_id=mission.organization_id),'[]'::JSONB) AS approvals,
  JSONB_BUILD_OBJECT(
    'total',(SELECT COUNT(*) FROM public.action_runs run WHERE run.mission_id=mission.id),
    'succeeded',(SELECT COUNT(*) FROM public.action_runs run WHERE run.mission_id=mission.id AND run.status='succeeded'),
    'failed',(SELECT COUNT(*) FROM public.action_runs run WHERE run.mission_id=mission.id AND run.status='failed'),
    'blocked',(SELECT COUNT(*) FROM public.action_runs run WHERE run.mission_id=mission.id AND run.status='blocked')
  ) AS action_counts,
  JSONB_BUILD_OBJECT(
    'actualCostBrl',COALESCE((SELECT SUM(entry.amount_brl) FROM public.action_cost_entries entry
      WHERE entry.mission_id=mission.id AND entry.organization_id=mission.organization_id AND entry.nature IN ('actual','reversal')),0)::TEXT,
    'humanMinutes',COALESCE((SELECT SUM(entry.human_minutes) FROM public.action_cost_entries entry
      WHERE entry.mission_id=mission.id AND entry.organization_id=mission.organization_id AND entry.nature IN ('actual','reversal')),0)::TEXT
  ) AS economics
 FROM public.action_missions mission
 JOIN public.action_pack_versions version ON version.id=mission.pack_version_id
 JOIN public.action_packs pack ON pack.id=version.pack_id
 WHERE mission.id=$1 AND mission.organization_id=$2 LIMIT 1`

function sanitizeCollection(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.slice(0,100).map(item=>sanitizeRecord(asRecord(item))) : []
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const denied = /email|phone|address|message|prompt|secret|token|credential|body|name/i
  return Object.fromEntries(Object.entries(value).filter(([key])=>!denied.test(key)).map(([key,item])=>[
    key,Array.isArray(item)?item.slice(0,50).map(value=>typeof value==='object'?sanitizeRecord(asRecord(value)):value):
      item&&typeof item==='object'?sanitizeRecord(asRecord(item)):item,
  ]))
}

function asRecord(value: unknown): Record<string, unknown> { return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{} }
function iso(value: string|Date) { return value instanceof Date?value.toISOString():new Date(value).toISOString() }
function mapMemory(row: MemoryRow): MissionLearningMemory { return {
  id:row.id,organizationId:row.organization_id,missionId:row.mission_id,packKey:row.pack_key,packVersion:row.pack_version,
  outcomeHash:row.outcome_hash,summary:row.summary,evidenceIds:row.evidence_ids??[],reviewStatus:row.review_status,
  ...(row.reviewed_by?{reviewedBy:row.reviewed_by}:{}),...(row.reviewed_at?{reviewedAt:iso(row.reviewed_at)}:{}),createdAt:iso(row.created_at),
} }
function mapRecommendation(row: RecommendationRow): LearningRecommendation { return {
  id:row.id,organizationId:row.organization_id,missionId:row.mission_id,memorySummaryId:row.memory_summary_id,
  recommendationType:row.recommendation_type,targetKey:row.target_key,rationale:row.rationale,evidenceIds:row.evidence_ids??[],
  expectedImpact:row.expected_impact??{},recommendationHash:row.recommendation_hash,status:row.status,
  ...(row.decided_by?{decidedBy:row.decided_by}:{}),...(row.decided_at?{decidedAt:iso(row.decided_at)}:{}),createdAt:iso(row.created_at),
} }
