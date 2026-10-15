import {expect,it} from 'vitest'
import {evaluateRadarResearchQuality} from '../src/modules/radar/research-quality.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
import type {RadarResearchDossier} from '../src/modules/radar/research-service.js'
const policy=resolveRadarSearchConfiguration({research:{completion:{enabled:true,requireWebsite:false,requireSegment:true}}}).research
const dossier:RadarResearchDossier={discovery:{association:'not_found_in_consulted_sources',hits:[],suggestions:[],limitations:[],queries:1},pages:[],contacts:[{kind:'phone',value:'+551133334444',sourceUrl:'https://alfa.example/contato',observedAt:'2026-10-15',association:'confirmed',scope:'establishment',purpose:'general'}],siteAssociation:'review',activity:{status:'inconclusive',signals:[],presenceSignals:[],limitation:'Não confirma operação.'},qualification:{targetStatus:'confirmed',productFit:'high',reasons:[],evidenceIds:[],limitations:[]},limitations:[]}
it('allows a campaign without website requirement to use independently corroborated public contact evidence',()=>{
  const result=evaluateRadarResearchQuality({dossier,policy,currentRevision:true})
  expect(result).toMatchObject({identity:'associated',contactability:'useful',fit:'high',potential:{score:null,coverage:null},readyForReview:true,missing:[]})
})
it('does not count registry phone or pending ownership as useful public contact',()=>{
  const result=evaluateRadarResearchQuality({dossier:{...dossier,registryPhone:'1133334444',contacts:dossier.contacts.map(item=>({...item,association:'review'}))},policy,currentRevision:true})
  expect(result.readyForReview).toBe(false)
  expect(result.missing).toEqual(expect.arrayContaining(['identity','contact']))
})
it('does not confirm an establishment using group-only evidence or old revision',()=>{
  const group=evaluateRadarResearchQuality({dossier:{...dossier,siteAssociation:'confirmed',presenceResolution:{scope:'group',reason:'Grupo confirmado',claims:[]},contacts:dossier.contacts.map(item=>({...item,scope:'group'}))},policy,currentRevision:true})
  expect(group.identity).toBe('pending');expect(group.readyForReview).toBe(false)
  expect(evaluateRadarResearchQuality({dossier,policy,currentRevision:false}).readyForReview).toBe(false)
})
it('separates low commercial fit from unknown size and requires explicitly selected contact purpose',()=>{
  const changed={...policy,completion:{...policy.completion,contactPurposes:['suppliers' as const]}}
  const result=evaluateRadarResearchQuality({dossier:{...dossier,qualification:{...dossier.qualification!,productFit:'low'}},policy:changed,currentRevision:true})
  expect(result.fit).toBe('low');expect(result.potential.score).toBeNull()
  expect(result.missing).toContain('contact')
})
