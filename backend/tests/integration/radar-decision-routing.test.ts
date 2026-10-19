import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {captureFixture,connectionString,organizationId} from '../support/radar-capture-fixture.js'
import {upsertAdminLlmRoute,getAdminLlmRouteById} from '../../src/modules/platform/adminRepository.js'
import {getAdminLlmUseCases} from '../../src/modules/platform/llm-routing.js'
describe.skipIf(!connectionString)('decision capability persistence with isolated PostgreSQL',()=>{
 it('saves and reloads scoped principal/fallback/protocol, versions edits, and rejects typo without another row',async()=>{
  const f=await captureFixture();let id:string|undefined
  try{
   const input={agentType:'radar_initial_triage',organizationId,provider:'openrouter',modelName:'fixture/primary',kind:'decision' as const,protocol:'openrouter-decisions-alpha-v1',fallbackRoutes:[{provider:'openrouter',modelName:'fixture/fallback'}]}
   const first=await upsertAdminLlmRoute(f.pool,input);id=first.id
   expect(await getAdminLlmRouteById(f.pool,id!)).toMatchObject({kind:'decision',protocol:input.protocol,modelName:input.modelName,fallbackRoutes:input.fallbackRoutes,version:1})
   expect(await upsertAdminLlmRoute(f.pool,{...input,id,modelName:'fixture/new-primary'})).toMatchObject({id,version:2})
   await expect(upsertAdminLlmRoute(f.pool,{...input,agentType:'radar_initial_trage'})).rejects.toThrow('llm_use_case_unknown')
   expect((await f.pool.query("SELECT COUNT(*) AS n FROM model_routing_rules WHERE agent_type='radar_initial_trage'")).rows[0].n).toBe('0')
  }finally{if(id)await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1',[id]);await f.close()}
 })
 it('keeps registered legacy chat/embedding writers compatible, and unknown saved cases visibly pending',async()=>{
  const f=await captureFixture(),key=`legacy_${randomUUID().replaceAll('-','')}`,ids:string[]=[]
  try{
   for(const agentType of ['support_assistant','knowledge_embeddings',key])ids.push((await f.pool.query("INSERT INTO model_routing_rules(agent_type,organization_id,provider,model_name) VALUES($1,$2,'openrouter','fixture/legacy') RETURNING id",[agentType,organizationId])).rows[0].id)
   expect((await f.pool.query('SELECT kind,protocol FROM model_routing_rules WHERE id=$1',[ids[0]])).rows[0]).toEqual({kind:'chat',protocol:'openai-compatible-v1'})
   expect((await f.pool.query('SELECT kind FROM model_routing_rules WHERE id=$1',[ids[1]])).rows[0].kind).toBe('embedding')
   expect((await getAdminLlmUseCases(f.pool)).find(item=>item.key===key)).toMatchObject({kind:null,classificationStatus:'pending'})
  }finally{await f.pool.query('DELETE FROM model_routing_rules WHERE id=ANY($1::uuid[])',[ids]);await f.close()}
 })
})
