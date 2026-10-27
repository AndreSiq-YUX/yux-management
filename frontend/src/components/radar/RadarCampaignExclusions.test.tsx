import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {RadarCampaignExclusions} from './RadarCampaignExclusions'
import {radarService} from '@/services/radarService'
vi.mock('@/services/radarService',()=>({radarService:{excludeCampaignCandidates:vi.fn(),getCampaignExclusions:vi.fn(),restoreCampaignExclusion:vi.fn()}}))
it('confirms scope, recovers the same request after an ambiguous response and restores from the campaign archive',async()=>{
 const host=document.createElement('div'),root=createRoot(host),updated=vi.fn()
 vi.mocked(radarService.excludeCampaignCandidates).mockRejectedValueOnce(Error('response lost')).mockResolvedValueOnce({items:[{candidateId:'a',status:'excluded'}]})
 vi.mocked(radarService.getCampaignExclusions).mockResolvedValue([{id:'exclusion',candidateId:'a',title:'Empresa Alfa',createdAt:'2026-10-27'}])
 vi.mocked(radarService.restoreCampaignExclusion).mockResolvedValue({status:'restored'})
 const click=async(label:string)=>act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent===label)!.click())
 try{
  await act(async()=>root.render(<RadarCampaignExclusions organizationId="org" campaignId="campaign" candidateIds={['a']} canManage onChanged={updated}/>))
  await click('Excluir selecionadas da campanha')
  expect(host.textContent).toContain('Outras campanhas não serão afetadas')
  await click('Confirmar exclusão');expect(host.textContent).toContain('mesmo pedido');expect(updated).not.toHaveBeenCalled()
  await act(async()=>root.render(<RadarCampaignExclusions organizationId="org" campaignId="campaign" candidateIds={['b','c']} canManage onChanged={updated}/>))
  expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('Excluir 1 empresa(s)')
  await click('Confirmar exclusão');expect(updated).toHaveBeenCalledTimes(1)
  expect(radarService.excludeCampaignCandidates).toHaveBeenNthCalledWith(2,'org','campaign',['a'],vi.mocked(radarService.excludeCampaignCandidates).mock.calls[0][3])
  await click('Excluídas desta campanha');expect(host.textContent).toContain('Empresa Alfa')
  vi.mocked(radarService.getCampaignExclusions).mockResolvedValue([])
  await click('Restaurar para revisão');expect(host.textContent).toContain('Nenhuma empresa excluída');expect(updated).toHaveBeenCalledTimes(2)
 }finally{act(()=>root.unmount())}
})
it('allows consultation without exposing mutation actions to a read-only member',async()=>{
 const host=document.createElement('div'),root=createRoot(host)
 try{await act(async()=>root.render(<RadarCampaignExclusions organizationId="org" campaignId="campaign" candidateIds={['a']} canManage={false} onChanged={()=>{}}/>));expect(host.textContent).not.toContain('Excluir selecionadas');expect(host.textContent).toContain('Excluídas desta campanha')}finally{act(()=>root.unmount())}
})
