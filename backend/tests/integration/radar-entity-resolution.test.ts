import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {expect,it,describe} from 'vitest'
import {captureFixture,connectionString,organizationId,admin} from '../support/radar-capture-fixture.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import type {BusinessMentionV1} from '../../src/contracts/generated/radarResearch.js'
const path='../../src/modules/radar/candidate-admission.js'
const api=await import(path).catch(()=>({})) as Record<string,any>
const policy={triage:'compatible',requiredFields:[],missingFields:[],sourceAllowed:false,budgetApproved:false}
const mention:BusinessMentionV1={schemaVersion:1,name:'Alfa Refeições',location:{city:'Campinas',state:'SP',address:'Rua Um, 10'},contacts:[],sourceUrl:'https://lista.example/alfa',subjectScope:'establishment',needsVerification:true,evidenceSpans:[{field:'name',evidenceId:'page-1',excerpt:'Alfa Refeições'}]}
const verification={taxId:{value:'37335118000180',subjectName:mention.name,subjectScope:'establishment',sourceRole:'registry',evidenceId:'registry-1',location:mention.location}}
describe.skipIf(!connectionString)('Radar web/registry entity admission in isolated PostgreSQL',()=>{
 it('rolls back page admission with its caller transaction instead of committing candidates before a cursor',async()=>{
  const f=await captureFixture(),transaction=await f.pool.connect()
  try{
   await transaction.query('BEGIN')
   await api.admitRadarBusinessMention(f.pool,{organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),mention,verification,registryPolicy:policy,canPersist:true},{transaction})
   await transaction.query('ROLLBACK')
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM radar_candidate_records WHERE campaign_id=$1',[f.campaign.id])).rows[0].n).toBe('0')
  }finally{await transaction.query('ROLLBACK');transaction.release();await f.close()}
 })
 it('keeps two establishments with the same root and shared central contact separate',async()=>{
  const f=await captureFixture()
  try{
   const input={organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),mention,verification,registryPolicy:policy,canPersist:true}
   const first=await api.admitRadarBusinessMention(f.pool,input),second=await api.admitRadarBusinessMention(f.pool,{...input,observationKey:randomUUID(),verification:{taxId:{...verification.taxId,value:'37335118000261'}}})
   expect(second.candidateId).not.toBe(first.candidateId);expect(second.newCandidateCount).toBe(1)
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM radar_candidate_records WHERE campaign_id=$1',[f.campaign.id])).rows[0].n).toBe('2')
  }finally{await f.close()}
 })
 it('reuses a confirmed domain plus name/locality across two web sources without buying fiscal lookup',async()=>{
  const f=await captureFixture()
  try{
   const input={organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),mention,verification:{website:{url:'https://alfa.example/',association:'confirmed',scope:'establishment',evidenceId:'official-1'}},registryPolicy:policy,canPersist:true}
   const first=await api.admitRadarBusinessMention(f.pool,input),second=await api.admitRadarBusinessMention(f.pool,{...input,observationKey:randomUUID(),mention:{...mention,sourceUrl:'https://outra-lista.example/alfa'}})
   expect(second).toMatchObject({candidateId:first.candidateId,status:'matched',newCandidateCount:0,nextAction:'none'})
  }finally{await f.close()}
 })
 it('serializes concurrent web and registry admission, saves both provenances, and replays without another candidate',async()=>{
  const f=await captureFixture()
  try{
   expect(api.admitRadarBusinessMention).toBeTypeOf('function')
   const input={organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),mention,verification,registryPolicy:policy,canPersist:true}
   const results=await Promise.all([api.admitRadarBusinessMention(f.pool,input),api.admitRadarBusinessMention(f.pool,{...input,observationKey:randomUUID()})])
   expect(results[0].candidateId).toBe(results[1].candidateId)
   expect(results.reduce((total:number,result:{newCandidateCount:number})=>total+result.newCandidateCount,0)).toBe(1)
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM radar_candidate_records WHERE campaign_id=$1',[f.campaign.id])).rows[0].n).toBe('1')
   const replay=await api.admitRadarBusinessMention(f.pool,{...input,mention:{...mention,observedAt:'2026-10-20T12:00:00Z'}})
   expect(replay).toMatchObject({reused:true,candidateId:results[0].candidateId,newCandidateCount:0})
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM radar_business_observations WHERE campaign_id=$1',[f.campaign.id])).rows[0].n).toBe('2')
   expect((await f.pool.query('SELECT verification FROM radar_business_observations WHERE id=$1',[results[0].observationId])).rows[0].verification).toEqual(verification)
   await expect(api.admitRadarBusinessMention(f.pool,{...input,mention:{...mention,name:'Empresa diferente'}})).rejects.toThrow('radar_business_observation_conflict')
  }finally{await f.close()}
 })
 it('matches an existing registry candidate without overwriting its human facts and keeps an outside-profile observation out of the company list',async()=>{
  const f=await captureFixture()
  try{
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search',$3,$4,$5) RETURNING id`,[organizationId,f.campaign.id,mention.name,randomUUID(),JSON.stringify({cnpj:verification.taxId.value,tradeName:mention.name,...mention.location,humanNote:'preserve'})])).rows[0]
   const input={organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),mention,verification,registryPolicy:policy,canPersist:true}
   expect(await api.admitRadarBusinessMention(f.pool,input)).toMatchObject({status:'matched',candidateId:candidate.id,newCandidateCount:0})
   expect((await f.pool.query('SELECT normalized_payload FROM radar_candidate_records WHERE id=$1',[candidate.id])).rows[0].normalized_payload.humanNote).toBe('preserve')
   expect(await api.admitRadarBusinessMention(f.pool,{...input,observationKey:randomUUID(),registryPolicy:{...policy,triage:'outside_profile'}})).toMatchObject({admission:'outside_profile',newCandidateCount:0})
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM radar_candidate_records WHERE campaign_id=$1',[f.campaign.id])).rows[0].n).toBe('1')
  }finally{await f.close()}
 })
 it('reverses a mistaken link with an audit event, without deleting the candidate, source or contacts',async()=>{
  const f=await captureFixture()
  try{
   const admitted=await api.admitRadarBusinessMention(f.pool,{organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),mention,verification,registryPolicy:policy,canPersist:true})
   await expect(api.unlinkRadarBusinessObservation(f.pool,{...admin,role:'client_admin'},{organizationId,observationId:admitted.observationId,reason:'Associação incorreta'})).rejects.toMatchObject({statusCode:403})
   await api.unlinkRadarBusinessObservation(f.pool,admin,{organizationId,observationId:admitted.observationId,reason:'Associação incorreta'})
   expect((await f.pool.query('SELECT state,mention,candidate_id FROM radar_business_observations WHERE id=$1',[admitted.observationId])).rows[0]).toMatchObject({state:'unlinked',mention:{name:mention.name},candidate_id:null})
   expect((await f.pool.query('SELECT kind,previous_candidate_id FROM radar_business_identity_events WHERE observation_id=$1 ORDER BY created_at DESC',[admitted.observationId])).rows[0]).toMatchObject({kind:'unlink',previous_candidate_id:admitted.candidateId})
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM radar_candidate_records WHERE id=$1',[admitted.candidateId])).rows[0].n).toBe('1')
  }finally{await f.close()}
 })
 it('rejects unlicensed/stale admission and never exposes technical observations to account admins or an unscoped worker',async()=>{
  const f=await captureFixture(),url=new URL(connectionString!);url.username='yux_api'
  const raw=new pg.Pool({connectionString:url.toString()}),scoped=createContextAwarePool(raw,'api')
  try{
   const input={organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),mention,verification,registryPolicy:policy,canPersist:true}
   await expect(api.admitRadarBusinessMention(f.pool,{...input,canPersist:false})).rejects.toThrow('radar_business_persistence_not_authorized')
   await expect(api.admitRadarBusinessMention(f.pool,{...input,revision:2})).rejects.toThrow('radar_campaign_configuration_changed')
   await api.admitRadarBusinessMention(f.pool,input)
   for(const role of ['client_admin','client_member','yux_operator'] as const)await runWithDatabaseRequestContext({role,organizationIds:[organizationId]},async()=>{
    expect((await scoped.query('SELECT * FROM radar_business_observations')).rows).toEqual([])
    await expect(api.admitRadarBusinessMention(scoped,input)).rejects.toThrow()
   })
   await runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[]},async()=>{expect((await scoped.query('SELECT * FROM radar_business_observations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(1)})
   url.username='yux_worker';const workerRaw=new pg.Pool({connectionString:url.toString()}),worker=createContextAwarePool(workerRaw,'worker')
   try{
    await runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[],serviceRole:'worker'},async()=>{expect((await worker.query('SELECT * FROM radar_business_observations')).rows).toEqual([])})
    await runWithDatabaseRequestContext({role:'client_member',organizationIds:[organizationId],serviceRole:'worker'},async()=>{expect((await worker.query('SELECT * FROM radar_business_observations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(1)})
    await runWithDatabaseRequestContext({role:'client_member',organizationIds:['10000000-0000-4000-8000-000000000002'],serviceRole:'worker'},async()=>{
     expect((await worker.query('SELECT * FROM radar_business_observations WHERE campaign_id=$1',[f.campaign.id])).rows).toEqual([])
     await expect(api.admitRadarBusinessMention(worker,{...input,observationKey:randomUUID()})).rejects.toThrow('radar_campaign_not_found')
    })
   }finally{await workerRaw.end()}
  }finally{await raw.end();await f.close()}
 })
})
