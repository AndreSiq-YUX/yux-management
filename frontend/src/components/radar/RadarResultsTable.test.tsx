import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect,it,vi } from 'vitest'
import { RadarResultsTable } from './RadarResultsTable'
import type { RadarCandidateRecord } from '@/types/radar'
it('filters the actionable review queue without losing company IDs or confusing readiness with approval',async()=>{
  const base={organizationId:'org',campaignId:'campaign',sourceType:'manual',dedupeKey:'x',status:'pending_review' as const,createdAt:'',updatedAt:''}
  const candidates=[{...base,id:'ready',title:'Empresa pronta',normalizedPayload:{researchRevision:2,researchQuality:{identity:'associated',contactability:'useful',readyForReview:true,fit:'high',missing:[]}}},
    {...base,id:'pending',title:'Empresa pendente',normalizedPayload:{researchRevision:2,researchQuality:{identity:'associated',contactability:'missing',readyForReview:false,fit:'unknown',missing:['contact']}}}]
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarResultsTable candidates={candidates} revision={2} selectedIds={[]} onSelect={()=>{}} onOpen={()=>{}}/>))
  const filter=container.querySelector<HTMLSelectElement>('select[aria-label="Filtrar por próxima ação"]')
  expect(filter).not.toBeNull()
  await act(async()=>{filter!.value='missing_contact';filter!.dispatchEvent(new Event('change',{bubbles:true}))})
  expect(container.querySelector('tbody')?.textContent).toContain('Empresa pendente')
  expect(container.querySelector('tbody')?.textContent).not.toContain('Empresa pronta')
  act(()=>root.unmount())
})

it('selects company IDs for refinement and opens details separately from a compact paginated list',async()=>{
  const candidates:RadarCandidateRecord[]=Array.from({length:22},(_,i)=>({id:`c${i}`,organizationId:'org',campaignId:'campaign',dedupeKey:`c${i}`,createdAt:'2026-10-13',updatedAt:'2026-10-13',title:`Empresa ${i}`,status:'pending_review',normalizedPayload:{city:'Cidade',state:'PR'},sourceType:'cnpja_advanced_search'}))
  candidates[0].normalizedPayload.researchAssociationNeedsReview=true
  const container=document.createElement('div'),root=createRoot(container),select=vi.fn(),open=vi.fn()
  await act(async()=>root.render(<RadarResultsTable candidates={candidates} revision={2} selectedIds={[]} onSelect={select} onOpen={open}/>))
  expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
  expect(container.textContent).toContain('Vínculo antigo precisa de revisão')
  await act(async()=>(container.querySelector('tbody input') as HTMLInputElement).click())
  expect(select).toHaveBeenCalledWith(['c0'])
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Ver detalhes')!.click())
  expect(open).not.toHaveBeenCalled()
  expect(container.querySelectorAll('tbody tr')).toHaveLength(21)
  expect(container.querySelector('tbody tr')?.nextElementSibling?.textContent).toContain('Ver detalhes completos')
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Ver detalhes completos')!.click())
  expect(open).toHaveBeenCalledWith('c0')
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Próxima')!.click())
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  expect(container.textContent).toContain('Empresa 21')
  act(()=>root.unmount())
})
it('shows a saved discovered site as pending in the row and inline summary',async()=>{
  const candidate={id:'c',title:'Alfa',normalizedPayload:{publicPresence:{version:1,configurationRevision:5,website:{url:'https://alfa.example/',association:'review',scope:'unresolved',readable:true},contacts:[]}}} as unknown as RadarCandidateRecord
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarResultsTable candidates={[candidate]} revision={5} selectedIds={[]} onSelect={vi.fn()} onOpen={vi.fn()}/>))
  expect(container.textContent).toContain('https://alfa.example/')
  expect(container.textContent).not.toContain('Site ainda não encontrado')
  await act(async()=>(container.querySelector('tbody button') as HTMLButtonElement).click())
  expect(container.querySelector('tbody tr')?.nextElementSibling?.textContent).toContain('confirmação pendente')
  expect(container.querySelector('tbody tr')?.nextElementSibling?.querySelector('td')?.colSpan).toBe(6)
  act(()=>root.unmount())
})
it('shows corroborated email and phone and current approval without falling back to an unverified registry phone',async()=>{
  const candidate:RadarCandidateRecord={id:'c',organizationId:'org',campaignId:'campaign',sourceType:'cnpja_advanced_search',dedupeKey:'c',createdAt:'',updatedAt:'',title:'Empresa aprovada',status:'pending_review',normalizedPayload:{phoneRaw:'telefone antigo',researchRevision:2,publicContacts:[{kind:'email',value:'compras@empresa.example',sourceUrl:'https://empresa.example/',observedAt:'2026-10-14',association:'confirmed'},{kind:'phone',value:'+5541999998888',sourceUrl:'https://empresa.example/',observedAt:'2026-10-14',association:'confirmed'}]}}
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarResultsTable candidates={[candidate]} revision={2} approvedIds={['c']} selectedIds={[]} onSelect={vi.fn()} onOpen={vi.fn()}/>))
  expect(container.querySelector('tbody')?.textContent).toContain('compras@empresa.example')
  expect(container.querySelector('tbody')?.textContent).toContain('+5541999998888')
  expect(container.querySelector('tbody')?.textContent).toContain('Aprovada')
  expect(container.querySelector('tbody')?.textContent).not.toContain('telefone antigo')
  act(()=>root.unmount())
})
