import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {RadarCrmDeliveryDialog} from './RadarCrmDeliveryDialog'
import {radarService} from '@/services/radarService'
vi.mock('@/services/radarService',()=>({radarService:{getCrmDestinations:vi.fn(async()=>[{crmInstanceId:'crm',pipelineId:'pipeline',stageId:'stage',pipelineName:'Comercial',stageName:'Contato manual'}]),deliverToCrm:vi.fn(async()=>({items:[{candidateId:'candidate',status:'created',leadId:'lead'}]}))}}))
it('requires explicit review before transferring to the selected CRM and shows the lead link',async()=>{
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container)
  await act(async()=>root.render(<RadarCrmDeliveryDialog organizationId="org" campaignId="campaign" revision={2} candidateIds={['candidate']} initialDestination={{crmInstanceId:'crm',pipelineId:'pipeline',stageId:'stage'}} onClose={vi.fn()} onCompleted={vi.fn()} leadPath={id=>`/crm?leadId=${id}`}/>))
  const button=()=>Array.from(document.querySelectorAll('button')).find(item=>item.textContent==='Confirmar envio ao CRM')!
  expect(button().disabled).toBe(true)
  expect(radarService.deliverToCrm).not.toHaveBeenCalled()
  await act(async()=>(document.querySelector('input[type="checkbox"]') as HTMLInputElement).click())
  await act(async()=>button().click())
  expect(radarService.deliverToCrm).toHaveBeenCalledWith('campaign',expect.objectContaining({configurationRevision:2,candidateIds:['candidate'],destination:{crmInstanceId:'crm',pipelineId:'pipeline',stageId:'stage'}}))
  expect(document.querySelector('a[href="/crm?leadId=lead"]')).not.toBeNull()
  act(()=>root.unmount());container.remove()
})
