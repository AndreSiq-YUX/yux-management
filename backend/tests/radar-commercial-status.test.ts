import {expect,it} from 'vitest'
import {validateRadarResearchContract} from '../src/modules/radar/effect-receipts.js'
const api=await import('../src/modules/radar/commercial-status.js').catch(()=>({})) as Record<string,any>
const observedAt='2026-10-19T10:00:00Z'
it.each([
 ['radar_presence_unverifiable','identity_analysis_incomplete','presence'],
 ['radar_qualification_unverifiable_claim','commercial_analysis_incomplete','semantic'],
 ['radar_research_call_uncertain','attempt_confirmation_pending','semantic'],
 ['radar_research_previous_request_failed','public_research_interrupted','discovery'],
])('explains %s with a public enumerated reason', (error,reason,key)=>{
 const result=api.projectRadarCommercialResearchStatus({run:{status:'partial',calls:{[key]:{status:error.includes('uncertain')?'uncertain':'received_invalid',error}},output:{funnel:{},readingComplete:true,quality:{readyForReview:false}}}})
 expect(result.status).toBe('waiting')
 expect(result.attention).toMatchObject({reason,canResume:false})
 expect(JSON.stringify(result)).not.toContain(error)
 expect(validateRadarResearchContract(result)).toBe(true)
})
it('does not call normal missing contact data a pending execution',()=>{
 expect(api.projectRadarCommercialResearchStatus({run:{status:'partial',output:{funnel:{},readingComplete:true,quality:{readyForReview:false}}}}).attention).toBeUndefined()
})
it('explains that a possible fit is not a finished segment verification',()=>{
 const result=api.projectRadarCommercialResearchStatus({requestedFields:['fit'],run:{status:'partial',output:{funnel:{},readingComplete:true,siteAssociation:'confirmed',quality:{readyForReview:false},qualification:{targetStatus:'review',productFit:'possible'}}}});
 expect(result.status).toBe('incomplete');expect(result.unresolvedFields).toContainEqual({field:'fit',reason:'verification_pending'});
});
it.each(['gaps','excluded','optional_uncertain'])('finishes a terminal funnel %s without offering the same continuation',kind=>{
 const output={funnel:{},readingComplete:true,siteAssociation:'review',quality:{readyForReview:false},limitations:['radar_qualification_waiting_public_read'],...(kind==='excluded'?{decisionExcluded:true,funnel:{blockedGate:'g1'},readingComplete:false}:{})}
 const calls=kind==='optional_uncertain'?{decision:{source:'openrouter_decision',status:'uncertain'}}:{}
 const result=api.projectRadarCommercialResearchStatus({requestedFields:['website','fit'],run:{status:'partial',output,calls}})
 expect(result).toMatchObject({status:'incomplete',nextAction:'review_result'})
 if(kind==='excluded')expect(result.unresolvedFields).toContainEqual({field:'fit',reason:'outside_profile'})
})
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

it('groups the real 40-company distribution and clears one updated pending company',async()=>{
 const {summarizeRadarResearchAttention}=await import('../src/modules/radar/research-attention.js')
 const items=[...Array.from({length:26},()=>({status:'insufficient'})),...Array.from({length:10},()=>({status:'blocked',blocker:'radar_presence_unverifiable'})),...Array.from({length:2},()=>({status:'blocked',blocker:'radar_qualification_unverifiable_claim'})),{status:'blocked',blocker:'radar_research_call_uncertain'},{status:'blocked',blocker:'radar_research_previous_request_failed'}]
 expect(summarizeRadarResearchAttention(items)).toEqual([{reason:'identity_analysis_incomplete',count:10},{reason:'commercial_analysis_incomplete',count:2},{reason:'attempt_confirmation_pending',count:1},{reason:'public_research_interrupted',count:1}])
 items[26]={status:'completed'}
 expect(summarizeRadarResearchAttention(items)[0].count).toBe(9)
})
