import {act} from 'react-dom/test-utils'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {useLeadOperations} from './useLeadOperations'
import {apiRequest} from '@/lib/apiClient'
import type {CrmLead} from '@/types/crm'
vi.mock('@/lib/apiClient',()=>({apiRequest:vi.fn()}))
it('opens an activity before saving and discards completion when another lead replaces it',async()=>{
 const lead={id:'one',organizationId:'org',pipelineId:'p',stageId:'s',name:'One',email:'',source:'',score:0,createdAt:'',updatedAt:''} satisfies CrmLead
 let ops:ReturnType<typeof useLeadOperations>,resolve:()=>void=()=>{}
 const changed=vi.fn();vi.mocked(apiRequest).mockImplementation(()=>new Promise<void>(r=>{resolve=r}))
 function Host({id}:{id:string}){ops=useLeadOperations({lead:{...lead,id},organizationId:'org',onChanged:changed});return <p>{ops.action}</p>}
 const host=document.createElement('div'),root=createRoot(host)
 try{
  await act(async()=>root.render(<Host id="one"/>));await act(async()=>ops!.open('task'))
  expect(host.textContent).toBe('task');expect(apiRequest).not.toHaveBeenCalled()
  let saving:Promise<boolean>;await act(async()=>{saving=ops!.saveActivity('task',{title:'Retorno',description:'',dueAt:'2026-11-20T13:00:00.000Z'})})
  expect(apiRequest).toHaveBeenCalledWith('/crm/leads/one/activities',expect.objectContaining({method:'POST',body:expect.objectContaining({kind:'task',title:'Retorno'})}))
  await act(async()=>root.render(<Host id="two"/>));await act(async()=>{resolve();await saving!})
  expect(changed).not.toHaveBeenCalled()
 }finally{act(()=>root.unmount())}
})
