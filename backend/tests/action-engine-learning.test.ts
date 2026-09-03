import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildLearningRecommendationCandidate, recordCompletedMissionLearning } from '../src/modules/action-engine/learning.js'

const memoryRow = {
  id:'memory-1',organization_id:'11111111-1111-4111-8111-111111111111',mission_id:'22222222-2222-4222-8222-222222222222',
  pack_key:'campaign_launch',pack_version:'1.0.0',outcome_hash:'a'.repeat(64),summary:{terminalStatus:'succeeded'},
  evidence_ids:['evaluation-1'],review_status:'pending' as const,reviewed_by:null,reviewed_at:null,created_at:'2026-08-31T00:00:00Z',
}
const recommendationRow = {
  id:'recommendation-1',organization_id:memoryRow.organization_id,mission_id:memoryRow.mission_id,memory_summary_id:memoryRow.id,
  recommendation_type:'knowledge_candidate' as const,target_key:'campaign_launch',rationale:'Reutilizar padrão',evidence_ids:['evaluation-1'],
  expected_impact:{consistency:'increase'},recommendation_hash:'b'.repeat(64),status:'proposed' as const,
  decided_by:null,decided_at:null,created_at:'2026-08-31T00:00:00Z',
}

function database(duplicate=false) {
  let memoryInsert=0
  let recommendationInsert=0
  const query=vi.fn(async(sql:string,params?:unknown[])=>{
    if(sql.includes('FROM public.action_missions mission')&&sql.includes('mission_status')) return {rows:[{
      mission_id:memoryRow.mission_id,organization_id:memoryRow.organization_id,mission_status:'succeeded',mission_version:4,
      pack_key:'campaign_launch',pack_version:'1.0.0',evaluations:[{id:'evaluation-1',checkpointKey:'final',decision:'continue',metrics:{leads:5},economics:{actualCostBrl:'30'},hidden_prompt:'removed'}],
      approvals:[{id:'approval-1',type:'campaign_activation',status:'approved',message:'removed'}],action_counts:{total:'4',succeeded:'4'},economics:{actualCostBrl:'30'},
    }]}
    if(sql.includes('INSERT INTO public.action_mission_memory_summaries')) { memoryInsert+=1; return {rows:duplicate||memoryInsert>1?[]:[{...memoryRow,outcome_hash:String(params?.[4]),summary:params?.[5],evidence_ids:params?.[6]}]} }
    if(sql.includes('FROM public.action_mission_memory_summaries')&&sql.includes('outcome_hash=$3')) return {rows:[memoryRow]}
    if(sql.includes('INSERT INTO public.action_learning_recommendations')) { recommendationInsert+=1; return {rows:duplicate||recommendationInsert>1?[]:[{...recommendationRow,recommendation_hash:String(params?.[8]),rationale:String(params?.[5]),evidence_ids:params?.[6],expected_impact:params?.[7]}]} }
    if(sql.includes('FROM public.action_learning_recommendations')&&sql.includes('recommendation_hash=$2')) return {rows:[recommendationRow]}
    throw new Error(`unexpected query: ${sql}`)
  })
  return {query}
}

describe('governed Mission learning',()=>{
  it('creates one tenant-scoped sanitized memory and immutable recommendation',async()=>{
    const db=database()
    const result=await recordCompletedMissionLearning(db as never,{organizationId:memoryRow.organization_id,missionId:memoryRow.mission_id})
    expect(result.created).toBe(true)
    expect(result.recommendation.recommendationType).toBe('knowledge_candidate')
    const outcomeQuery = String(db.query.mock.calls[0]?.[0])
    expect(outcomeQuery).toContain('ORDER BY approval.created_at')
    expect(outcomeQuery).not.toContain('approval.requested_at')
    const serialized=JSON.stringify(db.query.mock.calls)
    expect(serialized).not.toContain('hidden_prompt')
    expect(serialized).not.toContain('message')
    expect(db.query.mock.calls.every(([,params])=>!params||params.includes(memoryRow.organization_id))).toBe(true)
    expect(serialized).not.toMatch(/UPDATE public\.(action_packs|action_pack_versions|action_capability_policies)/)
  })

  it('returns the existing outcome and recommendation on duplicate processing',async()=>{
    const result=await recordCompletedMissionLearning(database(true) as never,{organizationId:memoryRow.organization_id,missionId:memoryRow.mission_id})
    expect(result.created).toBe(false)
    expect(result.memory.id).toBe('memory-1')
    expect(result.recommendation.id).toBe('recommendation-1')
  })

  it('routes only evidence patterns to reviewable change types',()=>{
    expect(buildLearningRecommendationCandidate({packKey:'pack',missionStatus:'failed',evaluations:[],approvals:[],evidenceIds:[]}).recommendationType).toBe('pack_change')
    expect(buildLearningRecommendationCandidate({packKey:'pack',missionStatus:'succeeded',evaluations:[],approvals:[{status:'rejected'}],evidenceIds:[]}).recommendationType).toBe('prompt_change')
    expect(buildLearningRecommendationCandidate({packKey:'pack',missionStatus:'succeeded',evaluations:[{decision:'pause'}],approvals:[],evidenceIds:[]}).recommendationType).toBe('policy_change')
  })

  it('ships RLS, immutable recommendation content and approved-only context storage',()=>{
    const sql=readFileSync(new URL('../src/db/migrations/0146_mission_learning_recommendations.sql',import.meta.url),'utf8')
    expect(sql).toContain('private.guard_action_learning_content_immutable')
    expect(sql).toContain("review_status = 'approved'")
    expect(sql).toContain('private.rls_can_access_organization(organization_id)')
    expect(sql).not.toContain('public.user_profiles')
  })
})
