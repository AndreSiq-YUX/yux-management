import {expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
const api=await import('../src/modules/radar/effect-receipts.js').catch(()=>({})) as Record<string,any>
it('distinguishes a received truncated/invalid response from transport uncertainty and a proven pre-provider rejection',()=>{
 expect(api.inspectRadarEffectResponse).toBeTypeOf('function')
 expect(api.inspectRadarEffectResponse({response:{content:'{',finish_reason:'length',cost_usd:.001}})).toMatchObject({transportOutcome:'received',validationOutcome:'invalid',billingOutcome:'known',failureCode:'output_truncated'})
 expect(api.inspectRadarEffectResponse({response:{content:'Invented excerpt',cost_usd:.001},validationFailureCode:'radar_presence_unverifiable'})).toMatchObject({transportOutcome:'received',validationOutcome:'invalid',failureCode:'radar_presence_unverifiable'})
 expect(api.inspectRadarEffectResponse({uncertainAfterSend:true})).toMatchObject({transportOutcome:'uncertain',billingOutcome:'uncertain'})
 expect(api.inspectRadarEffectResponse({notStarted:true})).toMatchObject({transportOutcome:'not_started',billingOutcome:'known'})
})
it('validates the same evidence, technical-receipt and commercial-status fixtures used by Python',async()=>{
 expect(api.validateRadarResearchContract).toBeTypeOf('function')
 const cases=JSON.parse(await readFile(new URL('../../contracts/radar/v1/cases.json',import.meta.url),'utf8'))
 for(const value of cases.valid)expect(api.validateRadarResearchContract(value),JSON.stringify(value)).toBe(true)
 for(const value of cases.invalid)expect(api.validateRadarResearchContract(value),JSON.stringify(value)).toBe(false)
 const receipt=cases.valid.find((value:any)=>value.effectKey)
 expect(api.validateRadarResearchContract({...receipt,apiKey:'must-not-pass'})).toBe(false)
})
