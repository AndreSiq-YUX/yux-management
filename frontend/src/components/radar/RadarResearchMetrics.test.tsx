import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {describe,it,expect,vi} from 'vitest'
import {RadarResearchMetrics} from './RadarResearchMetrics'
import {radarService} from '@/services/radarService'
vi.mock('@/services/radarService',()=>({radarService:{getResearchMetrics:vi.fn(async()=>({companies:7,identified:6,withUsefulContact:5,readyForReview:4,sources:[],searchEstimatedBrl:2})),getCommercialResearchMetrics:vi.fn(async()=>({companies:7,identified:6,withUsefulContact:5,readyForReview:4}))}}))
describe('business metrics audience',()=>{
 it('requests only commercial indicators when internal costs are not authorized',async()=>{
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarResearchMetrics campaignId="campaign" organizationId="org" showCosts={false}/>))
  expect(radarService.getResearchMetrics).not.toHaveBeenCalled()
  expect(radarService.getCommercialResearchMetrics).toHaveBeenCalled()
  expect(container.textContent).toContain('Resultados da pesquisa');expect(container.textContent).toContain('7 pesquisadas')
  expect(container.textContent).not.toMatch(/consumo|UTC|R\$|IA:|Detalhamento/)
  act(()=>root.unmount())
 })
})
