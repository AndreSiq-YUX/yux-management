import {expect,it,vi} from 'vitest'
import type pg from 'pg'
import {upsertAdminLlmRoute} from '../src/modules/platform/adminRepository.js'
const path='../src/modules/platform/llm-routing.js',api=await import(path) as Record<string,any>
it('accepts Perplexity only for research and rejects cross-protocol fallbacks',()=>{
 const input={agentType:'radar_deep_research',kind:'research',protocol:'perplexity-agent-v1',provider:'perplexity',modelName:'fixture/research',fallbackRoutes:[{provider:'perplexity',modelName:'fixture/backup'}]}
 expect(api.validateLlmRouteCapability(input,api.TECHNICAL_LLM_USE_CASES)).toMatchObject({kind:'research',protocol:'perplexity-agent-v1'})
 expect(()=>api.validateLlmRouteCapability({...input,provider:'openrouter'},api.TECHNICAL_LLM_USE_CASES)).toThrow('llm_route_capability_incompatible')
 expect(()=>api.validateLlmRouteCapability({...input,fallbackRoutes:[{provider:'openrouter',modelName:'fixture/chat'}]},api.TECHNICAL_LLM_USE_CASES)).toThrow('llm_route_capability_incompatible')
 expect(()=>api.validateLlmRouteCapability({...input,agentType:'global_llm',kind:'chat',protocol:'openai-compatible-v1'},api.TECHNICAL_LLM_USE_CASES)).toThrow('llm_route_capability_incompatible')
})
it('resolves registered capabilities instead of guessing by embedding names and rejects misspelled technical cases',()=>{
 expect(api.resolveUseCaseDefinition).toBeTypeOf('function')
 const definitions=[{key:'custom_vector',title:'Vetor',description:'',kind:'embedding',group:'Teste'}]
 expect(api.isEmbeddingUseCase('custom_vector',definitions)).toBe(true)
 expect(api.isEmbeddingUseCase('knowledge_embeddings',[{key:'knowledge_embeddings',kind:'chat'}])).toBe(false)
 expect(()=>api.resolveUseCaseDefinition('radar_initial_trage',definitions)).toThrow('llm_use_case_unknown')
 expect(api.resolveUseCaseDefinition('radar_initial_triage',api.TECHNICAL_LLM_USE_CASES)).toMatchObject({kind:'decision'})
})
it('lists an unknown saved legacy route as pending, never silently as chat',async()=>{
 const pool={query:vi.fn(async(sql:string)=>({rows:sql.includes('DISTINCT agent_type')?[{agent_type:'legacy_unknown'}]:[]}))} as unknown as pg.Pool
 const cases=await api.getAdminLlmUseCases(pool)
 expect(cases.find((item:any)=>item.key==='legacy_unknown')).toMatchObject({kind:null,classificationStatus:'pending'})
})
it('validates decision protocols and rejects another provider or a duplicate fallback before saving',()=>{
 expect(api.validateLlmRouteCapability).toBeTypeOf('function')
 const definitions=api.TECHNICAL_LLM_USE_CASES,input={agentType:'radar_initial_triage',kind:'decision',protocol:'openrouter-decisions-alpha-v1',provider:'openrouter',modelName:'fixture/decision',fallbackRoutes:[{provider:'openrouter',modelName:'fixture/fallback'}]}
 expect(api.validateLlmRouteCapability(input,definitions)).toMatchObject({kind:'decision',protocol:'openrouter-decisions-alpha-v1'})
 expect(()=>api.validateLlmRouteCapability({...input,provider:'openai_direct'},definitions)).toThrow('llm_route_capability_incompatible')
 expect(()=>api.validateLlmRouteCapability({...input,kind:'chat'},definitions)).toThrow('llm_route_capability_incompatible')
 expect(()=>api.validateLlmRouteCapability({...input,fallbackRoutes:[{provider:'openrouter',modelName:input.modelName}]},definitions)).toThrow('llm_route_fallback_cycle')
})
it('rejects a misspelled decision use case at the repository boundary, not only in the form',async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('INSERT')?[{id:'fixture',agent_type:'radar_initial_trage'}]:[]}))
 await expect(upsertAdminLlmRoute({connect:async()=>({query,release(){}})} as unknown as pg.Pool,{agentType:'radar_initial_trage',provider:'openrouter',modelName:'fixture/decision'})).rejects.toThrow('llm_use_case_unknown')
 expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false)
})
