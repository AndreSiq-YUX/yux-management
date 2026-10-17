import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerProjectDeliveryRoutes } from '../src/modules/project-delivery/routes.js'
import {
  registerWorkspaceRoutes,
  projectDeliverableRow,
  projectRow,
} from '../src/modules/workspace/routes.js'
import {
  deliverablePatch,
  deliverablePatchSchema,
} from '../src/modules/project-delivery/validation.js'
import type { RequestContext } from '../src/http/request-context.js'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000001'
const targetId = '30000000-0000-4000-8000-000000000001'
const approvalId = '40000000-0000-4000-8000-000000000001'
const userId = '50000000-0000-4000-8000-000000000001'
const portalUrl = `/api/project-delivery/portal/projects/${projectId}?organizationId=${organizationId}`
const decisionUrl = `/api/project-delivery/portal/projects/${projectId}/approvals/${approvalId}/decision?organizationId=${organizationId}`
const apps: FastifyInstance[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function setup(
  options: {
    role?: RequestContext['role']
    organizations?: string[]
    unauthenticated?: boolean
    found?: boolean
    status?: string
    pending?: boolean
    failInsert?: boolean
  } = {}
) {
  const release = vi.fn()
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.startsWith('SELECT p.id FROM'))
      return { rows: options.found === false ? [] : [{ id: projectId }] }
    if (sql.includes('FOR UPDATE OF ar, d'))
      return {
        rows:
          options.found === false
            ? []
            : [
                {
                  id: approvalId,
                  target_id: targetId,
                  status: options.status || 'pending',
                },
              ],
      }
    if (sql.includes('project_deliverables') && sql.includes('FOR UPDATE'))
      return {
        rows:
          options.found === false
            ? []
            : [
                {
                  id: targetId,
                  title: 'Entrega',
                  status: 'draft',
                  is_client_visible: true,
                },
              ],
      }
    if (sql.startsWith('SELECT id FROM public.approval_requests'))
      return { rows: options.pending ? [{ id: approvalId }] : [] }
    if (sql.startsWith('INSERT INTO public.approval_requests')) {
      if (options.failInsert) throw new Error('database unavailable')
      return {
        rows: [
          {
            id: approvalId,
            project_id: projectId,
            target_id: targetId,
            target_type: 'deliverable',
            status: 'pending',
          },
        ],
      }
    }
    if (sql.startsWith('INSERT INTO public.project_deliverables'))
      return {
        rows: [
          {
            id: targetId,
            project_id: projectId,
            title: 'Entrega',
            status: 'draft',
            is_client_visible: true,
          },
        ],
      }
    if (
      sql.includes('UPDATE public.project_deliverables') &&
      sql.includes('RETURNING')
    )
      return {
        rows:
          options.found === false
            ? []
            : [
                {
                  id: targetId,
                  project_id: projectId,
                  title: 'Entrega',
                  is_client_visible: true,
                  status: 'delivered',
                },
              ],
      }
    return { rows: [] }
  })
  const pool = { query, connect: vi.fn(async () => ({ query, release })) }
  const app = Fastify()
  apps.push(app)
  app.decorate('pg', pool as never)
  app.decorateRequest('ctx', null)
  app.addHook('preHandler', async (request) => {
    request.ctx = options.unauthenticated
      ? null
      : {
          userId,
          role: options.role || 'client_member',
          organizationIds: options.organizations || [organizationId],
          enabledModuleKeys: ['projects'],
        }
  })
  await app.register(registerProjectDeliveryRoutes, {
    prefix: '/api/project-delivery',
  })
  await app.register(registerWorkspaceRoutes, { prefix: '/api/workspace' })
  await app.ready()
  return { app, query, pool, release }
}

describe('project delivery routes', () => {
  it('serializes database calendar dates without converting deadlines into timestamps', () => {
    const date = new Date(2026, 9, 15)
    expect(projectDeliverableRow({ due_date: date }).dueDate).toBe('2026-10-15')
    expect(projectRow({ expected_end_date: date }).expectedEndDate).toBe(
      '2026-10-15'
    )
    expect(projectDeliverableRow({ due_date: '2026-10-15' }).dueDate).toBe(
      '2026-10-15'
    )
  })
  it('preserves omitted fields in partial updates and permits explicit clearing', () => {
    const patch = deliverablePatch(
      deliverablePatchSchema.parse({
        status: 'in_review',
        isClientVisible: true,
      })
    )
    expect(patch).not.toHaveProperty('description')
    expect(patch).not.toHaveProperty('external_url')
    expect(patch).not.toHaveProperty('due_date')
    expect(patch).not.toHaveProperty('phase_id')
    expect(deliverablePatch({ externalUrl: '', phaseId: null })).toMatchObject({
      external_url: null,
      phase_id: null,
    })
  })
  it('rejects invalid dates, blank titles and unsafe artifact links', () => {
    expect(
      deliverablePatchSchema.safeParse({ dueDate: '2026-02-31' }).success
    ).toBe(false)
    expect(deliverablePatchSchema.safeParse({ title: '  ' }).success).toBe(
      false
    )
    expect(
      deliverablePatchSchema.safeParse({ externalUrl: 'javascript:alert(1)' })
        .success
    ).toBe(false)
  })
  it('keeps internal workspace endpoints restricted to the team', async () => {
    const { app, query } = await setup()
    const response = await app.inject(
      `/api/workspace/projects/${projectId}/deliverables`
    )
    expect(response.statusCode).toBe(403)
    expect(query).not.toHaveBeenCalled()
  })
  it.each([
    { unauthenticated: true, code: 401 },
    { organizations: [], code: 403 },
  ])(
    'requires authenticated organization membership: $code',
    async (options) => {
      const { app, query } = await setup(options)
      expect((await app.inject(portalUrl)).statusCode).toBe(options.code)
      expect(query).not.toHaveBeenCalled()
    }
  )
  it('does not load child records for a project outside the organization', async () => {
    const { app, query } = await setup({ found: false })
    expect((await app.inject(portalUrl)).statusCode).toBe(404)
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][1]).toEqual([projectId, organizationId])
  })
  it('scopes the list by client ownership without selecting internal project fields', async () => {
    const { app, query } = await setup()
    expect(
      (
        await app.inject(
          `/api/project-delivery/portal/projects?organizationId=${organizationId}`
        )
      ).statusCode
    ).toBe(200)
    const sql = query.mock.calls[0][0]
    expect(sql).toContain('o.client_id = p.client_id')
    expect(sql).not.toContain('p.*')
    expect(sql).not.toContain('p.notes')
    expect(query.mock.calls[0][1]).toEqual([organizationId])
  })
  it('filters tasks, artifacts, approvals and timeline by public visibility', async () => {
    const { app, query } = await setup()
    const response = await app.inject(portalUrl)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      tasks: [],
      phases: [],
      deliverables: [],
      approvals: [],
      timeline: [],
    })
    for (const table of [
      'project_tasks',
      'project_deliverables',
      'project_timeline_entries',
    ]) {
      expect(
        query.mock.calls.some(
          ([sql]) =>
            sql.includes(`FROM public.${table} WHERE`) &&
            sql.includes('is_client_visible = true')
        )
      ).toBe(true)
    }
    const approvalQuery = query.mock.calls.find(([sql]) =>
      sql.includes('FROM public.approval_requests ar')
    )![0]
    expect(approvalQuery).toContain('d.project_id = ar.project_id')
    expect(approvalQuery).toContain(
      'ar.is_client_visible = true AND d.is_client_visible = true'
    )
  })
  it('scopes the consolidated approval queue and excludes hidden or unrelated targets', async () => {
    const { app, query } = await setup()
    expect(
      (
        await app.inject(
          `/api/project-delivery/portal/approvals?organizationId=${organizationId}`
        )
      ).statusCode
    ).toBe(200)
    expect(query.mock.calls[0][1]).toEqual([organizationId])
    expect(query.mock.calls[0][0]).toContain('o.client_id = p.client_id')
    expect(query.mock.calls[0][0]).toContain(
      'ar.is_client_visible = true AND d.is_client_visible = true'
    )
    const denied = await setup({ organizations: [] })
    expect(
      (
        await denied.app.inject(
          `/api/project-delivery/portal/approvals?organizationId=${organizationId}`
        )
      ).statusCode
    ).toBe(403)
    expect(denied.query).not.toHaveBeenCalled()
  })
  it.each([
    { decision: 'changes_requested', comment: ' ' },
    { decision: 'rejected' },
    { decision: 'cancelled' },
  ])(
    'validates decision $decision before opening a transaction',
    async (payload) => {
      const { app, pool } = await setup()
      expect(
        (await app.inject({ method: 'POST', url: decisionUrl, payload }))
          .statusCode
      ).toBe(400)
      expect(pool.connect).not.toHaveBeenCalled()
    }
  )
  it('saves the actor, trims comments and updates the deliverable in the same transaction', async () => {
    const { app, query, release } = await setup()
    expect(
      (
        await app.inject({
          method: 'POST',
          url: decisionUrl,
          payload: {
            decision: 'changes_requested',
            comment: ' Ajustar título ',
          },
        })
      ).statusCode
    ).toBe(200)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.approval_decisions'),
      [approvalId, 'changes_requested', 'Ajustar título', userId]
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.project_deliverables'),
      ['changes_requested', targetId, projectId]
    )
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(release).toHaveBeenCalledOnce()
  })
  it.each([
    { found: false, code: 404 },
    { status: 'approved', code: 409 },
  ])(
    'prevents missing, hidden or already-decided approvals: $code',
    async (options) => {
      const { app, query, release } = await setup(options)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: decisionUrl,
            payload: { decision: 'approved' },
          })
        ).statusCode
      ).toBe(options.code)
      expect(
        query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))
      ).toBe(false)
      expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
      expect(release).toHaveBeenCalledOnce()
    }
  )
  it('publishes the target atomically when requesting approval and prevents duplicates', async () => {
    const { app, query } = await setup({ role: 'yux_admin' })
    const url = `/api/workspace/projects/${projectId}/approvals`
    const payload = { targetType: 'deliverable', targetId, title: 'Entrega' }
    expect(
      (await app.inject({ method: 'POST', url, payload })).statusCode
    ).toBe(200)
    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.includes('is_client_visible = true') &&
          sql.includes("status = 'in_review'")
      )
    ).toBe(true)
    const insert = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO public.approval_requests')
    )!
    expect(insert[1]).toContain(userId)
    const publishIndex = query.mock.calls.findIndex(([sql]) =>
      sql.startsWith('UPDATE public.project_deliverables')
    )
    const insertIndex = query.mock.calls.findIndex(([sql]) =>
      sql.startsWith('INSERT INTO public.approval_requests')
    )
    expect(publishIndex).toBeLessThan(insertIndex)
    expect(
      query.mock.calls.some(
        ([sql, values]) =>
          sql.includes('INSERT INTO public.project_timeline_entries') &&
          values?.includes('approval_requested')
      )
    ).toBe(true)
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    const duplicate = await setup({ role: 'yux_admin', pending: true })
    expect(
      (await duplicate.app.inject({ method: 'POST', url, payload })).statusCode
    ).toBe(409)
    expect(
      duplicate.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))
    ).toBe(false)
  })
  it('rolls back failed approval creation without publishing the artifact', async () => {
    const { app, query, release } = await setup({
      role: 'yux_admin',
      failInsert: true,
    })
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/workspace/projects/${projectId}/approvals`,
          payload: { targetType: 'deliverable', targetId, title: 'Entrega' },
        })
      ).statusCode
    ).toBe(500)
    expect(
      query.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE public.project_deliverables')
      )
    ).toBe(true)
    expect(query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false)
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
    expect(release).toHaveBeenCalledOnce()
  })
  it('does not erase delivery details when only status is patched through HTTP', async () => {
    const { app, query } = await setup({ role: 'yux_admin' })
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/workspace/projects/${projectId}/deliverables/${targetId}`,
          payload: { status: 'delivered' },
        })
      ).statusCode
    ).toBe(200)
    const sql = query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE public.project_deliverables')
    )![0]
    expect(sql).not.toContain('description =')
    expect(sql).not.toContain('external_url =')
    expect(sql).not.toContain('due_date =')
    expect(sql).toContain('delivered_at =')
    expect(
      query.mock.calls.some(
        ([sql, values]) =>
          sql.includes('INSERT INTO public.project_timeline_entries') &&
          values?.includes('status_changed')
      )
    ).toBe(true)
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
  })
  it('prevents changing an artifact while its client approval is pending', async () => {
    const { app, query } = await setup({ role: 'yux_admin', pending: true })
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/workspace/projects/${projectId}/deliverables/${targetId}`,
      payload: { title: 'Outra versão' },
    })
    expect(response.statusCode).toBe(409)
    expect(
      query.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE public.project_deliverables')
      )
    ).toBe(false)
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
  })
  it('records artifact creation and its public timeline event in one transaction', async () => {
    const { app, query } = await setup({ role: 'yux_admin' })
    const response = await app.inject({
      method: 'POST',
      url: `/api/workspace/projects/${projectId}/deliverables`,
      payload: { title: 'Entrega', isClientVisible: true },
    })
    expect(response.statusCode).toBe(200)
    expect(
      query.mock.calls.some(
        ([sql, values]) =>
          sql.includes('INSERT INTO public.project_timeline_entries') &&
          values?.includes('deliverable_created')
      )
    ).toBe(true)
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
  })
})
