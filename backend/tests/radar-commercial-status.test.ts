import {expect,it} from 'vitest'
import {validateRadarResearchContract} from '../src/modules/radar/effect-receipts.js'
const api=await import('../src/modules/radar/commercial-status.js').catch(()=>({})) as Record<string,any>
const observedAt='2026-10-19T10:00:00Z'
it('shows the most recent attempt rather than an older successful completion on a resumed run',()=>{
 expect(api.projectRadarCommercialResearchStatus({run:{status:'blocked',completed_at:'2026-10-18T10:00:00Z',updated_at:observedAt,output:{}}}).lastAttemptAt).toBe(new Date(observedAt).toISOString())
})
it('offers a first research action when no attempt exists rather than claiming an operational block',()=>{
 expect(api.projectRadarCommercialResearchStatus({})).toMatchObject({status:'incomplete',lastAttemptAt:null,nextAction:'continue',unresolvedFields:expect.arrayContaining([{field:'website',reason:'verification_pending'}])})
})
it('does not report a fresh identity or contact merely because observation timestamps changed',()=>{
 const contact={kind:'email',value:'compras@empresa.example',association:'confirmed',observedAt:'2026-10-18T10:00:00Z'}
 const previous={websiteUrl:'https://empresa.example/',publicPresence:{website:{association:'confirmed'}},publicContacts:[contact]}
 const result=api.projectRadarCommercialResearchStatus({requestedFields:['website','identity','email'],previous,run:{status:'succeeded',updated_at:observedAt,output:{siteAssociation:'confirmed',readingComplete:true,discovery:{websiteUrl:previous.websiteUrl},contacts:[{...contact,observedAt}],quality:{readyForReview:true}}}})
 expect(result).toMatchObject({status:'unchanged',updatedFields:[],unresolvedFields:[]})
})
it('distinguishes an unexecuted stage, a restricted read and a researched field not found, without technical disclosure',()=>{
 expect(api.projectRadarCommercialResearchStatus).toBeTypeOf('function')
 const project=api.projectRadarCommercialResearchStatus
 const waiting=project({run:{status:'blocked',updated_at:observedAt,error_code:'radar_presence_previous_request_uncertain',calls:{presence:{status:'uncertain',provider:'Brave',costUsd:5}},output:{}}})
 expect(waiting).toMatchObject({status:'waiting',updatedFields:[],unresolvedFields:expect.arrayContaining([{field:'website',reason:'verification_pending'}]),nextAction:'wait'})
 const restricted=project({run:{status:'partial',updated_at:observedAt,output:{readingComplete:true,siteAssociation:'review',pages:[{text:'',limitation:'robots_unavailable'}]}}})
 expect(restricted.unresolvedFields).toContainEqual({field:'email',reason:'reading_restricted'})
 const missing=project({run:{status:'succeeded',updated_at:observedAt,output:{readingComplete:true,quality:{readyForReview:false},pages:[{text:'Empresa e seus serviços'}]}}})
 expect(missing).toMatchObject({status:'incomplete',nextAction:'continue'})
 expect(missing.unresolvedFields).toContainEqual({field:'website',reason:'not_found'})
 for(const value of [waiting,restricted,missing]){expect(validateRadarResearchContract(value)).toBe(true);expect(JSON.stringify(value)).not.toMatch(/Brave|robots|provider|cost|radar_/)}
})
it('reports new contacts without erasing a useful fact when the profile is still pending',()=>{
 const result=api.projectRadarCommercialResearchStatus({requestedFields:['website','email','companyProfile'],previous:{websiteUrl:'https://empresa.example/'},run:{status:'partial',updated_at:observedAt,output:{siteAssociation:'confirmed',readingComplete:true,discovery:{websiteUrl:'https://empresa.example/'},pages:[{text:'Empresa e contato'}],contacts:[{kind:'email',value:'compras@empresa.example',association:'confirmed'}],quality:{readyForReview:false}}}})
 expect(result.updatedFields).toEqual(['email'])
 expect(result.unresolvedFields).toContainEqual({field:'companyProfile',reason:'verification_pending'})
})
it('distinguishes outside-profile results from a blocked operation and does not treat time-only changes as new facts',()=>{
 const output={siteAssociation:'confirmed',readingComplete:true,discovery:{websiteUrl:'https://empresa.example/'},qualification:{targetStatus:'not_target',productFit:'low'},contacts:[]}
 const result=api.projectRadarCommercialResearchStatus({requestedFields:['website','fit'],previous:{websiteUrl:'https://empresa.example/',targetStatus:'not_target'},run:{status:'succeeded',updated_at:observedAt,output}})
 expect(result.updatedFields).toEqual([]);expect(result.status).toBe('incomplete');expect(result.nextAction).toBe('review_result')
 expect(result.unresolvedFields).toContainEqual({field:'fit',reason:'outside_profile'})
})
