import { readFileSync } from 'node:fs'
import { describe,expect,it,vi } from 'vitest'
import { compareShadowMetrics,createShadowExperiment,decideShadowExperiment,validateShadowCandidateConfig } from '../src/modules/action-engine/experiments.js'

describe('Mission learning shadow experiments',()=>{
  it('rejects any candidate field that could grant execution authority',()=>{
    for(const candidate of [
      {provider:'meta'},{tools:['send']},{nested:{capabilityKey:'email.send'}},{credential:'secret'},{webhookUrl:'https://example.com'},
    ])expect(()=>validateShadowCandidateConfig(candidate)).toThrow('shadow_candidate_mutation_field_forbidden')
    expect(()=>validateShadowCandidateConfig({hypothesis:'Melhorar clareza',promptVersionCandidate:'v2'})).not.toThrow()
  })

  it('compares baseline and candidate without producing effects',()=>{
    expect(compareShadowMetrics({quality:'0.8',totalCost:'5',latency:'100'},{quality:'0.9',totalCost:'4',latency:'90'})).toMatchObject({passed:true})
    expect(compareShadowMetrics({quality:'0.8'},{quality:'0.7'})).toMatchObject({passed:false,regressions:['quality']})
  })

  it('creates a tenant-scoped experiment and only updates recommendation workflow state',async()=>{
    const query=vi.fn(async(sql:string,params?:unknown[])=>{
      if(sql.includes('FROM public.action_learning_recommendations recommendation'))return{rows:[{recommendation_hash:'a'.repeat(64),summary:{economics:{totalCost:'5'},actionCounts:{succeeded:'4'}},context_snapshot_id:'snapshot-1'}]}
      if(sql.includes('INSERT INTO public.action_learning_experiments'))return{rows:[experimentRow({candidate_config:params?.[4],candidate_config_hash:params?.[5],baseline_hash:params?.[3],baseline_metrics:params?.[6]})]}
      if(sql.includes('UPDATE public.action_learning_recommendations'))return{rows:[]}
      throw new Error(sql)
    })
    const experiment=await createShadowExperiment({query} as never,{organizationId:'org-1',recommendationId:'recommendation-1',candidateConfig:{hypothesis:'Teste'},createdBy:'user-1'})
    expect(experiment.status).toBe('queued')
    expect(experiment.productionEffectsObserved).toBe(false)
    expect(JSON.stringify(query.mock.calls)).not.toMatch(/action_capability_policies|provider_connections|action_runs/)
  })

  it('blocks promotion without successful comparison and golden gate',async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('SELECT experiment.*'))return{rows:[{...experimentRow({golden_gate_passed:false,comparison:{passed:true},status:'completed'}),recommendation_type:'prompt_change',target_key:'mission_supervisor'}]}
      throw new Error(sql)
    })
    await expect(decideShadowExperiment({query} as never,{organizationId:'org-1',experimentId:'experiment-1',decision:'approved',actorId:'user-1'})).rejects.toThrow('learning_experiment_promotion_gate_failed')
  })

  it('stores a versioned promotion request instead of overwriting a published artifact',()=>{
    const sql=readFileSync(new URL('../src/db/migrations/0147_mission_learning_experiments.sql',import.meta.url),'utf8')
    expect(sql).toContain('action_learning_promotion_requests')
    expect(sql).toContain('production_effects_observed BOOLEAN NOT NULL DEFAULT FALSE CHECK (production_effects_observed = FALSE)')
    expect(sql).not.toMatch(/UPDATE public\.(action_pack_versions|action_capability_policies|knowledge_entries)/)
  })
})

function experimentRow(change:Record<string,unknown>={}){return{
  id:'experiment-1',organization_id:'org-1',recommendation_id:'recommendation-1',context_snapshot_id:'snapshot-1',baseline_hash:'b'.repeat(64),
  candidate_config:{hypothesis:'Teste'},candidate_config_hash:'c'.repeat(64),status:'queued',baseline_metrics:{quality:'0.8'},candidate_metrics:{},comparison:{},
  golden_corpus_hash:null,golden_gate_passed:null,production_effects_observed:false,failure_reason:null,created_by:'user-1',created_at:'2026-08-31T00:00:00Z',...change,
}}
