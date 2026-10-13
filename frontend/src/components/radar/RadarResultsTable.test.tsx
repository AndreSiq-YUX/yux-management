import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect,it,vi } from 'vitest'
import { RadarResultsTable } from './RadarResultsTable'
import type { RadarCandidateRecord } from '@/types/radar'

it('selects company IDs for refinement and opens details separately from a compact paginated list',async()=>{
  const candidates:RadarCandidateRecord[]=Array.from({length:22},(_,i)=>({id:`c${i}`,organizationId:'org',campaignId:'campaign',dedupeKey:`c${i}`,createdAt:'2026-10-13',updatedAt:'2026-10-13',title:`Empresa ${i}`,status:'pending_review',normalizedPayload:{city:'Cidade',state:'PR'},sourceType:'cnpja_advanced_search'}))
  const container=document.createElement('div'),root=createRoot(container),select=vi.fn(),open=vi.fn()
  await act(async()=>root.render(<RadarResultsTable candidates={candidates} revision={2} selectedIds={[]} onSelect={select} onOpen={open}/>))
  expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
  await act(async()=>(container.querySelector('tbody input') as HTMLInputElement).click())
  expect(select).toHaveBeenCalledWith(['c0'])
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Ver detalhes')!.click())
  expect(open).toHaveBeenCalledWith('c0')
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Próxima')!.click())
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  expect(container.textContent).toContain('Empresa 21')
  act(()=>root.unmount())
})
