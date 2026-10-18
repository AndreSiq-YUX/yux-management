import { expect, it } from 'vitest'
import { validateRadarCompanyProfile,validateRadarCompanyProfileClaims } from '../src/modules/radar/company-profile.js'
const pages=[{url:'https://alfa.example/',observedAt:'2026-10-12',text:'Fornecemos refeições para empresas. Em 2025 contamos com 12 unidades.'}]
const claim={value:'Alimentação empresarial',evidenceId:'page-0',excerpt:'Fornecemos refeições para empresas.'}
it('quarantines individual invalid profile claims without discarding valid facts or fabricating replacements',()=>{
 const raw={summary:claim,services:[claim,{...claim,evidenceId:'invented'}],scaleSignals:[{...claim,metric:'units',amount:900}]}
 const result=validateRadarCompanyProfileClaims(raw,pages)
 expect(result.profile.summary).toMatchObject({value:claim.value,sourceUrl:pages[0].url})
 expect(result.profile.services).toHaveLength(1)
 expect(result.profile.scaleSignals).toEqual([])
 expect(result.rejections).toEqual([{field:'services.1',code:'radar_profile_unverifiable'},{field:'scaleSignals.0',code:'radar_profile_unverifiable'}])
 expect(()=>validateRadarCompanyProfile(raw,pages)).toThrow('radar_profile_unverifiable')
})
it('attaches source and observation date from trusted evidence, not model output',()=>{
  const result=validateRadarCompanyProfile({summary:claim,services:[claim]},pages)
  expect(result.summary).toMatchObject({sourceUrl:pages[0].url,observedAt:pages[0].observedAt})
  expect(result.scaleSignals).toEqual([])
})
it('rejects fabricated citations, numbers, dates, and scale measurements',()=>{
  for(const profile of [
    {summary:{...claim,evidenceId:'invented'}}, {summary:{...claim,excerpt:'comprando agora'}},
    {summary:{...claim,value:'Atende 900 clientes'}},
    {scaleSignals:[{...claim,metric:'units',amount:900,referenceDate:'2025-12-31'}]},
  ]) expect(()=>validateRadarCompanyProfile(profile,pages)).toThrow('radar_profile_unverifiable')
})
it('requires the declared metric and annual period, not merely a matching number or publication year',()=>{
  for(const [metric,excerpt] of [
    ['units','Em 2025 temos 12 funcionários.'],
    ['annualMeals','Em 2025 servimos 12 refeições por dia.'],
    ['annualRevenue','Receita mensal de R$ 12 em 2025.'],
  ])expect(()=>validateRadarCompanyProfile({scaleSignals:[{value:excerpt,evidenceId:'page-0',excerpt,metric,amount:12}]},
    [{...pages[0],text:excerpt}])).toThrow('radar_profile_unverifiable')
  const excerpt='Em 2025 servimos 12 refeições por ano.'
  expect(validateRadarCompanyProfile({scaleSignals:[{value:excerpt,evidenceId:'page-0',excerpt,metric:'annualMeals',amount:12,referenceDate:'2025-12-31'}]},
    [{...pages[0],text:excerpt}]).scaleSignals[0].amount).toBe(12)
})
