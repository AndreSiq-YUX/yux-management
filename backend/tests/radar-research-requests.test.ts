import {it,expect} from 'vitest'
const api=await import('../src/modules/radar/research-requests.js').catch(()=>({})) as Record<string,any>
const value={organizationId:'10000000-0000-4000-8000-000000000001',campaignId:'10000000-0000-4000-8000-000000000002',candidateIds:['10000000-0000-4000-8000-000000000003'],requestId:'10000000-0000-4000-8000-000000000004',criteriaRevision:1,intent:'resume'}
it('validates explicit scope, stable intent IDs and no arbitrary authorization flags',()=>{
 expect(api.radarResearchRequestSchema).toBeDefined()
 expect(api.radarResearchRequestSchema.safeParse(value).success).toBe(true)
 for(const changed of [{...value,candidateIds:[]},{...value,intent:'discover'},{...value,allowUnknownRetry:true},{...value,criteriaRevision:0}])expect(api.radarResearchRequestSchema.safeParse(changed).success).toBe(false)
})
it('projects useful per-item commercial states without provider errors or administrative controls',()=>{
 expect(api.projectRadarResearchRequest).toBeTypeOf('function')
 const projected=api.projectRadarResearchRequest({id:value.requestId,status:'waiting',items:[{candidate_id:value.candidateIds[0],state:'waiting',reason_code:'agent_runtime_503',run_id:'internal-run',effect_receipt:{provider:'OpenRouter',costUsd:1}}]})
 expect(projected).toMatchObject({requestId:value.requestId,state:'waiting',items:[{candidateId:value.candidateIds[0],state:'waiting'}]})
 expect(JSON.stringify(projected)).not.toMatch(/OpenRouter|costUsd|agent_runtime|effect_receipt|internal-run/)
 expect(projected.items[0].feedback).toMatchObject({status:'waiting',nextAction:'wait'})
})
