import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { addCompanyStrategyToMissionPlanning } from '../../src/modules/action-engine/mission-company-strategy.js'
import { requestMissionPlan } from '../../src/modules/action-engine/planner.js'
import { RADAR_PROSPECTING_PACK_V1 } from '../../src/modules/action-engine/packs/radar-prospecting-v1.js'
import { createActionEngineCapabilityRegistry } from '../../src/modules/action-engine/capabilities/index.js'

it('radar_plan_retains_company_strategy_revision in the actual runtime request', async () => {
  const rig=await createIntegrationRig({queueMode:'stub'})
  const pool=createContextAwarePool(new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_worker')}),'worker')
  const root=`/api/company-intelligence/organizations/${rig.ids.organizationA}/strategies`
  try {
    const draft=await rig.request('client_admin_A','POST',root,{expectedVersion:null,idempotencyKey:randomUUID(),content:{schemaVersion:1,title:'Prospecção regional com Radar',objective:'Pesquisar empresas com aderência à oferta',summary:'Priorizar empresas atendidas pela operação comercial.',sections:[{id:randomUUID(),kind:'constraints',title:'Região',body:'Somente Paraná com atendimento confirmado.',agentUse:'internal'}],references:{productIds:[],documentIds:[]}}})
    const published=await rig.request('client_admin_A','POST',`${root}/${draft.body.id}/publish`,{expectedVersion:draft.body.version,revisionId:draft.body.draftRevision.id,expectedContentHash:draft.body.draftRevision.contentHash,idempotencyKey:randomUUID()})
    await rig.request('client_admin_A','POST',`${root}/${draft.body.id}/primary`,{expectedVersion:published.body.version})
    await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[rig.ids.organizationA],serviceRole:'worker'},async()=>{
      const context=await addCompanyStrategyToMissionPlanning(pool,{organizationId:rig.ids.organizationA,contractId:rig.ids.contractA,query:'Prospecção regional com Radar',context:{companyContext:{},knowledgeItems:[],sourceIds:[],contextHash:'a'.repeat(64)}})
      const {parameters:_schema,...pack}=RADAR_PROSPECTING_PACK_V1
      let captured:any
      await requestMissionPlan({YUX_AGENT_RUNTIME_URL:'http://runtime.test',YUX_AGENT_RUNTIME_TOKEN:'test'}, {organization_id:rig.ids.organizationA,mission:{id:'test-mission'},action_pack:pack,pack_catalog:[pack],readiness:{ready:true},capabilities:createActionEngineCapabilityRegistry().listMetadata().filter(item=>pack.allowedCapabilities.some(allowed=>allowed.key===item.key)),strategy_context:{companyContext:context.companyContext,knowledgeItems:context.knowledgeItems},allowed_source_ids:context.sourceIds},async(_url,init)=>{captured=JSON.parse(String(init?.body));return new Response(JSON.stringify({kind:'clarification'}),{status:200})})
      expect(captured.strategy_context.companyContext.company_strategy_context.selected[0].revisionId).toBe(draft.body.draftRevision.id)
      expect(captured.allowed_source_ids).toContain(draft.body.draftRevision.id)
      expect(captured.strategy_context.knowledgeItems.find((item:any)=>item.id===draft.body.draftRevision.id).content).toContain('Somente Paraná')
      expect(captured.strategy_context.knowledgeItems.find((item:any)=>item.id===draft.body.draftRevision.id).sourceId).toBeUndefined()
    })
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally {await pool.end();await rig.close()}
})
