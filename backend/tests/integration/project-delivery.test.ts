import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations } from '../../scripts/apply-migrations.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { loadEnv } from '../../src/config/env.js'
import { buildServer } from '../../src/server.js'
import {
  fixtureIds,
  fixturePassword,
  fixtureUsers,
  integrationRolePassword,
  provisionIntegrationServiceRoles,
  seedIntegrationFixtures,
} from './support/fixtures.js'

const databaseUrl =
  process.env.YUX_INTEGRATION_DATABASE_URL ||
  'postgresql://yux_test:yux_test_password@127.0.0.1:55432/yux_test_integration'
const parsedUrl = new URL(databaseUrl)
if (
  !['127.0.0.1', 'localhost', 'postgres'].includes(parsedUrl.hostname) ||
  !parsedUrl.pathname.startsWith('/yux_test_')
)
  throw new Error('unsafe_delivery_integration_database')
const adminPool = new pg.Pool({ connectionString: databaseUrl })
let apiPool: pg.Pool
let app: FastifyInstance
const projectA = '71000000-0000-4000-8000-000000000001'
const projectB = '71000000-0000-4000-8000-000000000002'
const cookies = new Map<string, string>()

async function request(
  role: keyof typeof fixtureUsers,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>
) {
  if (!cookies.has(role)) {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: fixtureUsers[role].email, password: fixturePassword },
    })
    expect(login.statusCode).toBe(200)
    const setCookie = login.headers['set-cookie']
    cookies.set(
      role,
      (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0]
    )
  }
  const response = await app.inject({
    method,
    url,
    headers: { cookie: cookies.get(role)! },
    ...(payload === undefined ? {} : { payload }),
  })
  return { status: response.statusCode, body: response.json() }
}
const detailsUrl = `/api/project-delivery/portal/projects/${projectA}?organizationId=${fixtureIds.organizationA}`

beforeAll(async () => {
  const directory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../src/db/migrations'
  )
  await applyMigrations(adminPool, directory, { log() {} })
  await provisionIntegrationServiceRoles(adminPool)
  await seedIntegrationFixtures(adminPool)
  await adminPool.query(
    'DELETE FROM public.projects WHERE id = ANY($1::uuid[])',
    [[projectA, projectB]]
  )
  await adminPool.query(
    `INSERT INTO public.projects (id, client_id, name, status, start_date, expected_end_date)
    VALUES ($1,$2,'Delivery A','ACTIVE','2026-10-16','2026-11-20'), ($3,$4,'Delivery B','ACTIVE','2026-10-16','2026-11-20')
    ON CONFLICT (id) DO NOTHING`,
    [projectA, fixtureIds.clientA, projectB, fixtureIds.clientB]
  )
  const serviceUrl = new URL(databaseUrl)
  serviceUrl.username = 'yux_api'
  serviceUrl.password = integrationRolePassword
  apiPool = createContextAwarePool(
    new pg.Pool({ connectionString: serviceUrl.toString() }),
    'api'
  )
  app = await buildServer(
    loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: 'redis://127.0.0.1:56379',
      SESSION_SECRET: 'delivery-integration-secret-with-at-least-32-characters',
      CORS_ORIGIN: 'http://integration.test',
    }),
    {
      pool: apiPool,
      closePoolOnClose: false,
      redisPing: async () => 'PONG',
    }
  )
}, 120000)
afterAll(async () => {
  await app?.close()
  await apiPool?.end()
  await adminPool.query(
    'DELETE FROM public.projects WHERE id = ANY($1::uuid[])',
    [[projectA, projectB]]
  )
  await adminPool.end()
})

describe('project delivery with PostgreSQL and service-role authorization', () => {
  it('preserves artifact details, records events, rejects cross-tenant reads and synchronizes client decisions', async () => {
    const created = await request(
      'yux_admin',
      'POST',
      `/api/workspace/projects/${projectA}/deliverables`,
      {
        title: 'Protótipo',
        description: 'Descrição preservada',
        externalUrl: 'https://example.com/prototipo',
        dueDate: '2026-10-25',
        isClientVisible: false,
      }
    )
    expect(created.status).toBe(200)
    const id = created.body.data.id
    expect(created.body.data.dueDate).toBe('2026-10-25')
    const patch = await request(
      'yux_admin',
      'PATCH',
      `/api/workspace/projects/${projectA}/deliverables/${id}`,
      { status: 'delivered' }
    )
    expect(patch.status).toBe(200)
    expect(patch.body.data).toMatchObject({
      description: 'Descrição preservada',
      externalUrl: 'https://example.com/prototipo',
      dueDate: '2026-10-25',
    })
    const hidden = await request('client_admin_A', 'GET', detailsUrl)
    expect(hidden.status).toBe(200)
    expect(hidden.body.deliverables).toHaveLength(0)
    expect(hidden.body.timeline).toHaveLength(0)

    const approved = await request(
      'yux_admin',
      'POST',
      `/api/workspace/projects/${projectA}/approvals`,
      { targetType: 'deliverable', targetId: id, title: 'Revisar protótipo' }
    )
    expect(approved.status).toBe(200)
    const approvalId = approved.body.data.id
    const duplicate = await request(
      'yux_admin',
      'POST',
      `/api/workspace/projects/${projectA}/approvals`,
      { targetType: 'deliverable', targetId: id, title: 'Revisar protótipo' }
    )
    expect(duplicate.status).toBe(409)
    expect(
      (
        await request(
          'yux_admin',
          'PATCH',
          `/api/workspace/projects/${projectA}/deliverables/${id}`,
          { title: 'Outra versão' }
        )
      ).status
    ).toBe(409)
    const visible = await request('client_admin_A', 'GET', detailsUrl)
    expect(visible.status).toBe(200)
    expect(visible.body.deliverables).toHaveLength(1)
    expect(visible.body.approvals).toHaveLength(1)
    expect(
      visible.body.timeline.some(
        (entry: { entryType: string }) =>
          entry.entryType === 'approval_requested'
      )
    ).toBe(true)
    expect((await request('client_admin_B', 'GET', detailsUrl)).status).toBe(
      403
    )
    const ownWrongProject = `/api/project-delivery/portal/projects/${projectA}?organizationId=${fixtureIds.organizationB}`
    expect(
      (await request('client_admin_B', 'GET', ownWrongProject)).status
    ).toBe(404)

    const decisionUrl = `/api/project-delivery/portal/projects/${projectA}/approvals/${approvalId}/decision?organizationId=${fixtureIds.organizationA}`
    expect(
      (
        await request('client_admin_A', 'POST', decisionUrl, {
          decision: 'changes_requested',
          comment: ' ',
        })
      ).status
    ).toBe(400)
    expect(
      (
        await request('client_admin_B', 'POST', decisionUrl, {
          decision: 'approved',
        })
      ).status
    ).toBe(403)
    const decision = await request('client_admin_A', 'POST', decisionUrl, {
      decision: 'changes_requested',
      comment: ' Ajustar contraste ',
    })
    expect(decision.status).toBe(200)
    expect(
      (
        await request('client_admin_A', 'POST', decisionUrl, {
          decision: 'approved',
        })
      ).status
    ).toBe(409)
    const final = await request('client_admin_A', 'GET', detailsUrl)
    expect(final.body.deliverables[0].status).toBe('changes_requested')
    expect(final.body.approvals[0]).toMatchObject({
      status: 'changes_requested',
      decisions: [
        {
          comment: 'Ajustar contraste',
          decidedBy: fixtureUsers.client_admin_A.id,
        },
      ],
    })
    expect(
      final.body.timeline.some(
        (entry: { entryType: string }) => entry.entryType === 'approval_decided'
      )
    ).toBe(true)
    const queue = await request(
      'client_admin_A',
      'GET',
      `/api/project-delivery/portal/approvals?organizationId=${fixtureIds.organizationA}`
    )
    expect(queue.status).toBe(200)
    expect(
      queue.body.approvals.some(
        (approval: { id: string }) => approval.id === approvalId
      )
    ).toBe(true)

    const edits = await request(
      'yux_admin',
      'PATCH',
      `/api/workspace/projects/${projectA}/deliverables/${id}`,
      { description: 'Contraste revisado', status: 'delivered' }
    )
    expect(edits.status).toBe(200)
    const send = () =>
      request(
        'yux_admin',
        'POST',
        `/api/workspace/projects/${projectA}/approvals`,
        {
          targetType: 'deliverable',
          targetId: id,
          title: 'Revisar versão ajustada',
        }
      )
    const concurrent = await Promise.all([send(), send()])
    expect(concurrent.map((result) => result.status).sort()).toEqual([200, 409])
    const nextId = concurrent.find((result) => result.status === 200)!.body.data
      .id
    const nextUrl = `/api/project-delivery/portal/projects/${projectA}/approvals/${nextId}/decision?organizationId=${fixtureIds.organizationA}`
    expect(
      (
        await request('client_member_A', 'POST', nextUrl, {
          decision: 'approved',
        })
      ).status
    ).toBe(200)
    const revised = await request('client_admin_A', 'GET', detailsUrl)
    expect(revised.body.deliverables[0].status).toBe('approved')
    expect(revised.body.approvals).toHaveLength(2)
    expect(
      revised.body.approvals.find(
        (approval: { id: string }) => approval.id === approvalId
      ).decisions[0].comment
    ).toBe('Ajustar contraste')
  })
})
