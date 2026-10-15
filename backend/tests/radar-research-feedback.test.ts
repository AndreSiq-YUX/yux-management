import {expect,it,vi} from 'vitest'
import {recordRadarResearchFeedback} from '../src/modules/radar/research-feedback.js'
const input={organizationId:'org',candidateId:'candidate',configurationRevision:2,requestId:'request',kind:'contact_invalid' as const,contact:{kind:'phone',value:'+551133334444'}}
function fixture(){
  const records:Record<string,unknown>[]=[]
  const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
    if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)||sql.includes('pg_advisory'))return{rows:[]}
    if(sql.includes('FROM public.radar_candidate_records'))return{rows:[{organization_id:'org',campaign_id:'campaign',configuration_revision:2,normalized_payload:{publicContacts:[{kind:'phone',value:'+551133334444',sourceUrl:'https://alfa.example/'}]}}]}
    if(sql.includes('FROM public.radar_research_feedback'))return{rows:records}
    if(sql.includes('INSERT INTO public.radar_research_feedback')){const row={id:'feedback',organization_id:params[0],request_id:params[3],payload_hash:params[4]};records.push(row);return{rows:[row]}}
    throw Error('Unexpected fixture query: '+sql)
  })
  return{query,pool:{query,connect:async()=>({query,release(){}})}}
}
it('records feedback idempotently without rewriting candidate data, CRM or campaign rules',async()=>{
  const value=fixture(),user={id:'admin',role:'yux_admin'} as never
  const first=await recordRadarResearchFeedback(value.pool as never,user,input)
  expect(await recordRadarResearchFeedback(value.pool as never,user,input)).toEqual(first)
  expect(value.query.mock.calls.filter(([sql])=>sql.includes('INSERT INTO public.radar_research_feedback'))).toHaveLength(1)
  expect(value.query.mock.calls.some(([sql])=>/UPDATE public\.(leads|radar_candidate_records|radar_campaigns)|domain_events|automation_executions/.test(sql))).toBe(false)
})
it('rejects foreign organization, stale configuration and contacts not present in the company evidence',async()=>{
  const value=fixture(),user={id:'admin',role:'yux_admin'} as never
  await expect(recordRadarResearchFeedback(value.pool as never,user,{...input,organizationId:'other'})).rejects.toThrow('radar_feedback_scope_invalid')
  await expect(recordRadarResearchFeedback(value.pool as never,user,{...input,configurationRevision:1})).rejects.toThrow('radar_campaign_configuration_changed')
  await expect(recordRadarResearchFeedback(value.pool as never,user,{...input,contact:{kind:'phone',value:'wrong'}})).rejects.toThrow('radar_feedback_contact_not_found')
})
