import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {RadarCandidateSummary} from './RadarCandidateSummary'
import type {RadarCandidateRecord} from '@/types/radar'
it('shows supplier forms as sourced pending channels and opens full details without a new research call',async()=>{
  const container=document.createElement('div'),root=createRoot(container),open=vi.fn()
  await act(async()=>root.render(<RadarCandidateSummary candidate={{id:'c',organizationId:'org',campaignId:'campaign',sourceType:'manual',status:'pending_review',dedupeKey:'c',createdAt:'',updatedAt:'',title:'Alfa',normalizedPayload:{publicPresence:{version:1,configurationRevision:5,website:{url:'https://alfa.example/',association:'review'},contacts:[{kind:'contact_form',value:'https://alfa.example/fornecedor/',sourceUrl:'https://alfa.example/fornecedor/',observedAt:'2026-10-14',association:'review',purpose:'suppliers'}]}}} as RadarCandidateRecord} revision={5} onOpenFull={open}/>))
  expect(container.textContent).toContain('fornecedores');expect(container.textContent).toContain('Associação pendente')
  expect(container.querySelector('a[href="https://alfa.example/fornecedor/"]')?.textContent).toBe('Abrir formulário público')
  await act(async()=>container.querySelector('button')!.click());expect(open).toHaveBeenCalledWith('c')
  act(()=>root.unmount())
})
