import { expect, it, vi } from 'vitest'
import {createHash} from 'node:crypto'
import {classifyRadarSource} from '../src/modules/radar/source-identity.js'
import {canonicalRadarAnalysisEvidence} from '../src/modules/radar/evidence-version.js'
import type { AuthUser } from '../src/auth/routes.js'
import type { AppEnv } from '../src/config/env.js'
import { executeRadarCandidateResearch, startRadarCandidateResearch, getRadarCandidateResearch } from '../src/modules/radar/research-service.js'

const admin={id:'admin',role:'yux_admin'} as AuthUser
class ResearchPool {
  queries:Array<{sql:string;params:unknown[]}>=[]
  enabled=true; quota=0; revision=2; approved=false; routesEnabled=true
  researchConfiguration:Record<string,unknown>={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true}}
  run:Record<string,any>|undefined
  payload:Record<string,unknown>={cnpj:'12345678000190',tradeName:'Empresa Alfa',city:'Curitiba',state:'PR',phoneRaw:'4133334444',analysisRevision:1,discoveryRevision:1}
  receiptResult:unknown
  receiptStatus='completed'
  receiptEffect:Record<string,unknown>|undefined
  async connect(){return{query:this.query.bind(this),release(){}}}
  async query(sql:string,params:unknown[]=[]):Promise<{rows:any[]}> {
    this.queries.push({sql,params})
    if(sql.includes('FROM public.radar_capture_items'))return{rows:[]}
    if(sql.includes('FROM public.radar_research_request_items'))return{rows:[]}
    if(sql.includes('FROM public.radar_analysis_receipts'))return{rows:this.receiptResult||this.receiptEffect||this.receiptStatus==='rejected_before_provider'?[{result:this.receiptResult,status:this.receiptStatus,...this.receiptEffect}]:[]}
    if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)||sql.includes('pg_advisory_xact_lock'))return{rows:[]}
    if(sql.includes('SELECT candidate.*, campaign.search_configuration'))return{rows:params[1]==='org'?[{id:'candidate',organization_id:'org',campaign_id:'campaign',title:'Empresa Alfa',status:'pending_review',normalized_payload:this.payload,search_configuration:this.researchConfiguration,configuration_revision:this.revision,campaign_status:'draft',target_segment:'Serviços',offer_type:'Automação',product_focus:[],target_cnaes:[]}]:[]}
    if(sql.includes('JOIN public.model_routing_rules rule'))return{rows:this.routesEnabled?[{model_name:'fixture-admin-model',provider:'openrouter',max_input_tokens:16000,max_output_tokens:4000,fallback_routes:[]}]:[]}
    if(sql.includes('SELECT organization.client_id'))return{rows:[{client_id:'client',contract_id:'contract'}]}
    if(sql.includes("agent_type='radar_business_qualification'"))return{rows:this.routesEnabled?[{id:'route'}]:[]}
    if(sql.includes("agent_type='radar_presence_resolution'"))return{rows:this.routesEnabled?[{id:'route'}]:[]}
    if(sql.includes("kind = 'yux'"))return{rows:[{allowed:true}]}
    if(sql.includes('FROM public.app_users'))return{rows:[admin]}
    if(sql.includes('FROM public.radar_campaigns'))return{rows:[{search_configuration:this.researchConfiguration,configuration_revision:this.revision,status:'draft',daily_limit:10,budget_limit:1}]}
    if(sql.includes('FROM public.platform_provider_connections'))return{rows:[{id:'brave',status:'active',has_secret:true,public_config:{retentionLicensed:true,credentialPurpose:'licensed_retention',webSearchLicensed:true}}]}
    if(sql.includes('FROM public.radar_data_sources'))return{rows:[{id:params[0],source_type:params[0],source_key:params[0],enabled:this.enabled,default_cost_per_unit:.01,rate_limit_per_day:10}]}
    if(sql.includes('FROM public.radar_source_usage_counters'))return{rows:[{units:this.quota,estimated_cost:0,cost:0}]}
    if(sql.includes('INSERT INTO public.radar_source_usage_counters')){this.quota++;return{rows:[]}}
    if(sql.includes('FROM public.radar_b2b_reviews'))return{rows:this.approved?[{approved_at:'2026-10-08'}]:[]}
    if(sql.includes('INSERT INTO public.radar_candidate_research_runs')){this.run={id:'run',organization_id:'org',campaign_id:'campaign',candidate_id:'candidate',requested_by:'admin',configuration_revision:this.revision,status:'queued',stage:'discovery',output:{},calls:{},created_at:new Date().toISOString()};return{rows:[this.run]}}
    if(sql.includes('FROM public.radar_candidate_research_runs'))return{rows:this.run&&(!sql.includes('request_id=$3')||this.run.request_id===params[2])&&(!sql.includes("status IN ('queued','running')")||['queued','running'].includes(this.run.status))?[this.run]:[]}
    if(sql.includes('UPDATE public.radar_candidate_research_runs')) {
      if(!this.run)return{rows:[]}
      if(sql.includes("status='running'")){if(this.run.lease_id||this.run.status==='succeeded'||params[2]!=='org')return{rows:[]};this.run.status='running';this.run.lease_id=params[1]}
      if(sql.includes("status='queued'"))this.run.status='queued'
      if(sql.includes('calls=$3'))this.run.calls=JSON.parse(String(params[2]))
      if(sql.includes('output = $3'))this.run.output=JSON.parse(String(params[2]))
      if(sql.includes('stage=$3')){this.run.stage=params[2];this.run.output=JSON.parse(String(params[3]))}
      if(sql.includes("status='blocked'")){this.run.status='blocked';this.run.error_code=params[2];this.run.lease_id=undefined}
      if(sql.includes('output=$3')){this.run.output=JSON.parse(String(params[2]));this.run.status=params[3];this.run.completed_at=new Date().toISOString();this.run.lease_id=undefined}
      return{rows:[this.run]}
    }
    if(sql.includes('SELECT status,normalized_payload FROM public.radar_candidate_records'))return{rows:[{status:'pending_review',normalized_payload:this.payload}]}
    if(sql.includes('UPDATE public.radar_candidate_records')){if(params[3]&&JSON.stringify(this.payload)!==String(params[3]))return{rows:[]};this.payload=JSON.parse(String(params[2]));return{rows:[{id:'candidate'}]}}
    if(sql.includes('INSERT INTO public.radar_b2b_'))return{rows:[]}
    if(sql.includes('FROM public.radar_site_tls_exceptions'))return{rows:[]}
    throw new Error(`Unexpected fixture query: ${sql}`)
  }
}
it('revalidates a completed raw profile receipt claim by claim without another AI or search call',async()=>{
 const pool=new ResearchPool()
 pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,semanticQualificationEnabled:true,profileEnabled:true}}
 const run=await start(pool)
 pool.run!.output={readingComplete:true,readerVersion:4,discoveryLocked:true,pages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
 const runtime=vi.fn().mockRejectedValue(Error('response lost'))
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime})
 pool.receiptResult={targetStatus:'review',productFit:'unknown',reasons:[],evidenceIds:[],limitations:[],profile:{services:[],scaleSignals:[{value:'900 unidades',evidenceId:'page-0',excerpt:pages[0].text,metric:'units',amount:900}]}}
 await start(pool)
 const web=vi.fn()
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web})
 expect(runtime).toHaveBeenCalledTimes(1)
 expect(web).not.toHaveBeenCalled()
 expect(pool.run!.output.qualification).toMatchObject({targetStatus:'review',productFit:'unknown'})
 expect(pool.run!.output.profile.scaleSignals).toEqual([])
 expect(pool.run!.output.limitations).toContain('radar_profile_claims_rejected')
})
const start=(pool:ResearchPool,organizationId='org',configurationRevision=2)=>startRadarCandidateResearch(pool as never,admin,{organizationId,candidateId:'candidate',configurationRevision})
const pages=[{url:'https://alfa.example',observedAt:'2026-10-08',text:'Empresa Alfa CNPJ 12.345.678/0001-90',html:'<a href="tel:41999998888">Contato</a>'}]
it('does not publish over a human correction made while research was running',async()=>{
 const pool=new ResearchPool(),run=await start(pool)
 pool.run!.output={readingComplete:true,readerVersion:4,discoveryLocked:true,pages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
 pool.researchConfiguration={research:{enabled:true,semanticQualificationEnabled:true}}
 const runtime=vi.fn(async()=>{pool.payload={...pool.payload,manualNote:'Correção humana preservada'};return{targetStatus:'review',productFit:'unknown',reasons:[],evidenceIds:[],limitations:[]}})
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime:runtime as never})
 expect(pool.payload.manualNote).toBe('Correção humana preservada')
 expect(pool.queries.some(item=>item.sql.includes('UPDATE public.radar_candidate_records'))).toBe(false)
 expect(pool.run).toMatchObject({status:'blocked',error_code:'radar_research_projection_changed'})
})
it.each([false,true])('recovers received analysis/citation bindings without another paid call (pre-A1 metadata=%s)',async oldMetadata=>{
 const pool=new ResearchPool()
 pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,semanticQualificationEnabled:true}}
 const run=await start(pool)
 const savedPages=canonicalRadarAnalysisEvidence([pages[0],{...pages[0],url:'https://alfa.example/contato',text:`${pages[0].text}. Contato institucional.`}]).map(({id:_id,...page})=>page).reverse()
 pool.run!.output={readingComplete:true,readerVersion:4,discoveryLocked:true,pages:savedPages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
 let source=''
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime:(async(_env:unknown,_path:string,body:Record<string,any>)=>{source=body.evidence[0].source_url;throw Error('agent_runtime_422:radar_qualification_invalid_json')}) as never})
 if(oldMetadata)delete pool.run!.calls.semantic.requestBindings
 pool.receiptStatus='uncertain'
 pool.receiptEffect={input_hash:'c'.repeat(64),input_request:{client_id:'client',contract_id:'contract'},effect_id:'protected-received-response',transport_outcome:'received',validation_outcome:'invalid',failure_code:'radar_qualification_invalid_json'}
 pool.routesEnabled=false
 const runtime=vi.fn(async(_env:unknown,path:string,body:Record<string,unknown>)=>{
  expect(path).toBe('/radar/revalidate')
  expect(body).toMatchObject({organization_id:'org',action:'radar_business_qualification',input_hash:'c'.repeat(64)})
  return{targetStatus:'review',productFit:'possible',reasons:[],evidenceIds:['page-0'],evidenceSources:[{id:'page-0',sourceUrl:source}],limitations:[]}
 }),web=vi.fn()
 await start(pool)
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime:runtime as never,web})
 expect(runtime).toHaveBeenCalledTimes(1)
 expect(web).not.toHaveBeenCalled()
 expect(pool.run!.calls.semantic.status).toBe('completed')
 expect(pool.run!.output.qualification).toMatchObject({productFit:'possible'})
 const expected=`page-${savedPages.findIndex(page=>new URL(page.url).href===new URL(source).href)}`
 expect(pool.run!.output.qualification.evidenceIds).toEqual([expected])
 expect(pool.run!.output.qualification.evidenceSources[0].id).toBe(expected)
})
it.each(['presence','semantic'] as const)('rebinds a legacy %s receipt after reread/order change without buying another analysis',async key=>{
 const pool=new ResearchPool()
 pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,presenceResolutionEnabled:key==='presence',semanticQualificationEnabled:key==='semantic'}}
 const run=await start(pool)
 const oldPages=key==='presence'?[{url:'https://brand.example/',observedAt:'2026-10-08',text:'Empresa Alfa é nossa razão social.'},{url:'https://other.example/',observedAt:'2026-10-08',text:'Outra página pública.'}]:[pages[0],{...pages[0],url:'https://alfa.example/contato',text:`${pages[0].text}. Contato institucional.`}]
 const identity={name:'Empresa Alfa',legalName:undefined,cnpj:'12345678000190',city:'Curitiba',state:'PR',address:undefined,phone:'4133334444'}
 const oldEvidence=oldPages.map((page,index)=>({id:`page-${index}`,url:page.url,text:page.text,observedAt:page.observedAt,kind:classifyRadarSource(page.url,{text:page.text}).kind}))
 const hash=createHash('sha256').update(JSON.stringify(key==='presence'?{identity,evidence:oldEvidence}:{pages:oldPages.map(({url,text})=>({url,text})),profile:false,size:false})).digest('hex')
 const result=key==='presence'?{candidateId:'page-0',scope:'group',reason:'A página identifica a marca e razão social.',claims:[{evidenceId:'page-0',excerpt:oldPages[0].text}]}:{targetStatus:'review',productFit:'possible',reasons:[],evidenceIds:['page-0'],limitations:[]}
 pool.run!.calls[key]={status:'completed',source:key==='presence'?'radar_presence_resolution':'radar_business_qualification',evidenceHash:hash,result}
 pool.run!.output={readingComplete:false,readerVersion:4,discoveryLocked:true,pages:oldPages,discovery:{association:'review',websiteUrl:oldPages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
 const runtime=vi.fn(),web=vi.fn()
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web,collect:async()=>[...oldPages].reverse().map(page=>({...page,observedAt:'2026-10-19'}))})
 expect(runtime).not.toHaveBeenCalled();expect(web).not.toHaveBeenCalled()
 expect(pool.run!.calls[key]).toMatchObject({evidenceHash:hash,evidenceVersion:{hashVersion:2,aliases:[hash]}})
 if(key==='presence')expect(pool.run!.output.presenceResolution).toMatchObject({websiteUrl:oldPages[0].url,scope:'group'})
 else expect(pool.run!.output.qualification).toMatchObject({productFit:'possible'})
 expect(pool.run!.output.analysisEvidence[key].hashVersion).toBe(2)
 const paidResult=JSON.parse(JSON.stringify(pool.run!.calls[key].result))
 pool.run!.output.presenceResolution=undefined;pool.run!.output.presenceEvidenceHash=undefined
 pool.run!.output.qualification=undefined;pool.run!.output.qualificationEvidenceHash=undefined;pool.run!.output.analysisEvidence=undefined
 pool.run!.status='partial'
 await start(pool)
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web,collect:async()=>[...oldPages].reverse().map(page=>({...page,observedAt:'2026-10-19'}))})
 expect(pool.run!.calls[key].result).toEqual(paidResult)
 expect(runtime).not.toHaveBeenCalled()
 if(key==='presence')expect(pool.run!.output.presenceResolution?.websiteUrl).toBe(oldPages[0].url)
 else expect(pool.run!.output.qualification?.productFit).toBe('possible')
})
it('preserves an unbindable old receipt and explains missing material instead of replaying it',async()=>{
 const pool=new ResearchPool()
 pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,semanticQualificationEnabled:true}}
 const run=await start(pool)
 const receipt={status:'completed',source:'radar_business_qualification',evidenceHash:'old-material-unavailable',result:{targetStatus:'review',productFit:'possible',reasons:[],evidenceIds:[],limitations:[]}}
 pool.run!.calls.semantic={...receipt}
 pool.run!.output={readingComplete:false,readerVersion:4,discoveryLocked:true,pages:[],discovery:{association:'review',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
 const runtime=vi.fn()
 await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web:vi.fn(),collect:async()=>pages})
 expect(runtime).not.toHaveBeenCalled()
 expect(pool.run!.calls.semantic).toEqual(receipt)
 expect(JSON.stringify(pool.run!.output.limitations)).toContain('radar_analysis_legacy_material_missing')
 expect(pool.run!.output.qualification).toBeUndefined()
})
it('consolidates legacy dossier contacts on read, retaining sources without rewriting history',async()=>{
  const pool=new ResearchPool();await start(pool)
  const contact={kind:'email',value:'compras@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-15',association:'confirmed',scope:'establishment',purpose:'suppliers'}
  pool.run!.status='partial';pool.run!.output={siteAssociation:'confirmed',pages:[],discovery:{websiteUrl:contact.sourceUrl,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1},contacts:[contact,{...contact,sourceUrl:'https://alfa.example/fornecedor/'}]}
  const result=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(result.run!.output.contacts).toHaveLength(1)
  expect(result.run!.output.contacts![0].sources).toHaveLength(2)
  expect(pool.run!.output.contacts).toHaveLength(2)
})
it('does not expose a historical directory as an associated website in the complete dossier',async()=>{
  const pool=new ResearchPool();await start(pool)
  const url='https://unknown-directory.example/alfa'
  pool.run!.status='partial';pool.run!.output={siteAssociation:'confirmed',pages:[{url,text:'Dados cadastrais da empresa Alfa CNPJ 12.345.678/0001-90',observedAt:'2026-10-15'}],contacts:[],
    discovery:{websiteUrl:url,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1},
    presenceResolution:{websiteUrl:url,scope:'establishment',reason:'Old unsupported link',claims:[]},qualification:{targetStatus:'confirmed',productFit:'high',reasons:[],evidenceIds:[],limitations:[]},profile:{summary:'Unsupported derived profile'}}
  const result=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(result.run!.output.discovery!.websiteUrl).toBeUndefined()
  expect(result.run!.output.siteAssociation).toBe('review')
  expect(result.run!.output.presenceResolution?.scope).not.toBe('establishment')
  expect(result.run!.output.qualification).toBeUndefined()
  expect(result.run!.output.profile).toBeUndefined()
  expect(result.run!.output.historicalDerivedConclusions).toMatchObject({qualification:{targetStatus:'confirmed'}})
  expect(pool.run!.output.discovery.websiteUrl).toBe(url)
})
it.each(['presence','semantic'] as const)('recovers a lost pre-provider %s rejection receipt and retries only the analysis',async key=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,presenceResolutionEnabled:key==='presence',semanticQualificationEnabled:key==='semantic'}}
  const run=await start(pool)
  const savedPages=key==='presence'?[{url:'https://brand.example/',observedAt:'2026-10-15',text:'Marca Beta. Empresa Alfa é nossa razão social.'}]:pages
  pool.run!.output={readingComplete:true,readerVersion:4,discoveryLocked:true,pages:savedPages,discovery:{association:'review',websiteUrl:savedPages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  const result=key==='presence'?{candidateId:'page-0',scope:'group',reason:'A razão social consta na página.',claims:[{evidenceId:'page-0',excerpt:'Empresa Alfa é nossa razão social.'}]}:{targetStatus:'review',productFit:'possible',reasons:[],evidenceIds:[],limitations:[]}
  const runtime=vi.fn().mockRejectedValueOnce(Error('request timed out')).mockResolvedValue(result)
  const collect=vi.fn(async()=>savedPages),web=vi.fn()
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,collect,web})
  expect(pool.run!.calls[key].status).toBe('reserved')
  pool.receiptStatus='rejected_before_provider'
  await start(pool)
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,collect,web})
  expect(runtime).toHaveBeenCalledTimes(2)
  expect(pool.run!.calls[key].status).toBe('completed')
  expect(web).not.toHaveBeenCalled()
})
it.each([true,false])('recovers a completed durable analysis receipt without replay even with routes enabled=%s',async routesEnabled=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,semanticQualificationEnabled:true}}
  const run=await start(pool)
  pool.run!.output={readingComplete:true,discoveryLocked:true,pages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  const result={targetStatus:'review',productFit:'possible',reasons:[],evidenceIds:[],limitations:[]}
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime:async()=>result as never})
  pool.run!.status='partial';pool.run!.calls.semantic={...pool.run!.calls.semantic,status:'reserved',result:undefined}
  pool.run!.output.qualification=undefined;pool.run!.output.qualificationEvidenceHash=undefined
  pool.receiptResult=result
  pool.routesEnabled=routesEnabled
  await start(pool)
  const runtime=vi.fn(async()=>{throw Error('must_not_call_provider')})
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime})
  expect(pool.run!.output.qualification).toMatchObject({productFit:'possible'})
  expect(runtime).not.toHaveBeenCalled()
})
it('still rejects a new analysis without its route before contacting the runtime',async()=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,semanticQualificationEnabled:true}}
  const run=await start(pool)
  pool.run!.output={readingComplete:true,readerVersion:4,discoveryLocked:true,pages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  pool.routesEnabled=false
  const runtime=vi.fn(async()=>{throw Error('must_not_call_provider')})
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime})
  expect(pool.run!.output.limitations).toContain('Qualificação semântica pendente (radar_qualification_explicit_route_required). Os fatos foram preservados.')
  expect(pool.run!.output.qualification).toBeUndefined()
  expect(runtime).not.toHaveBeenCalled()
})
it('tries the authorized fallback when the first source only returns external references, preserving both sources',async()=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,webSearchProviders:['serper_web_search','brave_web_search'],maxSearchQueriesPerCandidate:3}}
  const run=await start(pool)
  const result=await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{loadSecret:async()=> 'test-only',
    web:async input=>input.provider==='serper_web_search'?[{url:'https://unknown.example/guia/alfa',title:'Empresa Alfa',snippets:['CNPJ 12345678000190'],observedAt:'2026-10-15'}]:[{url:'https://alfa.example/',title:'Empresa Alfa',snippets:['CNPJ 12345678000190'],observedAt:'2026-10-15'}],
    collect:async()=>pages})
  expect(pool.quota).toBe(2)
  expect(pool.run!.output.discovery.hits.map((hit:{url:string})=>hit.url)).toContain('https://alfa.example/')
  expect(pool.run!.output.discovery.hits.map((hit:{url:string})=>hit.url)).toContain('https://unknown.example/guia/alfa')
})
it('filters association-owned contacts from the current dossier without rewriting historical evidence',async()=>{
  const pool=new ResearchPool();await start(pool)
  const official={url:'https://alfa.example/',text:'Empresa Alfa CNPJ 12.345.678/0001-90',observedAt:'2026-10-14'}
  const association={url:'https://association.example/',text:'Associação. Empresa Alfa é associada.',observedAt:'2026-10-14'}
  pool.run!.status='partial';pool.run!.output={siteAssociation:'confirmed',pages:[official,association],
    discovery:{websiteUrl:official.url,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1},contacts:[
      {kind:'email',value:'compras@alfa.example',sourceUrl:official.url,observedAt:official.observedAt,association:'confirmed'},
      {kind:'email',value:'secretaria@association.example',sourceUrl:association.url,observedAt:association.observedAt,association:'review'},
      {kind:'email',value:'social@association.example',sourceUrl:'https://facebook.com/association',linkedFromUrl:association.url,observedAt:association.observedAt,association:'review'}]}
  const dossier=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(dossier.run!.output.contacts!.map(contact=>contact.value)).toEqual(['compras@alfa.example'])
  expect(dossier.run!.output.pages).toHaveLength(2)
  expect(pool.run!.output.contacts).toHaveLength(3)
})
it.each([
  ['presence','radar_ai_wallet_missing'],['semantic','radar_ai_wallet_missing'],
  ['presence','radar_ai_credits_insufficient'],['semantic','radar_ai_credits_insufficient'],
] as const)('persists %s %s pre-provider rejection and resumes only the missing analysis',async(key,code)=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,
    presenceResolutionEnabled:key==='presence',semanticQualificationEnabled:key==='semantic'}}
  const run=await start(pool)
  const savedPages=key==='presence'?[{url:'https://brand.example/',observedAt:'2026-10-14',text:'Marca Beta. Empresa Alfa é nossa razão social.'}]:pages
  pool.run!.output={readingComplete:true,discoveryLocked:true,pages:savedPages,
    discovery:{association:'review',websiteUrl:savedPages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  const result=key==='presence'?{candidateId:'page-0',scope:'group',reason:'A razão social consta na página institucional.',claims:[{evidenceId:'page-0',excerpt:'Empresa Alfa é nossa razão social.'}]}:
    {targetStatus:'review',productFit:'possible',reasons:[],evidenceIds:[],limitations:[]}
  const runtime=vi.fn().mockRejectedValueOnce(Error(`agent_runtime_402:${code}`)).mockResolvedValue(result)
  const web=vi.fn(),collect=vi.fn()
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web,collect})
  expect(pool.run!.calls[key]).toMatchObject({status:'rejected_before_provider',error:code})
  expect(JSON.stringify(pool.run!.output.limitations)).toContain(code)
  expect(pool.run!.output.pages).toHaveLength(1)
  await start(pool)
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web,collect})
  expect(pool.run!.calls[key]).toMatchObject({status:'completed',rejections:[expect.objectContaining({error:code})]})
  expect(runtime).toHaveBeenCalledTimes(2)
  expect(web).not.toHaveBeenCalled();expect(collect).not.toHaveBeenCalled()
})
it.each(['agent_runtime_402:openrouter_credit_required','agent_runtime_402','agent_runtime_402:private_detail.with-punctuation','request timed out'])(
  'does not replay uncertain or external presence failure %s',async failure=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,presenceResolutionEnabled:true}}
  const run=await start(pool)
  pool.run!.output={readingComplete:true,discoveryLocked:true,pages:[{url:'https://brand.example/',observedAt:'2026-10-14',text:'Marca Beta. Empresa Alfa é nossa razão social.'}],
    discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1}}
  const runtime=vi.fn().mockRejectedValue(Error(failure))
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web:vi.fn()})
  expect(pool.run!.calls.presence.status).toBe('reserved')
  const warnings=JSON.stringify(pool.run!.output.limitations)
  if(failure.includes('private_detail')){expect(warnings).toContain('agent_runtime_402');expect(warnings).not.toContain('private_detail')}
  if(failure.includes('openrouter_credit_required'))expect(warnings).toContain('openrouter_credit_required')
  await start(pool)
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web:vi.fn()})
  expect(runtime).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(pool.run!.output.limitations)).toContain('radar_presence_previous_request_uncertain')
})
it('marks a typed request-validation rejection as pre-provider, without treating generic 422 as safe to retry',async()=>{
 for(const failure of ['agent_runtime_422:radar_request_invalid','agent_runtime_422:radar_qualification_invalid_json']){
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,semanticQualificationEnabled:true}}
  const run=await start(pool)
  pool.run!.output={readingComplete:true,readerVersion:4,discoveryLocked:true,pages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  const runtime=vi.fn().mockRejectedValue(Error(failure))
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime})
  expect(pool.run!.calls.semantic.status).toBe(failure.endsWith('radar_request_invalid')?'rejected_before_provider':'reserved')
 }
})
it('hides legacy directory contacts from the current dossier without changing stored history',async()=>{
  const pool=new ResearchPool();await start(pool)
  pool.run!.status='partial';pool.run!.output={contacts:[{kind:'social',value:'https://instagram.com/serasa',sourceUrl:'https://serasaexperian.com.br/consulta-gratis/123',observedAt:'2026-09-01',association:'review'}],
    discovery:{websiteUrl:'https://empresadois.com.br/cnpj/12345678000190',association:'confirmed',hits:[],suggestions:[],limitations:[],queries:3}}
  const result=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(result.run!.output.contacts).toEqual([])
  expect(result.run!.output.discovery!.websiteUrl).toBeUndefined()
  expect(pool.run!.output.contacts).toHaveLength(1)
  expect(result).toHaveProperty('methodVersion',2)
})
it('persists a readable discovered site as pending rather than losing it when identity is unresolved',async()=>{
  const pool=new ResearchPool(),run=await start(pool)
  pool.run!.operation='reanalyze';pool.run!.output={analysisOnly:true,discoveryLocked:true,readingComplete:true,
    pages:[{url:'https://alfa.example/',text:'Alfa soluções empresariais. Fale com a equipe.',observedAt:'2026-10-14'}],
    discovery:{websiteUrl:'https://alfa.example/',association:'review',hits:[],suggestions:[],limitations:[],queries:1}}
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web:vi.fn(),collect:vi.fn()})
  expect(pool.payload.publicPresence).toMatchObject({configurationRevision:2,website:{url:'https://alfa.example/',association:'review',readable:true}})
  expect(pool.payload.websiteUrl).toBeUndefined()
  expect(pool.payload.publicContacts).toEqual([])
})
it('retains saved contradictory activity evidence while adding read-only presence signals',async()=>{
  const pool=new ResearchPool();await start(pool)
  pool.run!.status='partial';pool.run!.output={siteAssociation:'review',pages:[{url:'https://alfa.example/',text:'Alfa contato público',observedAt:'2026-10-14'}],discovery:{websiteUrl:'https://alfa.example/',association:'review',hits:[],suggestions:[],limitations:[],queries:1},activity:{status:'possible_closure',signals:[{kind:'closure',sourceUrl:'https://alfa.example/noticia',excerpt:'Encerramos nossas atividades.',observedAt:'2026-10-14'}],limitation:'Conferir sinal anterior'}}
  const result=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(result.run!.output.activity?.status).toBe('possible_closure')
  expect(result.run!.output.activity?.signals).toHaveLength(1)
})
it('returns an older dossier as historical evidence rather than current identity confirmation',async()=>{
  const pool=new ResearchPool();await start(pool)
  pool.run!.configuration_revision=1;pool.run!.status='succeeded';pool.run!.output={siteAssociation:'confirmed',discovery:{websiteUrl:'https://alfa.example/',association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1},pages:[{url:'https://alfa.example/',text:'Empresa Alfa',observedAt:'2026-10-14'}],contacts:[{kind:'email',value:'old@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-14',association:'confirmed',scope:'establishment'}]}
  const result=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(result.run!.output.siteAssociation).toBe('review')
  expect(result.run!.output.contacts![0].association).toBe('review')
  expect(pool.run!.output.siteAssociation).toBe('confirmed')
})
it('reanalysis removes a directory website and stale contacts from projection while retaining historical evidence',async()=>{
  const pool=new ResearchPool(),run=await start(pool)
  pool.payload.websiteUrl='https://empresadois.com.br/cnpj/12345678000190'
  pool.payload.publicContacts=[{kind:'phone',value:'+551145047000',sourceUrl:pool.payload.websiteUrl}]
  pool.run!.operation='reanalyze'
  pool.run!.output={analysisOnly:true,discoveryLocked:true,readingComplete:true,contacts:pool.payload.publicContacts,pages:[{url:String(pool.payload.websiteUrl),text:'CNPJ 12.345.678/0001-90. Rodapé',observedAt:'2026-09-01'}],
    discovery:{websiteUrl:pool.payload.websiteUrl,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:3}}
  const web=vi.fn(),collect=vi.fn()
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web,collect})
  expect(pool.payload.websiteUrl).toBeUndefined();expect(pool.payload.publicContacts).toEqual([])
  expect(pool.run!.output.methodVersion).toBe(2)
  expect(pool.run!.output.pages[0].observedAt).toBe('2026-09-01')
  expect(web).not.toHaveBeenCalled();expect(collect).not.toHaveBeenCalled()
  expect(pool.queries.some(item=>/DELETE FROM public.radar_b2b_evidence/.test(item.sql))).toBe(false)
})
it('persists evidence-bound brand identity and does not replay an uncertain presence call',async()=>{
  for(const uncertain of [false,true]){
    const pool=new ResearchPool()
    pool.researchConfiguration={research:{enabled:true,presenceResolutionEnabled:true,webSearchEnabled:true,maxSearchQueriesPerCandidate:1}}
    const run=await start(pool)
    pool.run!.output={readingComplete:true,discoveryLocked:true,discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1},
      pages:[{url:'https://brand.example/',observedAt:'2026-10-13',text:'Marca Beta. Empresa Alfa é nossa razão social.',html:'<a href="mailto:compras@brand.example">Fornecedores</a>'}]}
    if(uncertain)pool.run!.calls.presence={source:'radar_presence_resolution',status:'reserved'}
    const runtime=vi.fn().mockResolvedValue({candidateId:'page-0',scope:'group',reason:'A razão social é apresentada pela marca.',claims:[{evidenceId:'page-0',excerpt:'Empresa Alfa é nossa razão social.'}]})
    await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web:vi.fn()})
    expect(runtime).toHaveBeenCalledTimes(uncertain?0:1)
    if(!uncertain){
      expect(pool.payload.websiteUrl).toBe('https://brand.example/');expect(pool.payload.publicContacts).toContainEqual(expect.objectContaining({value:'compras@brand.example',scope:'group'}))
      await start(pool)
      await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime,web:vi.fn()})
      expect(runtime).toHaveBeenCalledTimes(1)
      expect(pool.run!.output.limitations.join(' ')).not.toContain('radar_presence_refresh_authorization_required')
      expect(pool.payload.publicContacts).toContainEqual(expect.objectContaining({value:'compras@brand.example',scope:'group'}))
    }
    else expect(pool.run!.output.limitations).toContainEqual(expect.stringContaining('radar_presence_previous_request_uncertain'))
  }
})
it('uses the selected Serper key, preserves provenance and respects an explicit aggregate cap',async()=>{
  for(const cap of [1,2]){
    const pool=new ResearchPool()
    pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,webSearchProviders:['serper_web_search','brave_web_search'],maxSearchQueriesPerCandidate:cap,maxSearchQueriesTotalPerCandidate:cap}}
    const run=await start(pool),attempts:string[]=[]
    await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{loadSecret:async()=> 'fixture',collect:async()=>pages,
      web:async input=>{attempts.push(input.provider!);if(input.provider==='serper_web_search')throw Error('radar_serper_web_http_503');return[{url:pages[0].url,title:'Empresa Alfa',snippets:['12.345.678/0001-90'],observedAt:'2026-10-13'}]}})
    expect(attempts).toEqual(cap===1?['serper_web_search']:['serper_web_search','brave_web_search'])
    expect(pool.quota).toBe(cap)
    expect(pool.queries.some(item=>item.sql.includes('WHERE provider_key=$1')&&item.params[0]==='serper')).toBe(true)
    if(cap===2)expect(pool.payload.websiteUrl).toBe('https://alfa.example')
  }
})
it('retains Brave provenance when reanalysis reuses facts without making provider calls',async()=>{
  const pool=new ResearchPool(),run=await start(pool)
  pool.payload.researchUsesBrave=true;pool.run!.operation='reanalyze'
  pool.run!.output={analysisOnly:true,discoveryLocked:true,readingComplete:true,pages,
    discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web:vi.fn()})
  expect(pool.payload.researchUsesBrave).toBe(true)
})
it('preserves link-only contacts across partial reanalysis and resume without web or reader calls',async()=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,semanticQualificationEnabled:true}}
  const run=await start(pool)
  pool.run!.operation='reanalyze'
  pool.run!.output={analysisOnly:true,discoveryLocked:true,readingComplete:true,pages:pages.map(({html:_html,...page})=>page),
    contacts:[{kind:'email',value:'compras@alfa.example',association:'confirmed',sourceUrl:pages[0].url,observedAt:'2026-10-08'}],
    discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  const web=vi.fn(),collect=vi.fn(),runtime=vi.fn().mockResolvedValue({targetStatus:'review',productFit:'unknown',reasons:[],evidenceIds:[],limitations:['Conferência da atividade ainda pendente.']})
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web,collect,runtime})
  expect(pool.run!.status).toBe('partial')
  expect(pool.run!.output.contacts).toContainEqual(expect.objectContaining({value:'compras@alfa.example'}))
  await start(pool)
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web,collect,runtime})
  expect(pool.payload.publicContacts).toContainEqual(expect.objectContaining({value:'compras@alfa.example'}))
  expect(web).not.toHaveBeenCalled();expect(collect).not.toHaveBeenCalled()
})
it('deduplicates_double_click_and_reprocesses_previously_inconclusive_candidate_without_cnpja_call',async()=>{
  const pool=new ResearchPool()
  const first=await start(pool),second=await start(pool)
  expect(second.runId).toBe(first.runId);expect(second.reused).toBe(true)
  expect(pool.queries.filter(item=>item.sql.includes('INSERT INTO public.radar_candidate_research_runs'))).toHaveLength(1)
  const web=vi.fn(async()=>[{url:'https://alfa.example/',title:'Alfa',snippets:['12.345.678/0001-90'],observedAt:'2026-10-08'}])
  await executeRadarCandidateResearch(pool as never,{SESSION_SECRET:'fixture'} as AppEnv,{runId:first.runId,organizationId:'org'},undefined,{web,loadSecret:async()=> 'fixture',collect:async()=>pages})
  expect(pool.run?.status).toBe('succeeded')
  expect(pool.payload.phoneRaw).toBe('4133334444')
  expect(pool.payload.sitePhones).toContain('+5541999998888')
  expect(pool.payload.discoveryRevision).toBe(1);expect(pool.payload.researchRevision).toBe(2)
  expect(web).toHaveBeenCalledTimes(1)
  const usage=pool.queries.findIndex(item=>item.sql.includes('INSERT INTO public.radar_source_usage_counters'))
  expect(usage).toBeGreaterThan(-1)
  expect(pool.quota).toBe(1)
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:first.runId,organizationId:'org'},undefined,{web})
  expect(web).toHaveBeenCalledTimes(1)
  const result=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(result.run?.output.pages?.[0]).not.toHaveProperty('html')
  expect(pool.queries.some(item=>/INSERT INTO public.(leads|omnichannel_messages)|cnpja_advanced_search/.test(item.sql))).toBe(false)
})
it('does_not_skip_after_source_becomes_available_and_stops_before_request_when_budget_is_exhausted',async()=>{
  const pool=new ResearchPool();pool.enabled=false
  await expect(start(pool)).rejects.toThrow('radar_research_unavailable')
  pool.enabled=true;const run=await start(pool);pool.quota=10
  const web=vi.fn()
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web})
  expect(web).not.toHaveBeenCalled()
  expect(pool.queries.some(item=>item.sql.includes('INSERT INTO public.radar_source_usage_counters'))).toBe(false)
})
it('refuses_cross_tenant_access_rejects_changed_campaign_and_preserves_approved_candidates',async()=>{
  const pool=new ResearchPool()
  await expect(start(pool,'other')).rejects.toThrow('radar_candidate_not_found')
  await expect(start(pool,'org',3)).rejects.toThrow('radar_campaign_configuration_changed')
  pool.approved=true
  await expect(start(pool)).rejects.toThrow('radar_research_approved_candidate_requires_review')
  expect(pool.run).toBeUndefined()
})
it('recovers_paid_response_before_discovery_checkpoint_without_rebilling',async()=>{
  const pool=new ResearchPool(),run=await start(pool)
  pool.run!.calls={cached:{status:'completed',source:'brave_web_search',result:[{url:'https://alfa.example/',title:'Alfa',snippets:['12.345.678/0001-90'],observedAt:'2026-10-08'}]}}
  const web=vi.fn()
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web,collect:async()=>pages})
  expect(web).not.toHaveBeenCalled();expect(pool.payload.sitePhones).toContain('+5541999998888')
  expect(pool.run?.status).toBe('succeeded')
})
it('exposes_expired_worker_lease_as_retryable_without_modifying_saved_facts',async()=>{
  const pool=new ResearchPool();await start(pool)
  pool.run!.status='running';pool.run!.lease_until='2020-01-01T00:00:00Z'
  const result=await getRadarCandidateResearch(pool as never,admin,'org','candidate')
  expect(result.run?.status).toBe('blocked')
  expect(result.run?.error_code).toBe('radar_research_worker_interrupted_retry_available')
  expect(pool.payload.phoneRaw).toBe('4133334444')
})
it('allows recovery from saved discovery when search quota is exhausted, without another paid call',async()=>{
  const pool=new ResearchPool(),run=await start(pool)
  pool.quota=10;pool.run!.status='partial'
  pool.run!.output={readingComplete:true,discovery:{association:'review',websiteUrl:'https://alfa.example/',hits:[],suggestions:[],queries:1,limitations:[]},
    pages:[{url:'https://alfa.example/',observedAt:'2026-10-12',text:'',limitation:'robots_unavailable'}]}
  expect((await getRadarCandidateResearch(pool as never,admin,'org','candidate')).availability.allowed).toBe(true)
  await start(pool)
  const web=vi.fn()
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{web,collect:async()=>pages})
  expect(web).not.toHaveBeenCalled();expect(pool.quota).toBe(10)
  expect(pool.payload.websiteStatus).toBe('verified_present')
})
it('does not reuse the cached-read quota exemption to authorize a fresh paid generation',async()=>{
  const pool=new ResearchPool();await start(pool)
  pool.quota=10;pool.run!.status='partial';pool.run!.output={readingComplete:true,pages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],queries:1,limitations:[]}}
  expect((await getRadarCandidateResearch(pool as never,admin,'org','candidate')).availability.allowed).toBe(true)
  await expect(startRadarCandidateResearch(pool as never,admin,{organizationId:'org',candidateId:'candidate',configurationRevision:2,operation:'refresh',requestId:'fresh'})).rejects.toThrow('radar_research_unavailable')
})
it('refreshes completed semantic analysis only with explicit permission and never replays uncertain calls',async()=>{
  const pool=new ResearchPool()
  pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,profileEnabled:true}}
  const run=await start(pool)
  pool.run!.status='partial'
  pool.run!.output={readingComplete:true,pages,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}}
  pool.run!.calls={semantic:{status:'completed',source:'radar_business_qualification',evidenceHash:'old',result:{targetStatus:'review'}}}
  const runtime=vi.fn(async()=>({targetStatus:'review',productFit:'unknown',reasons:[],evidenceIds:[],limitations:[],profile:{services:[],customerSegments:[],operatingRegions:[],scaleSignals:[]}}))
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime:runtime as never})
  expect(runtime).not.toHaveBeenCalled()
  expect(JSON.stringify(pool.run!.output)).toContain('radar_qualification_refresh_authorization_required')
  await startRadarCandidateResearch(pool as never,admin,{organizationId:'org',candidateId:'candidate',configurationRevision:2,allowSemanticRefresh:true})
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime:runtime as never})
  expect(runtime).toHaveBeenCalledTimes(1)
  expect(pool.payload.companyProfile).toMatchObject({services:[]})
  expect(pool.run!.calls.semantic).toMatchObject({status:'completed'})
  pool.run!.status='partial';pool.run!.output.qualification=undefined;pool.run!.calls.semantic={status:'reserved',source:'radar_business_qualification'}
  await startRadarCandidateResearch(pool as never,admin,{organizationId:'org',candidateId:'candidate',configurationRevision:2,allowSemanticRefresh:true})
  await executeRadarCandidateResearch(pool as never,{} as AppEnv,{runId:run.runId,organizationId:'org'},undefined,{runtime:runtime as never})
  expect(runtime).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(pool.run!.output)).toContain('radar_qualification_previous_request_uncertain')
})
