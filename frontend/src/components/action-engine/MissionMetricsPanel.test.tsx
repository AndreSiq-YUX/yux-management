import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it} from 'vitest'
import {MissionMetricsPanel} from './MissionMetricsPanel'

it('shows research counts instead of a revenue fallback for the Radar metric contract',async()=>{
 const container=document.body.appendChild(document.createElement('div')),root=createRoot(container)
 try{
  await act(async()=>root.render(<MissionMetricsPanel metrics={{companies_found:{kind:'known',value:'25',unit:'count'},research_completed:{kind:'known',value:'20',unit:'count'}}} metricSpec={{primary:[{key:'companies_found',unit:'count'},{key:'research_completed',unit:'count'}],operational:['operations_pending']}}/>))
  expect(container.textContent).toContain('Empresas encontradas')
  expect(container.textContent).toContain('Pesquisas concluídas')
  expect(container.textContent).toContain('25')
  expect(container.textContent).not.toContain('Receita')
 }finally{await act(async()=>root.unmount());container.remove()}
})
