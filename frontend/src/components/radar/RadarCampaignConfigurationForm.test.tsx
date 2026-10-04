import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { RadarCampaignConfigurationForm } from './RadarCampaignConfigurationForm'
import { defaultRadarSearchConfiguration, radarBrazilStates } from '@/lib/radar/radarSearchConfiguration'
import type { RadarCampaign } from '@/types/radar'

function campaignFixture(patch: Partial<RadarCampaign>): RadarCampaign {
  return { id:'campaign', organizationId:'org',name:'Pesquisa',targetSegment:'Empresas',
    campaignType:'regional_b2b',targetCity:'',targetState:'',targetStates:[],targetKeywords:[],targetCnaes:[],
    productFocus:[],offerType:'Oferta',status:'draft',dailyLimit:10,automationLevel:'human_review_required',
    strategyProfileKey:'',createdAt:'',updatedAt:'',searchConfiguration:defaultRadarSearchConfiguration(),...patch }
}

describe('Radar campaign configuration panel', () => {
  it('starts without a sector preset and offers every Brazilian state', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => root.render(<RadarCampaignConfigurationForm organizationId="org" busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />))
    expect(container.textContent).not.toContain('cozinha')
    expect(container.textContent).not.toContain('5620101')
    const states = Array.from(container.querySelectorAll('label')).filter(label => radarBrazilStates.some(state => label.textContent === state))
    expect(states).toHaveLength(27)
    expect(states.every(label => !(label.querySelector('input') as HTMLInputElement).checked)).toBe(true)
    act(() => root.unmount())
  })
  it('loads and submits the saved editable configuration without running searches', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const submit = vi.fn(async () => undefined)
    const config = defaultRadarSearchConfiguration()
    config.cities = [{city:'Salvador',state:'BA'}]
    config.qualification.includeAnyTerms = ['consultoria de tecnologia']
    config.sources.enrichWithBrave = false
    config.exportFields = ['name','phone','email']
    const campaign = { id:'campaign',organizationId:'org',name:'Pesquisa tecnologia',targetSegment:'Tecnologia',
      campaignType:'regional_b2b',targetStates:['BA'],targetKeywords:['software'],targetCnaes:['6201501'],
      productFocus:['automação'],offerType:'Consultoria',dailyLimit:7,searchConfiguration:config } as RadarCampaign
    act(() => root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaign} busy={false} onSubmit={submit} onCancel={vi.fn()} />))
    expect(submit).not.toHaveBeenCalled()
    expect(container.querySelector('textarea')?.value).toBe('Salvador/BA')
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles:true,cancelable:true })) })
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ targetStates:['BA'],targetCnaes:['6201501'],
      searchConfiguration: expect.objectContaining({cities:[{city:'Salvador',state:'BA'}],
        sources:{enrichWithBrave:false,inspectWebsite:true},exportFields:['name','phone','email']}) }))
    act(() => root.unmount())
  })
  it('rejects empty regions before saving', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const submit = vi.fn(async () => undefined)
    act(() => root.render(<RadarCampaignConfigurationForm organizationId="org" busy={false} onSubmit={submit} onCancel={vi.fn()} />))
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})) })
    expect(submit).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Selecione pelo menos uma UF')
    act(() => root.unmount())
  })

  it.each([['PR'], ['MG', 'SP', 'PR']])('submits entire states %j without a city', async (...states) => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const submit = vi.fn(async () => undefined)
    const campaign = campaignFixture({ targetStates:states })
    act(() => root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaign} busy={false} onSubmit={submit} onCancel={vi.fn()} />))
    expect(container.querySelector('textarea[required]')).toBeNull()
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})) })
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ targetStates:states,
      searchConfiguration:expect.objectContaining({cities:[]}) }))
    expect(submit).toHaveBeenCalledWith(expect.not.objectContaining({targetCity:expect.anything()}))
    act(() => root.unmount())
  })

  it('requires cities only for city scope and clears city filters when switched to entire states', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const submit = vi.fn(async () => undefined)
    const config = defaultRadarSearchConfiguration()
    config.cities = [{city:'Curitiba',state:'PR'},{city:'Campinas',state:'SP'}]
    const campaign = campaignFixture({ targetStates:['PR','SP'], searchConfiguration:config })
    act(() => root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaign} busy={false} onSubmit={submit} onCancel={vi.fn()} />))
    expect(container.querySelector('textarea[required]')).not.toBeNull()
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})) })
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({cities:config.cities})}))
    const scope = container.querySelector('select')!
    act(() => { scope.value = 'states'; scope.dispatchEvent(new Event('change',{bubbles:true})) })
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})) })
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({cities:[]})}))
    act(() => root.unmount())
  })

  it('rejects city scope without cities', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const submit = vi.fn(async () => undefined)
    act(() => root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['PR']})} busy={false} onSubmit={submit} onCancel={vi.fn()} />))
    const scope = container.querySelector('select')!
    act(() => { scope.value = 'cities'; scope.dispatchEvent(new Event('change',{bubbles:true})) })
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})) })
    expect(submit).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Informe pelo menos uma cidade')
    act(() => root.unmount())
  })
})
