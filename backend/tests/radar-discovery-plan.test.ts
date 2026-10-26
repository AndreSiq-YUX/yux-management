import {expect,it} from 'vitest'
const path='../src/modules/radar/discovery-plan.js',api=await import(path).catch(()=>({})) as Record<string,any>
const sources=[{key:'serper_places',enabled:true,canPersist:true,canDeliver:true,available:true},{key:'serper_web_search',enabled:true,canPersist:true,canDeliver:true,available:true},{key:'osm_extract',enabled:true,canPersist:true,canDeliver:false,available:true},{key:'cnpja_advanced_search',enabled:true,canPersist:true,canDeliver:true,available:true}]
const base={segment:'Segmento configurado',states:['SP','PR'],cities:[],terms:['Termo adicional'],excludedTerms:['Excluir configurável'],sourceOrder:['serper_places','serper_web_search','osm_extract','cnpja_advanced_search'],sources,geography:{cities:[{city:'Cidade A',state:'SP',municipalityCode:'3500105'},{city:'Cidade B',state:'PR',municipalityCode:'4100103'}],completeStates:['SP','PR'],catalogVersion:'fixture-ibge-v1'},pipelineVersion:2,window:{size:100,offset:0}}
it('builds configurable terms and city/state scopes without forcing a city or a pilot preset',()=>{
 expect(api.buildRadarAdaptiveDiscoveryPlan).toBeTypeOf('function')
 const plan=api.buildRadarAdaptiveDiscoveryPlan(base)
 expect(plan).toMatchObject({pipelineVersion:2,countingMode:'qualified',catalogVersion:'fixture-ibge-v1'})
 expect(plan.scopes.some((scope:any)=>scope.source==='serper_web_search'&&scope.state==='SP')).toBe(true)
 expect(plan.scopes.some((scope:any)=>scope.source==='serper_places'&&scope.city==='Cidade A')).toBe(true)
 expect(JSON.stringify(plan)).toContain('Termo adicional');expect(JSON.stringify(plan)).not.toContain('cozinhas')
 expect(plan.omittedSources).toContainEqual({source:'osm_extract',reason:'delivery_not_authorized'})
})
it('does not persist transient Places or declare missing municipal coverage market exhaustion',()=>{
 const plan=api.buildRadarAdaptiveDiscoveryPlan({...base,sourceOrder:['serper_places'],sources:[{...sources[0],canPersist:false}],geography:{cities:[],completeStates:[],catalogVersion:'none'}})
 expect(plan.scopes).toEqual([]);expect(plan.omittedSources).toContainEqual({source:'serper_places',reason:'persistence_not_authorized'})
 const missing=api.buildRadarAdaptiveDiscoveryPlan({...base,sourceOrder:['serper_places'],geography:{cities:[],completeStates:[],catalogVersion:'none'}})
 expect(missing.coverageGaps).toEqual(expect.arrayContaining([expect.objectContaining({state:'SP',reason:'coverage_unavailable'}),expect.objectContaining({state:'PR',reason:'coverage_unavailable'})]))
 expect(missing.marketExhausted).toBe(false)
})
it('freezes old counting semantics and never upgrades a resumed v1 batch',()=>{
 expect(api.resolveRadarCapturePipeline({storedVersion:1,requestedVersion:2,resuming:true})).toEqual({pipelineVersion:1,countingMode:'admitted'})
 expect(api.resolveRadarCapturePipeline({requestedVersion:2,resuming:false})).toEqual({pipelineVersion:2,countingMode:'qualified'})
 expect(()=>api.resolveRadarCapturePipeline({requestedVersion:2,resuming:true})).toThrow('radar_capture_pipeline_unknown')
})
it('builds a bounded configurable window of a large municipal plan, preserving every next scope without pretending it exhausted',()=>{
 const input={...base,sourceOrder:['serper_places'],window:{size:3,offset:0}}
 const first=api.buildRadarAdaptiveDiscoveryPlan(input),second=api.buildRadarAdaptiveDiscoveryPlan({...input,window:{size:3,offset:first.nextScopeOffset}})
 expect(first.scopes).toHaveLength(3);expect(first.nextScopeOffset).toBe(3)
 expect(second.scopes).toHaveLength(1);expect(second.nextScopeOffset).toBeNull()
 expect(new Set([...first.scopes,...second.scopes].map((scope:any)=>scope.key)).size).toBe(4)
 const pages=first.scopes.map((scope:any)=>({id:scope.key,scopeKey:scope.key,status:'admitted',exhaustion:'exhausted'}))
 expect(api.planRadarAdaptiveDiscoveryTurn({plan:first,requestedCount:10,items:[],pages})).toMatchObject({action:'expand_plan_window',offset:3})
})
it('counts only new qualified nonduplicate prospects, not rejected or merely discovered names',()=>{
 const items=[...Array.from({length:5},()=>({isNew:false,qualification:'confirmed',state:'completed'})),...Array.from({length:3},()=>({isNew:true,qualification:'not_target',state:'completed'})),...Array.from({length:2},()=>({isNew:true,qualification:'confirmed',state:'completed'}))]
 expect(api.radarAdaptiveDiscoveryCounts(items)).toMatchObject({examined:10,qualifiedNew:2,outsideProfile:3,duplicates:5})
})
it('schedules saved receipt admission before a new source and never replays an uncertain request',()=>{
 const plan=api.buildRadarAdaptiveDiscoveryPlan(base)
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:10,items:[],pages:[{scopeKey:plan.scopes[0].key,status:'received',exhaustion:'more',id:'paid-page'}]})).toMatchObject({action:'admit_saved_page',pageId:'paid-page'})
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:10,items:[],pages:[{scopeKey:plan.scopes[0].key,status:'uncertain',exhaustion:'unknown',id:'uncertain'}]})).toMatchObject({stop:'awaiting_reconciliation'})
})
it('finishes researching admitted prospects before buying replacements and never concludes a whole market is exhausted',()=>{
 const plan=api.buildRadarAdaptiveDiscoveryPlan(base)
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:10,items:[{isNew:true,qualification:'review',state:'pending'}],pages:[]})).toMatchObject({action:'research_pending'})
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:10,items:[{isNew:true,qualification:'review',state:'waiting'}],pages:[]})).toMatchObject({action:'discover',scope:{key:plan.scopes[0].key}})
 const pages=plan.scopes.map((scope:any)=>({scopeKey:scope.key,status:'admitted',exhaustion:'exhausted',id:scope.key}))
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:10,items:[],pages})).toMatchObject({stop:'coverage_incomplete',marketExhausted:false})
 const complete={...plan,omittedSources:[]}
 expect(api.planRadarAdaptiveDiscoveryTurn({plan:complete,requestedCount:10,items:[],pages})).toMatchObject({stop:'consulted_sources_exhausted',marketExhausted:false})
 expect(api.planRadarAdaptiveDiscoveryTurn({plan:complete,requestedCount:10,items:[],pages:pages.map((page:any)=>({...page,exhaustion:'unknown'}))})).toMatchObject({stop:'coverage_incomplete',marketExhausted:false})
})
it('keeps paid surplus for the next lot once the qualified target is reached',()=>{
 const plan=api.buildRadarAdaptiveDiscoveryPlan(base)
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:1,items:[{isNew:true,qualification:'confirmed',state:'completed'}],pages:[{id:'surplus',scopeKey:plan.scopes[0].key,status:'received',exhaustion:'more'}]})).toMatchObject({stop:'target_reached'})
})
it('isolates individual waits but still stops on an uncertain discovery page or missing continuation',()=>{
 const plan=api.buildRadarAdaptiveDiscoveryPlan({...base,sourceOrder:['cnpja_advanced_search'],states:['SP']}),scopeKey=plan.scopes[0].key
 const items=[{isNew:true,qualification:'review',state:'waiting'}]
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:40,items,pages:[{id:'old-page',scopeKey,status:'admitted',exhaustion:'more',continuation:{token:'page-2'}}]})).toMatchObject({action:'discover',continuation:{token:'page-2'}})
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:40,items,pages:[{id:'uncertain',scopeKey,status:'uncertain',exhaustion:'unknown'}]})).toMatchObject({stop:'awaiting_reconciliation'})
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:40,items,pages:[{id:'no-token',scopeKey,status:'admitted',exhaustion:'more'}]})).toMatchObject({stop:'awaiting_continuation'})
 expect(api.planRadarAdaptiveDiscoveryTurn({plan,requestedCount:40,items,pages:[{id:'last-page',scopeKey,status:'admitted',exhaustion:'exhausted'}]})).toMatchObject({stop:'awaiting_research_attention'})
})
