import { expect,it } from 'vitest'
import { classifyRadarOperation } from '../src/modules/action-engine/radar-operation-waits.js'
const ref={operationType:'capture' as const,operationId:'a',requestId:'b',campaignId:'c',configurationRevision:1,criteriaRevision:1}
it('does not finish a research operation merely because its request was accepted',()=>{
 expect(classifyRadarOperation(ref,{status:'researching',counts:{requested:100,admitted:10,researching:8,completed:2}})).toMatchObject({status:'pending'})
})
it('keeps partial lots with applicable work pending and never counts found companies as approved leads',()=>{
 expect(classifyRadarOperation(ref,{status:'partial',counts:{requested:100,admitted:10,researching:2,completed:8}})).toMatchObject({status:'pending'})
 const result=classifyRadarOperation(ref,{status:'partial',counts:{requested:100,admitted:10,researching:0,completed:8,completedWithGaps:2}})
 expect(result).toMatchObject({status:'partial',counts:{requested:100,found:10,complete:8,withGaps:2,approved:0}})
})
it('reports missing capacity as a blocker, not evidence that a company has no website',()=>{
 expect(classifyRadarOperation(ref,{status:'blocked',counts:{requested:100,admitted:0}})).toMatchObject({status:'blocked',message:'A pesquisa aguarda uma ação do responsável.'})
})
