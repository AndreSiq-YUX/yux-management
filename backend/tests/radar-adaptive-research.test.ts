import {it,expect} from 'vitest'
import {runRadarResearchPipeline} from '../src/modules/radar/research-service.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
const api=await import('../src/modules/radar/adaptive-research.js').catch(()=>({})) as Record<string,any>
it('prefers reading a known source, accepts only eligible decisions, and does not pay an equivalent action twice',()=>{
 expect(api.planRadarAdaptiveResearch).toBeTypeOf('function')
 const context={missing:['identity','contact'],outsideProfile:false,contentHash:'content',availableActions:[{id:'search',kind:'web',inputHash:'q'},{id:'read',kind:'read',inputHash:'url'},{id:'agent',kind:'deep_research',inputHash:'gaps'}],effects:[]}
 expect(api.planRadarAdaptiveResearch(context)).toMatchObject({next:{id:'read'}})
 expect(api.planRadarAdaptiveResearch({...context,lastDecision:'unapproved_model_action'})).toMatchObject({next:{id:'read'}})
 expect(api.planRadarAdaptiveResearch({...context,lastDecision:'search'})).toMatchObject({next:{id:'search'}})
 expect(api.planRadarAdaptiveResearch({...context,effects:context.availableActions.map(action=>({actionId:action.id,inputHash:action.inputHash,contentHash:'content',status:'completed'}))})).toMatchObject({stop:'no_progress'})
})
it('actually escalates missing data once, reads the discovered institution and verifies contacts independently',async()=>{
 const configuration=resolveRadarSearchConfiguration({sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,localSearchOrder:'disabled',maxSearchQueriesPerCandidate:1,maxPagesPerCandidate:3,deepResearchEnabled:true}})
 let searches=0,agents=0,reads=0
 const dossier=await runRadarResearchPipeline({name:'Empresa Alfa',cnpj:'37335118000180'},configuration,{}, {
  checkpoint:async()=>{},web:async()=>{searches++;return[]},
  deepResearch:async gaps=>{agents++;expect(gaps).toContain('identity');return[{url:'https://alfa.example/',title:'Empresa Alfa',snippets:['Empresa Alfa CNPJ 37335118000180'],observedAt:'2026-10-20T12:00:00Z'}]},
  collect:async url=>{reads++;return[{url,text:'Empresa Alfa CNPJ 37.335.118/0001-80. Atendimento fornecedores: compras@alfa.example.',observedAt:'2026-10-20T12:00:00Z'}]}
 })
 expect(agents).toBe(1);expect(searches).toBe(1);expect(reads).toBeGreaterThan(0)
 expect(dossier.siteAssociation).toBe('confirmed')
 expect(dossier.contacts).toContainEqual(expect.objectContaining({kind:'email',value:'compras@alfa.example',association:'confirmed'}))
 expect(dossier.deepResearchCompleted).toBe(true)
})
it('does not buy more tools when criteria are met, a company is excluded, or a purchase is uncertain',()=>{
 const base={missing:['contact'],outsideProfile:false,contentHash:'c',availableActions:[{id:'agent',kind:'deep_research',inputHash:'g'}],effects:[]}
 expect(api.planRadarAdaptiveResearch({...base,missing:[]})).toMatchObject({stop:'criteria_met'})
 expect(api.planRadarAdaptiveResearch({...base,outsideProfile:true})).toMatchObject({stop:'outside_profile'})
 expect(api.planRadarAdaptiveResearch({...base,effects:[{actionId:'agent',inputHash:'g',contentHash:'c',status:'uncertain'}]})).toMatchObject({stop:'awaiting_authorization'})
})
