import {expect,it} from 'vitest'
import {decisionContextSchema,decisionResultSchema} from '../src/modules/radar/decision-contracts.js'
const id='10000000-0000-4000-8000-000000000001'
it('accepts bounded registry facts, target definitions and a durable step on a versioned fit decision',()=>{
 const context={schemaVersion:1,organizationId:id,campaignId:id,candidateId:id,configurationRevision:2,task:'radar_fit_gate',contextVersion:'radar-decision-context-v2',step:3,identity:{name:'Empresa'},criteria:{targets:[{key:'target',label:'Perfil',definition:'Produção para empresas',priority:'primary'}]},evidence:[{id:'registry',sourceUrl:'https://cnpja.com/office/12345678000190',text:'Dados cadastrais',role:'registry',primary:true,scope:'establishment'}],options:[]}
 expect(decisionContextSchema.parse(context)).toMatchObject({task:'radar_fit_gate',contextVersion:'radar-decision-context-v2',step:3})
})
it('validates matching context/question/rubric versions without rejecting saved v1 results',()=>{
 const result={schemaVersion:1,task:'radar_initial_triage',status:'decided',choice:'compatible',reasonCode:'fit_supported',evidenceIds:[],probabilities:{compatible:1},requestedModel:'fixture',resolvedModel:'fixture-snapshot',adapterVersion:'openrouter-decisions-alpha-v1',contextVersion:'radar-decision-context-v2',questionVersion:'radar-decisions-questions-v2',criteriaRubricVersion:'radar-decisions-rubric-v2',matchedTargetKey:'target',attempts:[],usage:{costUsd:0,inputTokens:1,outputTokens:0}}
 expect(decisionResultSchema.parse(result)).toMatchObject({matchedTargetKey:'target'})
 expect(()=>decisionResultSchema.parse({...result,questionVersion:'radar-decisions-questions-v1'})).toThrow()
 const {matchedTargetKey:_,...legacy}=result
 expect(decisionResultSchema.parse({...legacy,contextVersion:'radar-decision-context-v1',questionVersion:'radar-decisions-questions-v1',criteriaRubricVersion:'radar-decisions-rubric-v1'}).status).toBe('decided')
})
