import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LeadDataEditor } from './LeadDataEditor'
import { apiRequest } from '@/lib/apiClient'
import type { CrmLead } from '@/types/crm'
vi.mock('@/lib/apiClient', () => ({ apiRequest: vi.fn() }))
it('sends only edited fields with their original values despite a background lead update', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    saved = vi.fn()
  vi.mocked(apiRequest).mockResolvedValue({})
  const lead = {
    id: 'lead',
    name: 'Empresa',
    city: 'Londrina',
    phone: '111',
    email: 'a@alfa.test',
  } as CrmLead
  try {
    await act(async () =>
      root.render(
        <LeadDataEditor lead={lead} onSaved={saved} onCancel={() => {}} />,
      ),
    )
    await act(async () => {
      const input = host.querySelector('#lead-data-phone') as HTMLInputElement
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, '222')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () =>
      root.render(
        <LeadDataEditor
          lead={{ ...lead, city: 'Maringá' }}
          onSaved={saved}
          onCancel={() => {}}
        />,
      ),
    )
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    )
    expect(apiRequest).toHaveBeenCalledWith('/crm/leads/lead', {
      method: 'PATCH',
      body: { phone: '222', expectedValues: { phone: '111' } },
    })
  } finally {
    act(() => root.unmount())
  }
})

it('can explicitly clear a historical site that exists only in the imported profile',async()=>{
 vi.clearAllMocks();vi.mocked(apiRequest).mockResolvedValue({})
 const host=document.createElement('div'),root=createRoot(host)
 try{
  await act(async()=>root.render(<LeadDataEditor lead={{id:'lead',name:'Empresa',commercialProfile:{websiteUrl:'https://old.example'}} as CrmLead} onSaved={()=>{}} onCancel={()=>{}}/>))
  const input=host.querySelector('#lead-data-websiteUrl') as HTMLInputElement
  expect(input.value).toBe('https://old.example')
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}))})
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  expect(apiRequest).toHaveBeenCalledWith('/crm/leads/lead',{method:'PATCH',body:{websiteUrl:'',expectedValues:{websiteUrl:null}}})
 }finally{act(()=>root.unmount())}
})
