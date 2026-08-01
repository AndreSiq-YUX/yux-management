import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import { buildServer } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
}

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  pipeline: '00000000-0000-4000-8000-000000000003',
  stage: '00000000-0000-4000-8000-000000000004',
  lead: '00000000-0000-4000-8000-000000000005',
  interaction: '00000000-0000-4000-8000-000000000006',
  task: '00000000-0000-4000-8000-000000000007',
  sequence: '00000000-0000-4000-8000-000000000008',
  sequenceStep: '00000000-0000-4000-8000-000000000009',
  enrollment: '00000000-0000-4000-8000-000000000010',
  execution: '00000000-0000-4000-8000-000000000011',
  crmInstance: '00000000-0000-4000-8000-000000000012',
  crmMember: '00000000-0000-4000-8000-000000000013',
  crmTeam: '00000000-0000-4000-8000-000000000014',
  crmTeamMember: '00000000-0000-4000-8000-000000000015',
  otherUser: '00000000-0000-4000-8000-000000000016',
  otherOrg: '00000000-0000-4000-8000-000000000017',
}

const leadRow = {
  id: ids.lead,
  organization_id: ids.org,
  crm_instance_id: null,
  pipeline_id: ids.pipeline,
  stage_id: ids.stage,
  team_id: null,
  owner_member_id: null,
  pipeline_version_id: null,
  stage_version_id: null,
  assignment_state: null,
  assignment_mode: null,
  last_assignment_at: null,
  name: 'Maria',
  email: 'maria@yux.com.br',
  phone: null,
  company: 'YUX',
  source: 'manual',
  source_kind: 'manual',
  status: 'open',
  score: 50,
  value: '1200.00',
  notes: null,
  owner_id: null,
  assigned_to: null,
  lost_reason: null,
  won_at: null,
  lost_at: null,
  last_activity_at: '2026-01-01T00:00:00.000Z',
  next_follow_up_at: null,
  attribution_context: {},
  ai_summary: null,
  intent: null,
  sentiment: null,
  urgency_detected_at: null,
  last_conversation_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

class FakeAuthStore implements AuthStore {
  user: AuthUser | null = null
  sessionHash: string | null = null

  async findActiveUserByEmail() {
    return null
  }

  async createSession() {
    return undefined
  }

  async deleteSession() {
    return undefined
  }

  async findUserBySession(sessionTokenHash: string) {
    if (this.user && this.sessionHash === sessionTokenHash) return this.user
    return null
  }
}

class FakePool {
  async query(sql: string) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    if (sql.includes('FROM public.crm_pipeline_stages') && sql.includes('JOIN public.crm_pipelines')) {
      return {
        rows: [{
          id: ids.stage,
          pipeline_id: ids.pipeline,
          key: 'won',
          name: 'Ganho',
          color: '#16a34a',
          order_index: 2,
          is_won: true,
          is_lost: false,
          is_active: true,
          organization_id: ids.org,
        }],
      }
    }

    if (sql.includes('FROM public.crm_pipeline_stages')) {
      return {
        rows: [{
          id: ids.stage,
          pipeline_id: ids.pipeline,
          key: 'qualified',
          name: 'Qualificado',
          color: '#2563eb',
          order_index: 1,
          is_won: false,
          is_lost: false,
          is_active: true,
        }],
      }
    }

    if (sql.includes('FROM public.crm_pipelines')) {
      return {
        rows: [{
          id: ids.pipeline,
          organization_id: ids.org,
          crm_instance_id: null,
          name: 'Comercial',
          description: null,
          is_default: true,
          is_active: true,
        }],
      }
    }

    if (sql.includes('FROM public.crm_sequence_steps')) {
      return {
        rows: [{
          id: ids.sequenceStep,
          sequence_id: ids.sequence,
          action_type: 'whatsapp',
          delay_minutes: 15,
          subject: null,
          body: 'Ola',
          order_index: 1,
          is_active: true,
        }],
      }
    }

    if (sql.includes('FROM public.crm_sequences')) {
      return {
        rows: [{
          id: ids.sequence,
          organization_id: ids.org,
          name: 'Sequencia comercial',
          description: null,
          is_active: true,
        }],
      }
    }

    if (sql.includes('INSERT INTO public.crm_sequence_enrollments')) {
      return {
        rows: [{
          id: ids.enrollment,
          organization_id: ids.org,
          sequence_id: ids.sequence,
          lead_id: ids.lead,
          status: 'active',
          current_step_index: 0,
          next_execution_at: '2026-01-05T00:00:00.000Z',
          manual_note: null,
        }],
      }
    }

    if (sql.includes('FROM public.crm_sequence_enrollments')) {
      return {
        rows: [{
          id: ids.enrollment,
          organization_id: ids.org,
          sequence_id: ids.sequence,
          lead_id: ids.lead,
          status: 'active',
          current_step_index: 0,
          next_execution_at: '2026-01-05T00:00:00.000Z',
          manual_note: null,
        }],
      }
    }

    if (sql.includes('FROM public.automation_executions')) {
      return {
        rows: [{
          id: ids.execution,
          organization_id: ids.org,
          lead_id: ids.lead,
          enrollment_id: ids.enrollment,
          step_id: ids.sequenceStep,
          action_type: 'whatsapp',
          payload: { body: 'Ola' },
          status: 'pending',
          attempt_count: 0,
          last_error: null,
          scheduled_at: '2026-01-05T00:00:00.000Z',
          requested_at: '2026-01-04T00:00:00.000Z',
          completed_at: null,
        }],
      }
    }

    if (sql.includes('INSERT INTO public.leads')) {
      return { rows: [leadRow] }
    }

    if (sql.includes('UPDATE public.leads') && sql.includes('RETURNING *')) {
      return { rows: [{ ...leadRow, score: 80, status: 'won', stage: 'WON', won_at: '2026-01-04T00:00:00.000Z' }] }
    }

    if (sql.includes('UPDATE public.leads')) {
      return { rows: [] }
    }

    if (sql.includes('FROM public.leads l')) {
      return { rows: [leadRow] }
    }

    if (sql.includes('INSERT INTO public.interactions')) {
      return {
        rows: [{
          id: ids.interaction,
          organization_id: ids.org,
          lead_id: ids.lead,
          type: 'note',
          title: 'Resumo',
          description: 'Contato registrado',
          date: '2026-01-03T00:00:00.000Z',
        }],
      }
    }

    if (sql.includes('FROM public.interactions')) {
      return {
        rows: [{
          id: ids.interaction,
          organization_id: ids.org,
          lead_id: ids.lead,
          type: 'note',
          title: 'Resumo',
          description: 'Contato registrado',
          date: '2026-01-03T00:00:00.000Z',
        }],
      }
    }

    if (sql.includes('INSERT INTO public.lead_tasks')) {
      return {
        rows: [{
          id: ids.task,
          organization_id: ids.org,
          lead_id: ids.lead,
          enrollment_id: null,
          title: 'Ligar',
          description: null,
          status: 'pending',
          priority: 'medium',
          due_at: '2026-01-04T00:00:00.000Z',
          completed_at: null,
          assigned_to: null,
        }],
      }
    }

    if (sql.includes('UPDATE public.lead_tasks')) {
      return {
        rows: [{
          id: ids.task,
          organization_id: ids.org,
          lead_id: ids.lead,
          enrollment_id: null,
          title: 'Ligar',
          description: null,
          status: 'completed',
          priority: 'medium',
          due_at: '2026-01-04T00:00:00.000Z',
          completed_at: '2026-01-04T12:00:00.000Z',
          assigned_to: null,
        }],
      }
    }

    if (sql.includes('FROM public.lead_tasks')) {
      return {
        rows: [{
          id: ids.task,
          organization_id: ids.org,
          lead_id: ids.lead,
          enrollment_id: null,
          title: 'Ligar',
          description: null,
          status: 'pending',
          priority: 'medium',
          due_at: '2026-01-04T00:00:00.000Z',
          completed_at: null,
          assigned_to: null,
        }],
      }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
  }
}

class FakeGovernancePool {
  async query(sql: string, params: unknown[] = []) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) {
      return { rows: [{ organization_id: params[0] === ids.user ? ids.org : ids.otherOrg }] }
    }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }

    if (sql.includes('FROM public.crm_instances ci')) {
      const [crmInstanceId, userId, internal] = params
      if (crmInstanceId !== ids.crmInstance || (!internal && userId !== ids.user)) return { rows: [] }
      return {
        rows: [{
          id: ids.crmInstance,
          organization_id: ids.org,
          contract_id: '00000000-0000-4000-8000-000000000018',
          status: 'active',
          sector_key: 'technology',
          blueprint_id: null,
          blueprint_application_run_id: null,
          seller_seat_limit: 5,
          manager_seat_limit: 1,
          admin_seat_limit: 1,
          max_pipeline_count: 3,
          max_custom_field_count: 20,
          max_automation_count: 5,
          allow_client_pipeline_customization: true,
          allow_client_field_customization: true,
          allow_client_category_customization: true,
          default_assignment_mode: 'queue',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        }],
      }
    }

    if (sql.includes('FROM public.crm_instance_members')) {
      return {
        rows: [{
          id: ids.crmMember,
          crm_instance_id: ids.crmInstance,
          user_id: ids.user,
          role: 'client_admin',
          status: 'active',
          display_name: 'Cliente YUXQuant',
          email: 'support@yuxquant.com',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        }],
      }
    }

    if (sql.includes('FROM public.crm_teams') && !sql.includes('crm_team_members')) {
      return {
        rows: [{
          id: ids.crmTeam,
          crm_instance_id: ids.crmInstance,
          name: 'Comercial',
          description: null,
          assignment_mode: 'queue',
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        }],
      }
    }

    if (sql.includes('FROM public.crm_team_members')) {
      return {
        rows: [{
          id: ids.crmTeamMember,
          team_id: ids.crmTeam,
          member_id: ids.crmMember,
          role: 'manager',
          created_at: '2026-01-01T00:00:00.000Z',
        }],
      }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
  }
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

function buildAuthenticatedAuthStore(role: AuthUser['role'] = 'yux_admin', userId = ids.user) {
  const token = `session-${role}-${userId}`
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: userId,
    email: role.startsWith('client_') ? 'support@yuxquant.com' : 'admin@yux.com.br',
    name: role.startsWith('client_') ? 'Cliente YUXQuant' : 'Admin YUX',
    role,
  }

  return { authStore, token }
}

function sessionCookie(rawToken: string) {
  return `${testEnv.SESSION_COOKIE_NAME}=${rawToken}`
}

describe('crm routes', () => {
  it('rejects unauthenticated lead requests', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never })

    const response = await app.inject({ method: 'GET', url: '/api/crm/leads' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'not_authenticated' })
  })

  it('returns CRM leads through the backend API', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const response = await app.inject({
      method: 'GET',
      url: `/api/crm/leads?organizationId=${ids.org}&pipelineId=${ids.pipeline}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: ids.lead,
        organizationId: ids.org,
        pipelineId: ids.pipeline,
        stageId: ids.stage,
        name: 'Maria',
        value: 1200,
      }),
    ])
  })

  it('returns the CRM governance context to a member of the instance organization', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakeGovernancePool() as never })

    const response = await app.inject({
      method: 'GET',
      url: `/api/crm/governance-context?crmInstanceId=${ids.crmInstance}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      instance: expect.objectContaining({ id: ids.crmInstance, organizationId: ids.org, status: 'active' }),
      currentMember: expect.objectContaining({ id: ids.crmMember, userId: ids.user, role: 'client_admin' }),
      members: [expect.objectContaining({ id: ids.crmMember, crmInstanceId: ids.crmInstance })],
      teams: [expect.objectContaining({ id: ids.crmTeam, crmInstanceId: ids.crmInstance, name: 'Comercial' })],
      teamMemberships: [expect.objectContaining({ id: ids.crmTeamMember, teamId: ids.crmTeam })],
    })
  })

  it('does not expose CRM governance data to a user from another organization', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore('client_admin', ids.otherUser)
    app = await buildServer(testEnv, { authStore, pool: new FakeGovernancePool() as never })

    const response = await app.inject({
      method: 'GET',
      url: `/api/crm/governance-context?crmInstanceId=${ids.crmInstance}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'crm_instance_not_found' })
  })

  it('creates lead interactions and tasks', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const interaction = await app.inject({
      method: 'POST',
      url: `/api/crm/leads/${ids.lead}/interactions`,
      headers: { cookie: sessionCookie(token) },
      payload: {
        organizationId: ids.org,
        type: 'note',
        title: 'Resumo',
        description: 'Contato registrado',
      },
    })
    const task = await app.inject({
      method: 'POST',
      url: `/api/crm/leads/${ids.lead}/tasks`,
      headers: { cookie: sessionCookie(token) },
      payload: {
        organizationId: ids.org,
        title: 'Ligar',
        dueAt: '2026-01-04T00:00:00.000Z',
      },
    })

    expect(interaction.statusCode).toBe(201)
    expect(interaction.json()).toMatchObject({ leadId: ids.lead, title: 'Resumo' })
    expect(task.statusCode).toBe(201)
    expect(task.json()).toMatchObject({ leadId: ids.lead, title: 'Ligar', status: 'pending' })
  })

  it('returns pipelines, moves leads between stages and completes tasks through backend routes', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const pipelines = await app.inject({
      method: 'GET',
      url: `/api/crm/pipelines?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })
    const movedLead = await app.inject({
      method: 'PATCH',
      url: `/api/crm/leads/${ids.lead}/stage`,
      headers: { cookie: sessionCookie(token) },
      payload: { stageId: ids.stage },
    })
    const completedTask = await app.inject({
      method: 'PATCH',
      url: `/api/crm/tasks/${ids.task}/complete`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(pipelines.statusCode).toBe(200)
    expect(pipelines.json()).toEqual([
      expect.objectContaining({
        id: ids.pipeline,
        organizationId: ids.org,
        stages: [expect.objectContaining({ id: ids.stage, name: 'Qualificado' })],
      }),
    ])
    expect(movedLead.statusCode).toBe(200)
    expect(movedLead.json()).toMatchObject({ id: ids.lead, status: 'won', wonAt: expect.any(String) })
    expect(completedTask.statusCode).toBe(200)
    expect(completedTask.json()).toMatchObject({ id: ids.task, status: 'completed', completedAt: expect.any(String) })
  })

  it('returns CRM sequences, enrollments and executions through backend routes', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const sequences = await app.inject({
      method: 'GET',
      url: `/api/crm/sequences?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })
    const enrollment = await app.inject({
      method: 'POST',
      url: `/api/crm/leads/${ids.lead}/enrollments`,
      headers: { cookie: sessionCookie(token) },
      payload: { organizationId: ids.org, sequenceId: ids.sequence },
    })
    const executions = await app.inject({
      method: 'GET',
      url: `/api/crm/leads/${ids.lead}/executions`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(sequences.statusCode).toBe(200)
    expect(sequences.json()).toEqual([
      expect.objectContaining({
        id: ids.sequence,
        organizationId: ids.org,
        steps: [expect.objectContaining({ id: ids.sequenceStep, actionType: 'whatsapp' })],
      }),
    ])
    expect(enrollment.statusCode).toBe(201)
    expect(enrollment.json()).toMatchObject({ id: ids.enrollment, leadId: ids.lead, sequenceId: ids.sequence })
    expect(executions.statusCode).toBe(200)
    expect(executions.json()).toEqual([
      expect.objectContaining({ id: ids.execution, leadId: ids.lead, actionType: 'whatsapp' }),
    ])
  })
})
