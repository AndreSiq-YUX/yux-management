import {act} from 'react-dom/test-utils'
import {createRoot} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
import {LeadActivityComposer} from './LeadActivityComposer'
import {LeadEmailComposer} from './LeadEmailComposer'
import {apiRequest} from '@/lib/apiClient'
import type {CrmLead} from '@/types/crm'
vi.mock('@/lib/apiClient',()=>({apiRequest:vi.fn()}))
let cleanup=()=>{}
afterEach(()=>{cleanup();vi.resetAllMocks()})
async function mount(element:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);cleanup=()=>{act(()=>root.unmount());host.remove()};await act(async()=>root.render(element));return host}
it('requires a date when scheduling and never pretends that an external invitation was sent',async()=>{
 const save=vi.fn();const host=await mount(<LeadActivityComposer kind="meeting" busy={false} onSave={save} onCancel={()=>{}}/>)
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 expect(host.textContent).toContain('Preencha o título e a data e hora.');expect(save).not.toHaveBeenCalled()
 expect(host.textContent).toContain('Nenhum convite externo é enviado automaticamente.')
})
it('explains unavailable sender and provides an explicit mail app destination',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({canSend:false,message:'Envio precisa ser configurado.',requests:[]})
 const lead={id:'one',name:'Empresa',email:'compras@empresa.test'} as CrmLead
 const host=await mount(<LeadEmailComposer lead={lead} onSent={()=>{}} onCancel={()=>{}}/>)
 expect(host.textContent).toContain('Envio precisa ser configurado.')
 expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
 expect(host.querySelector('a')?.getAttribute('href')).toMatch(/^mailto:compras%40empresa.test/)
})
