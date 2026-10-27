import { expect, it } from 'vitest'
import { companyStrategyProposalSchema } from '../src/modules/company-strategy/schemas.js'
const content={schemaVersion:1,title:'Estratégia para oficina',objective:'Aumentar agendamentos da oficina',summary:'Priorizar serviços preventivos e retorno dos clientes.',sections:[],references:{productIds:[],documentIds:[]}}
it('accepts a consultative proposal without an action pack or execution budget',()=>{
  expect(companyStrategyProposalSchema.parse({content,sourceRefs:[]}).content.title).toBe('Estratégia para oficina')
})
it('requires a complete base for edits and rejects forged actor/tenant fields',()=>{
  expect(companyStrategyProposalSchema.safeParse({strategyId:'10000000-0000-4000-8000-000000000001',content,sourceRefs:[]}).success).toBe(false)
  expect(companyStrategyProposalSchema.safeParse({content,sourceRefs:[],organizationId:'10000000-0000-4000-8000-000000000002'}).success).toBe(false)
})
