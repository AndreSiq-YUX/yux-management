import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,organizationId,admin} from '../support/radar-capture-fixture.js'
import {getRadarOperationalLimits,updateRadarOperationalLimits} from '../../src/modules/radar/operational-limits.js'
const api=await import('../../src/modules/radar/administrative-research.js').catch(()=>({})) as Record<string,any>
describe.skipIf(!connectionString)('Radar administrative recovery in isolated PostgreSQL',()=>{
 it('revalidates the two saved replies in a five-item group for free and leaves three unknown effects untouched',async()=>{
  const f=await captureFixture(),ids:string[]=[],originalPolicy=await getRadarOperationalLimits(f.pool,admin)
  try{
   for(let index=0;index<5;index++){
    const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual',$3,$4,'{}') RETURNING id`,[organizationId,f.campaign.id,`Empresa ${index}`,randomUUID()])).rows[0]
    const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status) VALUES($1,$2,$3,$4,1,'blocked') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id])).rows[0]
    const owner=randomUUID(),input={organization_id:organizationId,client_id:null,contract_id:null,identity:{name:`Empresa ${index}`},evidence:[]}
    const action=index===4?'radar_business_qualification':'radar_presence_resolution',key=index===4?'semantic':'presence'
    await f.pool.query('UPDATE public.radar_candidate_research_runs SET calls=$2 WHERE id=$1',[run.id,JSON.stringify({[key]:{status:'uncertain',evidenceHash:'a'.repeat(64)}})])
    const receipt=(await f.pool.query(`INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status,input_request) VALUES($1,$6,$2,$3,$4,'uncertain',$5) RETURNING id`,[organizationId,`${run.id}${index===4?'':':presence'}:${'a'.repeat(64)}`,'a'.repeat(64),owner,JSON.stringify(input),action])).rows[0]
    ids.push(receipt.id)
    if(index<2)await f.pool.query(`INSERT INTO public.radar_effect_receipts(organization_id,effect_key,attempt,analysis_receipt_id,owner_token,input_hash,lease_until,transport_outcome,validation_outcome,billing_outcome,response_body,usage) VALUES($1,$2,1,$3,$4,$5,NOW()-INTERVAL '1 minute','received','invalid','known',$6,'{"costUsd":0.001}')`,[organizationId,randomUUID(),receipt.id,owner,'a'.repeat(64),JSON.stringify({content:'PRIVATE RAW REPLY',finish_reason:index===1?'length':'stop'})])
   }
   expect(api.getRadarAdministrativeResearch).toBeTypeOf('function')
   const input={organizationId,campaignId:f.campaign.id}
   const view=await api.getRadarAdministrativeResearch(f.pool,admin,input)
   expect(view.analyses).toHaveLength(5)
   expect(view.analyses.filter((item:{canRevalidate:boolean})=>item.canRevalidate)).toHaveLength(2)
   expect(view.analyses.filter((item:{canAuthorizeRetry:boolean})=>item.canAuthorizeRetry)).toHaveLength(5)
   expect(JSON.stringify(view)).not.toMatch(/PRIVATE RAW REPLY|input_request|owner_token/)
   await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:originalPolicy.version,limits:{...originalPolicy.limits,maxVerificationBatch:1}})
   let calls=0
   const result=await api.revalidateRadarAdministrativeResearch(f.pool,admin,{} as never,{...input,receiptIds:ids},{runtime:async(_env:unknown,path:string,body:{request_id:string;input_hash:string})=>{
    calls++;expect(path).toBe('/radar/revalidate');expect(body.input_hash).toBe('a'.repeat(64))
    const receipt=(await f.pool.query('SELECT id FROM public.radar_analysis_receipts WHERE request_id=$1',[body.request_id])).rows[0]
    if(receipt.id===ids[1])throw Error('agent_runtime_422:output_truncated')
    await f.pool.query("UPDATE public.radar_analysis_receipts SET status='completed',result='{\"scope\":\"unresolved\"}' WHERE id=$1",[receipt.id])
    return{scope:'unresolved'}
   }})
   expect(calls).toBe(2)
   expect(result.items.filter((item:{state:string})=>item.state==='revalidated')).toHaveLength(1)
   expect(result.items.filter((item:{state:string})=>item.state==='invalid')).toHaveLength(1)
   expect(result.items.filter((item:{state:string})=>item.state==='no_saved_response')).toHaveLength(3)
   expect((await f.pool.query("SELECT id FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[]) AND status='uncertain'",[ids])).rows).toHaveLength(4)
   expect((await f.pool.query('SELECT * FROM public.radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
   await expect(api.revalidateRadarAdministrativeResearch(f.pool,admin,{} as never,{...input,receiptIds:[ids[0],randomUUID()]},{runtime:async()=>{throw Error('must_not_call')}})).rejects.toThrow('radar_analysis_recovery_scope_invalid')
   await expect(api.getRadarAdministrativeResearch(f.pool,{...admin,role:'client_admin'},input)).rejects.toMatchObject({statusCode:403})
  }finally{const policy=await getRadarOperationalLimits(f.pool,admin);await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:originalPolicy.limits,costPolicy:originalPolicy.costPolicy});await f.pool.query('DELETE FROM public.radar_effect_receipts WHERE analysis_receipt_id=ANY($1::uuid[])',[ids]);await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])',[ids]);await f.close()}
 })
})
