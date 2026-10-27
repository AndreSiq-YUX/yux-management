import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {expect,it} from 'vitest'
import {createIntegrationRig} from './support/rig.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {handleWebsiteOnboarding} from '../../src/jobs/handlers/company-intelligence.js'
import type {AppEnv} from '../../src/config/env.js'
it('uses the persisted represented target through discovery, extraction, review and application',async()=>{
 const jobs:any[]=[]
 const rig=await createIntegrationRig({queueMode:'stub',stubJobQueue:{async add(_name,data){jobs.push(data);return{id:'test'}},async close(){}}})
 const raw=new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_worker')}),worker=createContextAwarePool(raw,'worker')
 const org=rig.ids.organizationA,root=`/api/company-intelligence/organizations/${org}`,url='https://example.test/catalogo'
 try{
  const brand=(await rig.request('client_admin_A','POST',`${root}/represented-businesses`,{name:'Marca do teste de worker',relationshipType:'both'})).body
  const before=(await rig.request('client_admin_A','GET',`${root}/profile`)).body
  const started=await rig.request('client_admin_A','POST',`${root}/website-onboarding`,{websiteUrl:url,maxPages:1,target:{kind:'represented_business',representedBusinessId:brand.id}})
  const content=`Catálogo sintético de massas ${randomUUID()}`
  await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[org],serviceRole:'worker'},()=>handleWebsiteOnboarding(worker,{} as AppEnv,{...jobs[0],target:{kind:'own_company'}},{
   discover:async()=>({rootUrl:url,pages:[{url,title:'Catálogo',content,description:'Massas',emails:[],phones:[]}],failedPages:0}),
   extract:async(_env,input)=>{expect(input.target).toEqual({kind:'represented_business',representedBusinessId:brand.id});return {suggestions:[{suggestion_kind:'profile',field_path:'tradeName',suggested_value:'Identidade que deve ser descartada',evidence_excerpt:content,source_url:url,confidence:0.9},{suggestion_kind:'profile',field_path:'description',suggested_value:'Catálogo de massas representadas',evidence_excerpt:content,source_url:url,confidence:0.9},{suggestion_kind:'product',field_path:'products',suggested_value:[{name:'Lasanha do worker',sku:'WORKER-1',packaging:'1 kg'}],evidence_excerpt:content,source_url:url,confidence:0.9}],warnings:[],provider:'synthetic',model:'synthetic',successfulBatches:1,failedPageUrls:[]}},
   index:async()=>undefined as never,
  }))
  const result=await rig.request('client_admin_A','GET',`${root}/website-onboarding/${started.body.run.id}`)
  expect(result.body.suggestions.map((item:any)=>item.fieldPath)).not.toContain('tradeName')
  expect(result.body.suggestions.map((item:any)=>item.fieldPath)).toContain('representedBusiness.description')
  const applied=await rig.request('client_admin_A','POST',`${root}/website-onboarding/${started.body.run.id}/apply`,{suggestionIds:result.body.suggestions.map((item:any)=>item.id)})
  expect(applied.statusCode).toBe(200)
  expect((await rig.request('client_admin_A','GET',`${root}/profile`)).body).toEqual(before)
  expect((await rig.request('client_admin_A','GET',`${root}/represented-businesses/${brand.id}/products`)).body.items[0].name).toBe('Lasanha do worker')
  const source=(await rig.sql('SELECT represented_business_id FROM public.knowledge_sources WHERE id=$1',[result.body.run.sourceId])).rows[0]
  expect(source.represented_business_id).toBe(brand.id)
  expect(await rig.providerCalls()).toHaveLength(0)
 }finally{await raw.end();await rig.close()}
})
