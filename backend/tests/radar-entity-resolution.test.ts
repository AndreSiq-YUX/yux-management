import {expect,it} from 'vitest'
import type {BusinessMentionV1} from '../src/contracts/generated/radarResearch.js'

const path='../src/modules/radar/entity-resolution.js'
const api=await import(path).catch(()=>({})) as Record<string,any>
const organizationId='10000000-0000-4000-8000-000000000001'
function mention(overrides:Partial<BusinessMentionV1>={}):BusinessMentionV1{
 return {schemaVersion:1,name:'Alfa Refeições',location:{city:'Campinas',state:'SP',address:'Rua Um, 10'},contacts:[],sourceUrl:'https://lista.example/alfa',subjectScope:'establishment',needsVerification:true,
  evidenceSpans:[{field:'name',evidenceId:'page-1',excerpt:'Alfa Refeições'}],...overrides}
}
const existing={candidateId:'10000000-0000-4000-8000-000000000002',organizationId,names:['Alfa Refeições LTDA'],taxId:'37335118000180',taxIdVerified:true,location:{city:'Campinas',state:'SP',address:'Rua Um, 10'},scope:'establishment'}
const resolve=(data:Record<string,unknown>={})=>api.resolveRadarBusinessEntity({organizationId,mention:mention(),existingCandidates:[existing],registryPolicy:{triage:'investigate',requiredFields:[],missingFields:[],sourceAllowed:true,budgetApproved:true},...data})
it.each(['37.335.118/0001-80','12.ABC.345/01DE-35','00.000.000/E08G-12'])('validates complete numeric and alphanumeric CNPJ without merging by its root: %s',value=>{
 expect(api.normalizeValidRadarCnpj).toBeTypeOf('function')
 expect(api.normalizeValidRadarCnpj(value)).toBe(value.replace(/[./-]/g,''))
})
it.each(['00000000000000','37335118000181','12ABC34501DE36','ABCD','37!335118000180'])('rejects an invalid identifier: %s',value=>{
 expect(api.normalizeValidRadarCnpj).toBeTypeOf('function');expect(api.normalizeValidRadarCnpj(value)).toBeUndefined()
})
it('matches proved full CNPJ to the same account and never a company in another account',()=>{
 expect(api.resolveRadarBusinessEntity).toBeTypeOf('function')
 const tax={value:existing.taxId,subjectName:'Alfa Refeições',subjectScope:'establishment',sourceRole:'registry',evidenceId:'registry-1',location:existing.location}
 expect(resolve({verification:{taxId:tax}})).toMatchObject({status:'matched',candidateId:existing.candidateId,taxId:existing.taxId,newCandidateCount:0})
 expect(resolve({verification:{taxId:tax},existingCandidates:[{...existing,organizationId:'20000000-0000-4000-8000-000000000001'}]})).toMatchObject({status:'new_provisional',newCandidateCount:1})
})
it('does not inherit the publisher CNPJ even if quoted, or merge on name, shared phone or unconfirmed group domain',()=>{
 const claimed=mention({claimedTaxId:existing.taxId,evidenceSpans:[{field:'name',evidenceId:'page-1',excerpt:'Alfa Refeições'},{field:'claimedTaxId',evidenceId:'page-1',excerpt:`Alfa Refeições, editora ${existing.taxId}`} ]})
 expect(resolve({mention:claimed,existingCandidates:[{...existing,names:['Editora de Listas LTDA']}]})).toMatchObject({status:'ambiguous',newCandidateCount:0})
 expect(resolve()).toMatchObject({status:'new_provisional'})
 expect(resolve({mention:mention({claimedWebsite:'https://grupo.example/',contacts:[{kind:'phone',value:'11999999999'}]}),existingCandidates:[{...existing,officialDomain:'grupo.example',domainScope:'group'}]})).toMatchObject({status:'new_provisional'})
})
it('requires confirmed institutional domain, compatible name and matching locality; conflicting CNPJ/city stays ambiguous',()=>{
 const verification={website:{url:'https://alfa.example/',association:'confirmed',scope:'establishment',evidenceId:'official-1'}}
 const saved={...existing,officialDomain:'alfa.example',domainScope:'establishment'}
 expect(resolve({verification,existingCandidates:[saved]})).toMatchObject({status:'matched',candidateId:existing.candidateId})
 expect(resolve({verification,mention:mention({location:{city:'Santos',state:'SP'}}),existingCandidates:[saved]})).toMatchObject({status:'ambiguous'})
 expect(resolve({verification,mention:mention({location:{city:'Campinas',state:'SP',address:'Rua Outra, 500'}}),existingCandidates:[saved]})).toMatchObject({status:'ambiguous'})
 expect(resolve({verification,mention:mention({claimedTaxId:'11284260000198'}),existingCandidates:[saved]})).toMatchObject({status:'ambiguous'})
 expect(resolve({verification:{website:{...verification.website,url:'https://serasaexperian.com.br/empresa'}} ,existingCandidates:[{...saved,officialDomain:'serasaexperian.com.br'}]})).not.toMatchObject({status:'matched'})
})
it('keeps branches distinct and never decides a match on a shared group root',()=>{
 const tax={value:'37335118000261',subjectName:'Alfa Refeições',subjectScope:'establishment',sourceRole:'registry',evidenceId:'r',location:existing.location}
 expect(resolve({verification:{taxId:tax}})).toMatchObject({status:'new_provisional',taxId:tax.value})
 expect(resolve({verification:{taxId:{...tax,subjectScope:'group'}},mention:mention({subjectScope:'group'})})).toMatchObject({status:'new_provisional',scope:'group'})
})
it('normalizes legal suffixes without deleting words from the middle of a business name',()=>{
 expect(api.radarEntityNameKey('Alfa Refeições S.A.')).toBe('alfa refeicoes')
 expect(api.radarEntityNameKey('ME Telecom LTDA')).toBe('me telecom')
})
it('requires the saved stable external association and rejects multiple or conflicting matches',()=>{
 const key={namespace:'map-fixture',value:'abc'}
 expect(resolve({externalKey:key,existingCandidates:[{...existing,externalKeys:[key]}]})).toMatchObject({status:'matched'})
 expect(resolve({externalKey:key,existingCandidates:[{...existing,externalKeys:[key]},{...existing,candidateId:'10000000-0000-4000-8000-000000000003',externalKeys:[key]}]})).toMatchObject({status:'ambiguous',newCandidateCount:0})
})
it('plans no paid lookup for outside profile, existing sufficient registry, missing budget or when fiscal data is optional',()=>{
 expect(resolve({registryPolicy:{triage:'outside_profile',requiredFields:['taxId'],missingFields:['taxId'],sourceAllowed:true,budgetApproved:true}})).toMatchObject({nextAction:'none'})
 expect(resolve()).toMatchObject({nextAction:'none'})
 expect(resolve({registryPolicy:{triage:'investigate',requiredFields:['taxId'],missingFields:['taxId'],sourceAllowed:true,budgetApproved:false}})).toMatchObject({nextAction:'awaiting_registry_authorization'})
 expect(resolve({registryPolicy:{triage:'investigate',requiredFields:['taxId'],missingFields:['taxId'],sourceAllowed:true,budgetApproved:true}})).toMatchObject({nextAction:'registry_name_locality_search'})
 expect(resolve({mention:mention({location:undefined}),registryPolicy:{triage:'investigate',requiredFields:['taxId'],missingFields:['taxId'],sourceAllowed:true,budgetApproved:true}})).toMatchObject({nextAction:'none'})
})
