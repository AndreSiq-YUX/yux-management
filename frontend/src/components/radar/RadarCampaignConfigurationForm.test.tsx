import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RadarCampaignConfigurationForm } from './RadarCampaignConfigurationForm'
import { defaultRadarSearchConfiguration, radarBrazilStates } from '@/lib/radar/radarSearchConfiguration'
import type { RadarCampaign } from '@/types/radar'
import {radarService} from '@/services/radarService'
import {radarPolicyFixture} from '@/test/fixtures/radarOperationalPolicy'
import {publishRadarOperationalPolicy} from '@/lib/radar/useRadarOperationalPolicy'

function campaignFixture(patch: Partial<RadarCampaign>): RadarCampaign {
  return { id:'campaign', organizationId:'org',name:'Pesquisa',targetSegment:'Empresas',
    campaignType:'regional_b2b',targetCity:'',targetState:'',targetStates:[],targetKeywords:[],targetCnaes:[],
    productFocus:[],offerType:'Oferta',status:'draft',dailyLimit:10,automationLevel:'human_review_required',
    strategyProfileKey:'',createdAt:'',updatedAt:'',searchConfiguration:defaultRadarSearchConfiguration(),...patch }
}

describe('Radar campaign configuration panel', () => {
  it('preserves an unsaved legacy City/UF draft across the new single-UF presentation',async()=>{
    const host=document.createElement('div'),submit=vi.fn(async()=>undefined),config=defaultRadarSearchConfiguration()
    config.cities=[{city:'Bauru',state:'SP'}]
    const campaign=campaignFixture({targetStates:['SP'],searchConfiguration:config}),key='legacy-city-draft'
    const render=()=> <RadarCampaignConfigurationForm organizationId="org" draftKey={key} initialCampaign={campaign} busy={false} onSubmit={submit} onCancel={vi.fn()}/>
    let root=createRoot(host)
    try{
      await act(async()=>root.render(render()))
      await act(async()=>{const field=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'Alteração ainda não salva');field.dispatchEvent(new Event('input',{bubbles:true}))})
      act(()=>root.unmount())
      const stored=JSON.parse(sessionStorage.getItem(`yux-radar-draft:${key}`)!)
      stored.original=JSON.stringify({...JSON.parse(stored.original),cities:'Bauru/SP'})
      stored.value.cities='Bauru/SP'
      sessionStorage.setItem(`yux-radar-draft:${key}`,JSON.stringify(stored))
      root=createRoot(host);await act(async()=>root.render(render()))
      expect(host.querySelector('input')!.value).toBe('Alteração ainda não salva')
      expect(host.querySelector<HTMLTextAreaElement>('textarea[required]')!.value).toBe('Bauru/SP')
    }finally{act(()=>root.unmount())}
  })
  it('shows and submits existing cities without repeating a single selected UF',async()=>{
    const host=document.createElement('div'),root=createRoot(host),submit=vi.fn(async()=>undefined),config=defaultRadarSearchConfiguration()
    config.cities=[{city:'Bauru',state:'SP'}]
    try{
      await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['SP'],searchConfiguration:config})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
      const cities=host.querySelector<HTMLTextAreaElement>('textarea[required]')!
      expect(cities.value).toBe('Bauru')
      expect(host.textContent).toContain('será aplicada automaticamente')
      await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(cities,'Bauru\nPresidente Prudente');cities.dispatchEvent(new Event('input',{bubbles:true}))})
      await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({cities:[{city:'Bauru',state:'SP'},{city:'Presidente Prudente',state:'SP'}]})}))
    }finally{act(()=>root.unmount())}
  })
  it('preserves the original UF explicitly when the selected region changes',async()=>{
    const host=document.createElement('div'),root=createRoot(host),submit=vi.fn(async()=>undefined),config=defaultRadarSearchConfiguration()
    config.cities=[{city:'Bauru',state:'SP'}]
    try{
      await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['SP'],searchConfiguration:config})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
      expect(host.querySelector<HTMLTextAreaElement>('textarea[required]')!.value).toBe('Bauru')
      await act(async()=>[...host.querySelectorAll('label')].find(label=>label.textContent==='RJ')!.querySelector('input')!.click())
      expect(host.querySelector<HTMLTextAreaElement>('textarea[required]')!.value).toBe('Bauru/SP')
      await act(async()=>[...host.querySelectorAll('label')].find(label=>label.textContent==='SP')!.querySelector('input')!.click())
      await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
      expect(submit).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toContain('Selecione a UF SP')
    }finally{act(()=>root.unmount())}
  })
  it('does not render tool names, order controls or costs without the system Admin capability',async()=>{
    const host=document.createElement('div'),root=createRoot(host)
    try{
      await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['SP'],budgetLimit:10})} busy={false} onSubmit={vi.fn(async()=>undefined)} onCancel={vi.fn()}/>))
      const rendered=[host.textContent,...[...host.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea')].map(field=>field.value)].join(' ')
      expect(rendered).not.toMatch(/brave|serper|perplexity|cnpj[aá]|Ordem das fontes|Orçamento máximo|controle de custo/i)
    }finally{act(()=>root.unmount())}
  })
  it('keeps system Admin tool configuration functional but collapsed and explicitly internal',async()=>{
    const host=document.createElement('div'),root=createRoot(host)
    try{
      await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" canConfigureProviders initialCampaign={campaignFixture({targetStates:['SP']})} busy={false} onSubmit={vi.fn(async()=>undefined)} onCancel={vi.fn()}/>))
      const label=[...host.querySelectorAll('label')].find(item=>item.textContent?.startsWith('Ordem das fontes de descoberta'))!
      const section=label.closest('details')
      expect(section).not.toBeNull();expect(section!.open).toBe(false)
      expect(section!.querySelector('summary')?.textContent).toContain('exclusiva do Admin YUX')
      await act(async()=>section!.querySelector('summary')!.click())
      expect(section!.open).toBe(true);expect(label.querySelector('textarea')?.value).toContain('serper_web_search')
    }finally{act(()=>root.unmount())}
  })
  it('submits every research stage for a new campaign without technical activation',async()=>{
    const host=document.createElement('div'),root=createRoot(host),submit=vi.fn(async()=>undefined)
    try{
      await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="another-org" canConfigureProviders busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
      await act(async()=>{
        for(const [label,value] of [['Nome da pesquisa','Pesquisa de manutenção'],['Segmento ou público desejado','Manutenção'],['Oferta ou objetivo comercial','Equipamentos']] as const){
          const field=[...host.querySelectorAll('label')].find(item=>item.textContent?.startsWith(label))!.querySelector('input')!
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value)
          field.dispatchEvent(new Event('input',{bubbles:true}))
        }
        [...host.querySelectorAll('label')].find(item=>item.textContent==='SC')!.querySelector('input')!.click()
      })
      await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({organizationId:'another-org',targetSegment:'Manutenção',targetStates:['SC'],searchConfiguration:expect.objectContaining({
        discovery:expect.objectContaining({enabled:true}),funnel:expect.objectContaining({enabled:true,g3:{mode:'effective'}}),
        research:expect.objectContaining({enabled:true,webSearchEnabled:true,presenceResolutionEnabled:true,semanticQualificationEnabled:true,profileEnabled:true,deepResearchEnabled:true,inspectLinkedSocialProfiles:true,completion:expect.objectContaining({enabled:true,requireSegment:true})}),
      })}))
      expect(submit).toHaveBeenCalledTimes(1)
    }finally{act(()=>root.unmount())}
  })
  beforeEach(()=>{sessionStorage.clear();vi.spyOn(radarService,'getOperationalPolicy').mockResolvedValue(radarPolicyFixture)})
  it('updates campaign ceilings after an Admin policy save, without starting a search',async()=>{
    const submit=vi.fn(async()=>{}),host=document.createElement('div'),root=createRoot(host)
    await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" canConfigureProviders initialCampaign={campaignFixture({targetStates:['PE']})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
    const page=()=>[...host.querySelectorAll('label')].find(label=>label.textContent?.includes('Páginas por região no lote'))!.querySelector('input')!
    expect(page().max).toBe('10')
    await act(async()=>publishRadarOperationalPolicy({...radarPolicyFixture,version:2,limits:{...radarPolicyFixture.limits,maxPagesPerScope:40}}))
    expect(page().max).toBe('40');expect(submit).not.toHaveBeenCalled()
    act(()=>root.unmount())
  })
  it('lets each campaign define completion requirements without requiring a website',async()=>{
    const config=defaultRadarSearchConfiguration(),submit=vi.fn(async()=>undefined),container=document.createElement('div'),root=createRoot(container)
    config.research!.completion!.enabled=false // Existing saved campaign, before the complete creation default.
    await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['PE'],searchConfiguration:config})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
    const toggle=container.querySelector<HTMLInputElement>('input[aria-label="Definir quando a pesquisa está suficiente"]')
    expect(toggle).not.toBeNull()
    await act(async()=>toggle!.click())
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({research:expect.objectContaining({completion:expect.objectContaining({enabled:true,requireWebsite:false})})})}))
    act(()=>root.unmount())
  })
  it('offers editable local research ordering and saves without running research',async()=>{
    const config=defaultRadarSearchConfiguration(),submit=vi.fn(async()=>undefined),container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['PE'],searchConfiguration:config})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
    const choice=container.querySelector<HTMLSelectElement>('select[aria-label="Quando complementar com busca local"]')
    expect(choice).not.toBeNull()
    await act(async()=>{choice!.value='after_web_if_needed';choice!.dispatchEvent(new Event('change',{bubbles:true}))})
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({research:expect.objectContaining({localSearchOrder:'after_web_if_needed'})})}))
    act(()=>root.unmount())
  })
  it('persists the explicit primary web provider and fallback without querying either provider',async()=>{
    const config=defaultRadarSearchConfiguration(),submit=vi.fn(async()=>undefined),container=document.createElement('div'),root=createRoot(container)
    config.research!.webSearchProviders=['serper_web_search','brave_web_search']
    config.research!.presenceResolutionEnabled=true
    await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" canConfigureProviders initialCampaign={campaignFixture({targetStates:['PE'],searchConfiguration:config})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Fonte principal da pesquisa web"]')?.value).toBe('serper_web_search')
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    expect(container.textContent).toContain('Identificar site e canais oficiais por IA')
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({research:expect.objectContaining({webSearchProviders:['serper_web_search','brave_web_search'],presenceResolutionEnabled:true})})}))
    act(()=>root.unmount())
  })
  it('lets only the system admin edit per-source research caps and an optional aggregate cap',async()=>{
    const submit=vi.fn(async()=>undefined),container=document.createElement('div'),root=createRoot(container)
    const campaign=campaignFixture({targetStates:['SP']})
    try{
      await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" canConfigureProviders initialCampaign={campaign} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
      const source=container.querySelector<HTMLInputElement>('input[aria-label="Consultas Serper Web por empresa"]')
      const total=container.querySelector<HTMLInputElement>('input[aria-label="Teto total de consultas por empresa"]')
      expect(source).not.toBeNull();expect(total).not.toBeNull()
      await act(async()=>{
        for(const [input,value] of [[source,'4'],[total,'9']] as const){
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value)
          input!.dispatchEvent(new Event('input',{bubbles:true}))
        }
      })
      await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({research:expect.objectContaining({maxSearchQueriesBySource:{serper_web_search:4},maxSearchQueriesTotalPerCandidate:9})})}))
      await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaign} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
      expect(container.querySelector('[aria-label="Consultas Serper Web por empresa"]')).toBeNull()
      expect(container.querySelector('[aria-label="Teto total de consultas por empresa"]')).toBeNull()
    }finally{act(()=>root.unmount())}
  })
  it('restores unsaved edits after route unmount, isolates campaign drafts and clears after saving',async()=>{
    const container=document.createElement('div'),submit=vi.fn(async()=>undefined),campaign=campaignFixture({targetStates:['PE']})
    let root=createRoot(container)
    const render=(key='user-org-campaign')=><RadarCampaignConfigurationForm organizationId="org" draftKey={key} initialCampaign={campaign} busy={false} onSubmit={submit} onCancel={vi.fn()}/>
    await act(async()=>root.render(render()))
    const input=container.querySelector('input')!
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Rascunho não salvo');input.dispatchEvent(new Event('input',{bubbles:true}))})
    act(()=>root.unmount());root=createRoot(container)
    await act(async()=>root.render(render('other-user-org-campaign')))
    expect(container.querySelector('input')!.value).toBe('Pesquisa')
    act(()=>root.unmount());root=createRoot(container)
    await act(async()=>root.render(render()))
    expect(container.querySelector('input')!.value).toBe('Rascunho não salvo')
    expect(container.textContent).toContain('Rascunho recuperado')
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({name:'Rascunho não salvo'}))
    act(()=>root.unmount());root=createRoot(container)
    await act(async()=>root.render(render()))
    expect(container.querySelector('input')!.value).toBe('Pesquisa')
    act(()=>root.unmount())
  })
  it('renders saved configuration as read-only without offering or submitting changes',async()=>{
    const container=document.createElement('div'),root=createRoot(container),submit=vi.fn(async()=>undefined)
    await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['PE']})} busy={false} readOnly onSubmit={submit} onCancel={vi.fn()}/>))
    expect(container.querySelector('fieldset')?.disabled).toBe(true)
    expect(container.querySelector('button[type="submit"]')).toBeNull()
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    expect(submit).not.toHaveBeenCalled()
    act(()=>root.unmount())
  })
  it('preserves a local campaign type and city when editing without converting it to regional',async()=>{
    const container=document.createElement('div'),root=createRoot(container),submit=vi.fn(async()=>undefined)
    await act(async()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({campaignType:'recently_opened',targetCity:'Recife',targetState:'PE'})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({campaignType:'recently_opened',targetCity:'Recife',targetState:'PE'}))
    act(()=>root.unmount())
  })
  it('keeps size optional and persists editable weights, thresholds, direction and purpose',async()=>{
    const container=document.createElement('div'),root=createRoot(container),submit=vi.fn(async()=>undefined)
    const config=defaultRadarSearchConfiguration()
    config.research!.profileEnabled=true;config.research!.contactPurpose='suppliers'
    config.research!.sizeAssessment={enabled:true,direction:'smaller',criteria:[{metric:'employees',weight:3,maxAgeDays:730,bands:[{min:0,points:0},{min:50,points:90}]}]}
    act(()=>root.render(<RadarCampaignConfigurationForm organizationId="org" initialCampaign={campaignFixture({targetStates:['BA'],searchConfiguration:config})} busy={false} onSubmit={submit} onCancel={vi.fn()}/>))
    expect(container.textContent).toContain('Peso');expect(container.textContent).toContain('Pontos de tamanho')
    await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({searchConfiguration:expect.objectContaining({research:expect.objectContaining({contactPurpose:'suppliers',sizeAssessment:config.research!.sizeAssessment})})}))
    act(()=>root.unmount())
  })
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
    expect(container.querySelector('textarea')?.value).toBe('Salvador')
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
