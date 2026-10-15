import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {RadarResearchFeedback} from './RadarResearchFeedback'
import {radarService} from '@/services/radarService'
vi.mock('@/services/radarService',()=>({radarService:{getResearchFeedback:vi.fn(async()=>[]),saveResearchFeedback:vi.fn(async()=>({id:'feedback'}))}}))
it('records manual verification with revision and shows success without starting research or changing CRM',async()=>{
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarResearchFeedback candidateId="company" organizationId="org" revision={3} contacts={[]} canReview/>))
  await act(async()=>(container.querySelector('button') as HTMLButtonElement).click())
  expect(radarService.saveResearchFeedback).toHaveBeenCalledWith('company',expect.objectContaining({organizationId:'org',configurationRevision:3,kind:'identity_confirmed',requestId:expect.any(String)}))
  expect(container.textContent).toContain('Conferência registrada')
  act(()=>root.unmount())
})
it('reuses the same feedback request after an uncertain response instead of duplicating the audit',async()=>{
  vi.mocked(radarService.saveResearchFeedback).mockClear().mockRejectedValueOnce(Error('response_lost')).mockResolvedValueOnce({id:'feedback'} as never)
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarResearchFeedback candidateId="company" organizationId="org" revision={3} contacts={[]} canReview/>))
  await act(async()=>(container.querySelector('button') as HTMLButtonElement).click())
  await act(async()=>(container.querySelector('button') as HTMLButtonElement).click())
  expect(vi.mocked(radarService.saveResearchFeedback).mock.calls[0][1].requestId).toBe(vi.mocked(radarService.saveResearchFeedback).mock.calls[1][1].requestId)
  act(()=>root.unmount())
})
