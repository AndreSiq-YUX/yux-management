import {expect,it} from 'vitest'
const api=await import('../src/modules/radar/funnel-gates.js').catch(()=>({})) as Record<string,any>
const binding={campaignId:'campaign',configurationRevision:6,targetsHash:'criteria',routeFingerprint:'route',provider:'openrouter',upstreamProvider:'fixture',requestedModel:'model',resolvedModelSnapshot:'snapshot',adapterVersion:'openrouter-decisions-alpha-v1',contextVersion:'radar-decision-context-v2',questionVersion:'radar-decisions-questions-v2',rubricVersion:'radar-decisions-rubric-v2'}
const calibration={...binding,gate:'g1',status:'approved',threshold:.9}
const result={status:'decided',choice:'outside_profile',reasonCode:'registry_activity_mismatch',probabilities:{outside_profile:.99,compatible:.01},evidenceIds:['registry']}
const evidence=[{id:'registry',role:'registry',primary:true,scope:'establishment',sourceUrl:'https://cnpja.com/office/12345678000190'}]
const evaluate=(changes:Record<string,unknown>={})=>api.evaluateRadarFunnelGate({gate:'g1',requestedMode:'enforce',binding,calibration,result,evidence,...changes})
it('applies a calibrated campaign exclusion only with primary establishment evidence',()=>{
 expect(evaluate()).toMatchObject({action:'exclude',effectiveMode:'enforce'})
 expect(evaluate({evidence:[{...evidence[0],scope:'unresolved'}]})).toMatchObject({action:'continue'})
})
it('does not alter budget or depth in shadow, even when the model says weak fit',()=>{
 expect(evaluate({requestedMode:'shadow',result:{...result,choice:'weak_fit'}})).toMatchObject({action:'continue',effectiveMode:'shadow'})
})
it.each(['resolvedModelSnapshot','targetsHash','campaignId','routeFingerprint','rubricVersion','upstreamProvider'])('returns to shadow when %s differs',key=>{
 expect(evaluate({calibration:{...calibration,[key]:'changed'}})).toMatchObject({action:'continue',effectiveMode:'shadow'})
})
it('never blocks a company in the post-site gate using only registry evidence',()=>{
 expect(evaluate({gate:'g5',calibration:{...calibration,gate:'g5'},hasConfirmedSite:false})).toMatchObject({action:'continue'})
 expect(evaluate({gate:'g5',calibration:{...calibration,gate:'g5'},hasConfirmedSite:true})).toMatchObject({action:'continue'})
})
it('limits a manual override to its gate and campaign revision',()=>{
 expect(evaluate({override:{gate:'g1',configurationRevision:6}})).toMatchObject({action:'continue',overridden:true})
 expect(evaluate({override:{gate:'g5',configurationRevision:6}})).toMatchObject({action:'exclude'})
 expect(evaluate({override:{gate:'g1',configurationRevision:5}})).toMatchObject({action:'exclude'})
})
