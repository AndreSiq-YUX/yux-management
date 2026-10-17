import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/lib/apiClient'
import { projectDeliveryService } from './projectDeliveryService'

vi.mock('@/lib/apiClient', () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}))
afterEach(() => vi.clearAllMocks())
describe('projectDeliveryService', () => {
  it('uses membership-scoped routes for listing and project snapshots', async () => {
    await projectDeliveryService.list('org-a')
    await projectDeliveryService.details('org-a', 'project-a')
    await projectDeliveryService.approvals('org-a')
    expect(apiRequest).toHaveBeenCalledWith(
      '/project-delivery/portal/projects?organizationId=org-a'
    )
    expect(apiRequest).toHaveBeenCalledWith(
      '/project-delivery/portal/projects/project-a?organizationId=org-a'
    )
    expect(apiRequest).toHaveBeenCalledWith(
      '/project-delivery/portal/approvals?organizationId=org-a'
    )
  })
  it('submits the project and organization together with the decision', async () => {
    await projectDeliveryService.decide(
      'org-a',
      'project-a',
      'approval-a',
      'changes_requested',
      ' Ajustar cores '
    )
    expect(apiRequest).toHaveBeenCalledWith(
      '/project-delivery/portal/projects/project-a/approvals/approval-a/decision?organizationId=org-a',
      {
        method: 'POST',
        body: { decision: 'changes_requested', comment: 'Ajustar cores' },
      }
    )
  })
})
