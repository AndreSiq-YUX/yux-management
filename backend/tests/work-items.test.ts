import { describe, expect, it, vi } from 'vitest'
import { listWorkItems } from '../src/modules/workspace/work-items.js'

describe('workspace work item projection', () => {
  it('projects each source once and scopes a client member to their own assignments', async () => {
    const organizationId = '10000000-0000-4000-8000-000000000001'
    const userId = '40000000-0000-4000-8000-000000000004'
    const version = new Date('2026-09-05T10:00:00.000Z')
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      expect(params?.[1]).toBe(userId)
      if (sql.includes('FROM public.lead_tasks')) return { rows: [{
        source_id: '50000000-0000-4000-8000-000000000001', title: 'CRM', status: 'pending', due_at: version,
        assignee_id: userId, mission_id: null, organization_id: organizationId, version,
      }] }
      if (sql.includes('FROM public.project_tasks')) return { rows: [{
        source_id: '50000000-0000-4000-8000-000000000002', title: 'Projeto', status: 'in_progress', due_at: null,
        assignee_id: userId, mission_id: null, organization_id: organizationId, version,
      }] }
      return { rows: [{
        source_id: '50000000-0000-4000-8000-000000000003', title: 'Missão', status: 'blocked', due_at: version,
        assignee_id: userId, mission_id: '80000000-0000-4000-8000-000000000001', organization_id: organizationId, version,
      }, {
        source_id: '50000000-0000-4000-8000-000000000003', title: 'Missão', status: 'blocked', due_at: version,
        assignee_id: userId, mission_id: '80000000-0000-4000-8000-000000000001', organization_id: organizationId, version,
      }] }
    })
    const items = await listWorkItems({ query } as never, {
      userId, role: 'client_member', organizationIds: [organizationId], enabledModuleKeys: ['crm'],
    }, { organizationId, due: 'all' })

    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ sourceType: 'mission_human_task', status: 'blocked' })
    expect(items.map(item => item.sourceType)).toEqual(expect.arrayContaining(['crm_task', 'project_task', 'mission_human_task']))
  })

  it('rejects a client member asking for another assignee', async () => {
    await expect(listWorkItems({ query: vi.fn() } as never, {
      userId: '40000000-0000-4000-8000-000000000004', role: 'client_member',
      organizationIds: ['10000000-0000-4000-8000-000000000001'], enabledModuleKeys: ['crm'],
    }, {
      organizationId: '10000000-0000-4000-8000-000000000001',
      assigneeId: '40000000-0000-4000-8000-000000000003', due: 'all',
    })).rejects.toMatchObject({ message: 'work_item_assignee_forbidden', statusCode: 403 })
  })
})
