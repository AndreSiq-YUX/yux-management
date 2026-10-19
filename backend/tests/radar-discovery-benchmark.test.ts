import {expect,it} from 'vitest'
const api=await import('../scripts/evaluate-radar-discovery.js').catch(()=>({})) as Record<string,any>
const company=(identityKey:string,extra={})=>({identityKey,verifiedIdentity:true,reviewedFit:'compatible',existing:false,complete:true,usefulContact:true,latencyMs:100,...extra})
const source=(id:string,companies:unknown[],extra={})=>({source:id,strategy:'fixture',segment:'Perfil sintético',region:'Cidade/BR',queryPlanVersion:'v1',startedAt:'2026-10-19T12:00:00Z',rateSnapshot:{usdToBrl:'5.50',asOf:'2026-10-19',source:'fixture_not_market_rate'},status:'evaluated',rawItems:companies.map((_,i)=>({id:`raw-${i}`,kind:'company'})),companies,costs:[{kind:'search',amount:'0.01',currency:'USD',billingOutcome:'known'}],...extra})
it('separates directory mentions, verified identity, source overlap and distinct establishments of the same group',()=>{
 expect(api.evaluateRadarDiscovery).toBeTypeOf('function')
 const first=source('serper_web_search',[company('cnpj:11111111000111'),company('cnpj:11111111000111'),company('unverified',{verifiedIdentity:false}),company('cnpj:22222222000122',{existing:true})],{rawItems:[{id:'directory',kind:'directory',mentions:Array.from({length:10},(_,i)=>({id:`mention-${i}`}))}]})
 const second=source('osm_extract',[company('cnpj:11111111000111'),company('cnpj:11111111000200',{groupKey:'group-shared'}),company('cnpj:33333333000133',{groupKey:'group-shared',complete:false})])
 const report=api.evaluateRadarDiscovery([first,second])
 expect(report.sources[0]).toMatchObject({rawCandidates:1,mentionedCompanies:10,uniqueVerified:2,compatibleNew:1,exclusiveCompatibleNew:0,costBrl:'0.055',costPerCompatibleNewBrl:'0.055'})
 expect(report.sources[1]).toMatchObject({compatibleNew:3,exclusiveCompatibleNew:2,readyNew:2})
 expect(report.uniqueCompatibleNew).toBe(3)
 expect(report.intersections).toContainEqual({sources:['osm_extract','serper_web_search'],compatibleNew:1})
})
it('does not turn unavailable coverage, unknown FX/costs, zero denominators or uncertain charges into free results',()=>{
 expect(api.evaluateRadarDiscovery).toBeTypeOf('function')
 const sources=[source('osm_extract',[],{status:'unavailable',reason:'snapshot_missing',costs:null}),source('brave_web_search',[],{costs:[{kind:'search',amount:'0.01',currency:'USD',billingOutcome:'uncertain'}]}),source('serper_web_search',[company('cnpj:12345678000190')],{rateSnapshot:null})]
 const report=api.evaluateRadarDiscovery(sources)
 expect(report.sources[0]).toMatchObject({status:'unavailable',compatibleNew:null,costBrl:null})
 expect(report.sources[1]).toMatchObject({costPerCompatibleNewBrl:null,uncertainCostBrl:'0.055'})
 expect(report.sources[2]).toMatchObject({costBrl:null,costPerCompatibleNewBrl:null})
 expect(report.costPerCompatibleNewBrl).toBeNull()
 const uncertain=api.evaluateRadarDiscovery([source('brave_web_search',[company('cnpj:12345678000190')],{costs:[{kind:'research',amount:'0.01',currency:'USD',billingOutcome:'uncertain'}]})])
 expect(uncertain.sources[0].costPerCompatibleNewBrl).toBeNull()
 expect(uncertain.costPerCompatibleNewBrl).toBeNull()
})
it('uses a shared existing-company baseline and exchange snapshot, not source order, to count newly qualified companies',()=>{
 const samples=[source('first',[company('same',{existing:true})]),source('second',[company('same')])]
 expect(api.evaluateRadarDiscovery(samples).uniqueCompatibleNew).toBe(0)
 expect(()=>api.evaluateRadarDiscovery([samples[0],{...samples[1],rateSnapshot:{...samples[1].rateSnapshot,usdToBrl:'6.00'}}])).toThrow('benchmark_rate_snapshot_mismatch')
})
