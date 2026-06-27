import { describe, expect, it } from 'vitest'
import { buildUnifiedActivities, summarizeActivityGroups } from './activityRules'
import type { CrmInteraction, CrmTask } from '@/types/crm'

const currentDate = '2026-06-08T12:00:00.000Z'

describe('activityRules', () => {
  it('orders overdue, future and recent activities in a unified timeline', () => {
    const tasks: CrmTask[] = [
      makeTask({ id: 'future-2', title: 'Futuro distante', dueAt: '2026-06-12T09:00:00.000Z' }),
      makeTask({ id: 'overdue-2', title: 'Atrasada depois', dueAt: '2026-06-07T09:00:00.000Z' }),
      makeTask({ id: 'overdue-1', title: 'Atrasada antes', dueAt: '2026-06-06T09:00:00.000Z' }),
      makeTask({ id: 'future-1', title: 'Futuro proximo', dueAt: '2026-06-09T09:00:00.000Z' }),
    ]
    const interactions: CrmInteraction[] = [
      {
        id: 'call-1',
        organizationId: 'org-1',
        leadId: 'lead-1',
        type: 'call',
        title: 'Ligacao registrada',
        description: 'Cliente pediu retorno.',
        date: '2026-06-08T10:00:00.000Z',
      },
    ]

    const activities = buildUnifiedActivities({ tasks, interactions, currentDate })

    expect(activities.map(activity => activity.title)).toEqual([
      'Atrasada antes',
      'Atrasada depois',
      'Futuro proximo',
      'Futuro distante',
      'Ligacao registrada',
    ])
    expect(summarizeActivityGroups(activities)).toEqual({ overdue: 2, future: 2, recent: 1 })
  })

  it('maps conversations, ai insights and standalone next actions', () => {
    const activities = buildUnifiedActivities({
      currentDate,
      conversations: [
        {
          id: 'conversation-1',
          status: 'open',
          channel: 'whatsapp',
          summary: 'Cliente quer agenda.',
          lastMessageAt: '2026-06-08T11:00:00.000Z',
        },
      ],
      aiInsights: [
        {
          id: 'insight-1',
          summary: 'Lead com alta intencao.',
          nextBestAction: 'Enviar proposta',
          createdAt: '2026-06-08T11:30:00.000Z',
        },
      ],
      nextActions: [
        {
          id: 'next-1',
          title: 'Retornar contato',
          dueAt: '2026-06-09T10:00:00.000Z',
        },
        {
          id: 'next-with-task',
          taskId: 'task-1',
          title: 'Ignorar duplicada',
          dueAt: '2026-06-09T10:00:00.000Z',
        },
      ],
    })

    expect(activities).toHaveLength(3)
    expect(activities.find(activity => activity.id === 'conversation:conversation-1')).toMatchObject({
      kind: 'whatsapp',
      status: 'open',
      sourceLabel: 'WhatsApp',
      group: 'recent',
    })
    expect(activities.find(activity => activity.id === 'ai:insight-1')).toMatchObject({
      kind: 'ai_insight',
      title: 'Enviar proposta',
    })
    expect(activities.find(activity => activity.id === 'next-action:next-1')).toMatchObject({
      kind: 'task',
      group: 'future',
    })
  })

  it('keeps completed and cancelled tasks in recent activities', () => {
    const activities = buildUnifiedActivities({
      currentDate,
      tasks: [
        makeTask({ id: 'completed', title: 'Feita', status: 'completed', dueAt: '2026-06-01T10:00:00.000Z' }),
        makeTask({ id: 'cancelled', title: 'Cancelada', status: 'cancelled', dueAt: '2026-06-02T10:00:00.000Z' }),
      ],
    })

    expect(activities).toHaveLength(2)
    expect(activities.every(activity => activity.group === 'recent')).toBe(true)
  })
})

function makeTask(overrides: Partial<CrmTask>): CrmTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    leadId: 'lead-1',
    title: 'Tarefa',
    dueAt: '2026-06-09T09:00:00.000Z',
    status: 'pending',
    ...overrides,
  }
}
