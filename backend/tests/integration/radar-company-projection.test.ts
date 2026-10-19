import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {startRadarCandidateResearch,executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'

describe.skipIf(!connectionString)('research publication and prior facts in PostgreSQL',()=>{
 it('retains dated known facts during failed refresh and never publishes over a concurrent human edit',async()=>{
  const f=await captureFixture()
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   const prospect=company()
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:[prospect]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0]
   const page={url:'https://empresa.example/',text:`Empresa sintética LTDA CNPJ ${prospect.taxId}. Contato compras@empresa.example Telefone (41) 3333-4444`,html:`<footer>Empresa sintética LTDA CNPJ ${prospect.taxId}</footer><a href="mailto:compras@empresa.example">Contato</a>`,observedAt:new Date().toISOString()}
   const seed=async(runId:string,pages:object[],complete:boolean)=>f.pool.query('UPDATE public.radar_candidate_research_runs SET output=$2 WHERE id=$1',[runId,JSON.stringify({pages,readingComplete:complete,readerVersion:4,discoveryLocked:true,discovery:{association:'confirmed',websiteUrl:page.url,hits:[],suggestions:[],limitations:[],queries:1}})])
   const noSearch=async()=>{throw Error('unexpected_provider_call')}
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
   await seed(run.runId,[page],true)
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.runId},undefined,{web:noSearch,local:noSearch,loadSecret:async()=>'fixture'})
   const read=async()=>(await f.pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[item.candidateId])).rows[0].normalized_payload
   const original=await read()
   expect(original.websiteStatus).toBe('verified_present')
   const refresh=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1,operation:'refresh',requestId:randomUUID()})
   await seed(refresh.runId,[{...page,text:'',html:undefined,limitation:'robots_unavailable'}],true)
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:refresh.runId},undefined,{collect:async()=>[{...page,text:'',limitation:'robots_unavailable'}],web:noSearch,local:noSearch,loadSecret:async()=>'fixture'})
   expect(await read()).toMatchObject({websiteUrl:page.url,siteCheckedAt:page.observedAt,researchRefreshIncomplete:true,previousResearch:{runId:run.runId,belongsToCurrentIdentity:true}})
   const again=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1,operation:'refresh',requestId:randomUUID()})
   await seed(again.runId,[page],false)
   let edited=false
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:again.runId},undefined,{web:noSearch,local:noSearch,loadSecret:async()=>'fixture',collect:async()=>{
    if(!edited){edited=true;await f.pool.query(`UPDATE public.radar_candidate_records SET normalized_payload=normalized_payload||'{"manualNote":"Preservar correção humana"}'::jsonb WHERE id=$1`,[item.candidateId])}
    return[page]
   }})
   expect(edited).toBe(true)
   expect(await read()).toMatchObject({manualNote:'Preservar correção humana',researchRunId:refresh.runId})
   expect((await f.pool.query('SELECT status,error_code FROM public.radar_candidate_research_runs WHERE id=$1',[again.runId])).rows[0]).toMatchObject({status:'blocked',error_code:'radar_research_projection_changed'})
  }finally{await f.close()}
 })
})
