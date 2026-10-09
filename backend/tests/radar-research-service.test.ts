import { expect, it, vi } from 'vitest'
import { runRadarResearchPipeline } from '../src/modules/radar/research-service.js'
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js'
const identity = { name: 'Empresa Alfa', cnpj: '12345678000190', city:'Curitiba',state:'PR',phone:'4133334444' }
const configuration = resolveRadarSearchConfiguration({ research: { enabled:true, webSearchEnabled:true } })
it('retains_contacts_when_target_fit_is_unknown_and_keeps_registry_phone_separate', async () => {
  const local = vi.fn(async () => [])
  const web = vi.fn(async () => [{ url:'https://alfa.example',title:'Alfa',snippets:['12.345.678/0001-90'],observedAt:'2026-10-08' }])
  const pages = [{url:'https://alfa.example',observedAt:'2026-10-08',text:'Empresa Alfa 12.345.678/0001-90',html:'<a href="tel:41999998888">Contato</a>'}]
  const result = await runRadarResearchPipeline(identity, configuration, {}, { local, web, collect:async () => pages, checkpoint:async () => {} })
  expect(result.contacts[0].value).toBe('+5541999998888')
  expect(result.registryPhone).toBe('4133334444')
  expect(result.qualification).toBeUndefined()
})
it('resumes_completed_stages_without_rebilling_and_does_not_send_outreach', async () => {
  const local = vi.fn(), web = vi.fn(), collect = vi.fn()
  const cached = { discovery: { association:'confirmed' as const,websiteUrl:'https://alfa.example',hits:[],suggestions:[],limitations:[],queries:1 },
    readingComplete:true, pages:[{ url:'https://alfa.example',observedAt:'2026-10-08',text:'12.345.678/0001-90' }] }
  await runRadarResearchPipeline(identity, configuration, cached, { local, web, collect, checkpoint:async () => {} })
  expect(local).not.toHaveBeenCalled(); expect(web).not.toHaveBeenCalled(); expect(collect).not.toHaveBeenCalled()
})
it('handles_company_without_website_without_inventing_missing_data', async () => {
  const result = await runRadarResearchPipeline(identity, configuration, {}, { web: async () => [], checkpoint:async () => {} })
  expect(result.contacts).toEqual([])
  expect(result.activity.status).toBe('inconclusive')
  expect(result.discovery.association).toBe('not_found_in_consulted_sources')
})
it('does_not_confirm_contacts_from_another_branch_on_the_same_domain',async()=>{
  const pages=[{url:'https://alfa.example',observedAt:'2026-10-08',text:'Empresa Alfa 12.345.678/0001-90'},
    {url:'https://alfa.example/contato',observedAt:'2026-10-08',text:'Outra filial 12.345.678/0002-71',html:'<a href="tel:41999998888">Contato da filial</a>'}]
  const result=await runRadarResearchPipeline(identity,configuration,{readingComplete:true,pages,discovery:{association:'confirmed',websiteUrl:'https://alfa.example',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{}})
  expect(result.contacts[0].association).toBe('review')
})
