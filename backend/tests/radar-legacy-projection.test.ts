import {expect,it,vi} from 'vitest'
import {mapCandidate,approveRadarB2bProspect} from '../src/modules/radar/repository.js'
import {buildRadarCrmLeadFacts} from '../src/modules/radar/crm-delivery.js'
const payload={websiteUrl:'https://empresadois.com.br/cnpj/12345678000190',websiteStatus:'verified_present',sitePhones:['+551145047000'],
  publicContacts:[{kind:'phone',value:'+551145047000',sourceUrl:'https://empresadois.com.br/cnpj/12345678000190',association:'confirmed',observedAt:'2026-09-01'}]}
it('filters directory facts consistently for candidate lists and new CRM deliveries without mutating history',()=>{
  const candidate=mapCandidate({normalized_payload:payload} as never)
  expect(candidate.normalizedPayload).toMatchObject({websiteStatus:'unknown',publicContacts:[],sitePhones:[]})
  expect(candidate.normalizedPayload.websiteUrl).toBeUndefined()
  const facts=buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:payload},'Oferta')
  expect(facts.phone).toBeNull();expect(facts.attribution.websiteUrl).toBeUndefined()
  expect(payload.publicContacts).toHaveLength(1);expect(payload.websiteStatus).toBe('verified_present')
})
it('does not automatically approve a directory website just because a legacy row says verified',async()=>{
  const query=vi.fn(async(sql:string)=>{
    if(sql.includes('SELECT organization_id, campaign_id'))return{rows:[{organization_id:'org',campaign_id:'campaign'}]}
    if(sql.includes('kind = \'yux\''))return{rows:[{allowed:true}]}
    if(sql.includes('SELECT campaign.configuration_revision'))return{rows:[{configuration_revision:1}]}
    if(sql.includes('SELECT review.candidate_id'))return{rows:[{candidate_id:'candidate',target_status:'confirmed',normalized_payload:payload}]}
    return{rows:[]}
  })
  const pool={query,connect:async()=>({query,release(){}})}
  await expect(approveRadarB2bProspect(pool as never,{id:'admin',role:'yux_admin'} as never,{organizationId:'org',candidateId:'candidate'})).rejects.toThrow('radar_b2b_manual_evidence_required')
  expect(query.mock.calls.some(([sql])=>sql.includes('approved_at = NOW()'))).toBe(false)
})
