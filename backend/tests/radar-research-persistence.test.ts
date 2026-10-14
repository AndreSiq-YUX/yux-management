import { expect, it, vi } from 'vitest'
import type { AuthUser } from '../src/auth/routes.js'
import type { AppEnv } from '../src/config/env.js'
import { executeRadarCandidateResearch, startRadarCandidateResearch, getRadarCandidateResearch } from '../src/modules/radar/research-service.js'

const admin={id:'admin',role:'yux_admin'} as AuthUser
class ResearchPool {
  queries:Array<{sql:string;params:unknown[]}>=[]
  enabled=true; quota=0; revision=2; approved=false
  researchConfiguration:Record<string,unknown>={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true}}
  run:Record<string,any>|undefined
  payload:Record<string,unknown>={cnpj:'12345678000190',tradeName:'Empresa Alfa',city:'Curitiba',state:'PR',phoneRaw:'4133334444',analysisRevision:1,discoveryRevision:1}
  async connect(){return{query:this.query.bind(this),release(){}}}
  async query(sql:string,params:unknown[]=[]):Promise<{rows:any[]}> {
    this.queries.push({sql,params})
    if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)||sql.includes('pg_advisory_xact_lock'))return{rows:[]}
    if(sql.includes('SELECT candidate.*, campaign.search_configuration'))return{rows:params[1]==='org'?[{id:'candidate',organization_id:'org',campaign_id:'campaign',title:'Empresa Alfa',status:'pending_review',normalized_payload:this.payload,search_configuration:this.researchConfiguration,configuration_revision:this.revision,campaign_status:'draft',target_segment:'Serviços',offer_type:'Automação',product_focus:[],target_cnaes:[]}]:[]}
    if(sql.includes('JOIN public.model_routing_rules rule'))return{rows:[{model_name:'fixture-admin-model',provider:'openrouter',max_input_tokens:16000,max_output_tokens:4000,fallback_routes:[]}]}
    if(sql.includes('SELECT organization.client_id'))return{rows:[{client_id:'client',contract_id:'contract'}]}
    if(sql.includes("agent_type='radar_business_qualification'"))return{rows:[{id:'route'}]}
    if(sql.includes("agent_type='radar_presence_resolution'"))return{rows:[{id:'route'}]}
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
    if(sql.includes('UPDATE public.radar_candidate_records')){this.payload=JSON.parse(String(params[2]));return{rows:[]}}
    if(sql.includes('INSERT INTO public.radar_b2b_'))return{rows:[]}
    if(sql.includes('FROM public.radar_site_tls_exceptions'))return{rows:[]}
    throw new Error(`Unexpected fixture query: ${sql}`)
  }
}
const start=(pool:ResearchPool,organizationId='org',configurationRevision=2)=>startRadarCandidateResearch(pool as never,admin,{organizationId,candidateId:'candidate',configurationRevision})
const pages=[{url:'https://alfa.example',observedAt:'2026-10-08',text:'Empresa Alfa CNPJ 12.345.678/0001-90',html:'<a href="tel:41999998888">Contato</a>'}]
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
it('uses the selected Serper key, preserves provenance and respects the shared fallback cap',async()=>{
  for(const cap of [1,2]){
    const pool=new ResearchPool()
    pool.researchConfiguration={sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,webSearchProviders:['serper_web_search','brave_web_search'],maxSearchQueriesPerCandidate:cap}}
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
