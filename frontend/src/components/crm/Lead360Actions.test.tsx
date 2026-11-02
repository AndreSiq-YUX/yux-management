import {act} from 'react-dom/test-utils'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {expect,it,vi} from 'vitest'
import {Lead360Panel} from './Lead360Panel'
import type {CrmLead} from '@/types/crm'
it('every identity action opens its corresponding workflow instead of silently doing nothing',async()=>{
 const lead={id:'lead',organizationId:'org',pipelineId:'pipeline',stageId:'stage',name:'Empresa',email:'a@empresa.test',source:'Manual',score:0,createdAt:'',updatedAt:''} satisfies CrmLead
 const action=vi.fn(),host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 try{
  await act(async()=>root.render(<MemoryRouter><Lead360Panel lead={lead} interactions={[]} tasks={[]} taskTitle="" dueAt="" onTaskTitleChange={()=>{}} onDueAtChange={()=>{}} onCreateTask={()=>{}} onCompleteTask={()=>{}} onMarkWon={()=>{}} onMarkLost={()=>{}} {...{onAction:action}}/></MemoryRouter>))
  for(const [label,kind] of [['Nota','note'],['WhatsApp','whatsapp'],['E-mail','email'],['Chamada','call'],['Tarefa','task'],['Reuniao','meeting']]){
   const button=Array.from(host.querySelectorAll('button')).find(b=>b.title===label)!
   await act(async()=>button.click());expect(action).toHaveBeenLastCalledWith(kind)
  }
 }finally{act(()=>root.unmount());host.remove()}
})
