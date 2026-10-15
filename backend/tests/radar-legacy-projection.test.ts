import {expect,it,vi} from 'vitest'
import {mapCandidate,approveRadarB2bProspect,listRadarCandidates} from '../src/modules/radar/repository.js'
import {buildRadarCrmLeadFacts} from '../src/modules/radar/crm-delivery.js'
const payload={websiteUrl:'https://empresadois.com.br/cnpj/12345678000190',websiteStatus:'verified_present',sitePhones:['+551145047000'],
  publicContacts:[{kind:'phone',value:'+551145047000',sourceUrl:'https://empresadois.com.br/cnpj/12345678000190',association:'confirmed',observedAt:'2026-09-01'}]}
it('sanitizes nested historical publicPresence as well as registry website fields',()=>{
  const url='https://www.bec.sp.gov.br/bec_pregao_UI/Ata/becprp17001.aspx'
  const original={websiteUrl:url,websiteStatus:'verified_present',publicPresence:{version:1,configurationRevision:6,website:{url,association:'confirmed'},contacts:[{kind:'phone',value:'+551145047000',sourceUrl:url,association:'confirmed'}]}}
  const mapped=mapCandidate({normalized_payload:original} as never).normalizedPayload
  expect(mapped.websiteUrl).toBeUndefined()
  expect(mapped.publicPresence).not.toHaveProperty('website')
  expect(mapped.publicPresence).toMatchObject({contacts:[],externalReferences:[{url,reason:expect.any(String)}]})
  expect(original.publicPresence.website.url).toBe(url)
  expect(buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:original},'Oferta').attribution.websiteUrl).toBeUndefined()
})
it('does not revive a generic external reference classified by preserved page evidence',()=>{
  const url='https://cadastro.example/alfa'
  const value={websiteUrl:url,publicPresence:{version:1,configurationRevision:6,contacts:[],externalReferences:[{url,reason:'Cadastro do editor'}]},publicContacts:[{kind:'email',value:'editor@cadastro.example',sourceUrl:url,association:'confirmed'}]}
  expect(mapCandidate({normalized_payload:value} as never).normalizedPayload.websiteUrl).toBeUndefined()
  expect(buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:value},'Oferta').email).toBe('')
})
it('projects a current old dossier into the list using one batch read and no writes',async()=>{
  const original={id:'candidate',normalized_payload:{researchRevision:5}}
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM public.radar_candidate_records')?[original]:[{candidate_id:'candidate',configuration_revision:5,output:{discovery:{websiteUrl:'https://alfa.example/',association:'review',hits:[]},pages:[{url:'https://alfa.example/',text:'Alfa empresa',observedAt:'2026-10-14'}],contacts:[],siteAssociation:'review'}}]}))
  const results=await listRadarCandidates({query} as never,{role:'yux_admin'} as never,'campaign')
  expect(results[0].normalizedPayload.publicPresence).toMatchObject({website:{url:'https://alfa.example/',association:'review'}})
  expect(original.normalized_payload).not.toHaveProperty('publicPresence')
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.calls.every(([sql])=>!/(UPDATE|INSERT|DELETE)/.test(sql))).toBe(true)
})
it('keeps a linked official-profile email for CRM but rejects one with foreign provenance',()=>{
  const contact={kind:'email',value:'contato@alfa.example',sourceUrl:'https://facebook.com/alfa',linkedFromUrl:'https://alfa.example/',observedAt:'2026-10-14',association:'confirmed',scope:'establishment'}
  const facts=buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:{websiteUrl:'https://alfa.example/',publicContacts:[contact]}},'Oferta')
  expect(facts.email).toBe('contato@alfa.example')
  expect(buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:{websiteUrl:'https://alfa.example/',publicContacts:[{...contact,linkedFromUrl:'https://serasaexperian.com.br/'}]}},'Oferta').email).toBe('')
})
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
