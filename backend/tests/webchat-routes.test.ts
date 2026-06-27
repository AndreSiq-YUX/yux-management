import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppJobQueue } from '../src/server.js'
import type { JobName, QueueJobData } from '../src/jobs/queue.js'
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
  org: '00000000-0000-4000-8000-000000000001',
  widget: '00000000-0000-4000-8000-000000000002',
  session: '00000000-0000-4000-8000-000000000003',
}

class FakePool {
  async query(sql: string) {
    if (sql.includes('FROM private.webchat_widget_tokens')) {
      return {
        rows: [{
          id: ids.widget,
          organization_id: ids.org,
          name: 'YUX Atendimento',
          branding: { primaryColor: '#111827' },
          consent_text: 'Aceito o contato.',
          initial_form: { fields: ['name', 'email'] },
        }],
      }
    }
    if (sql.includes('INSERT INTO public.webchat_sessions')) {
      return { rows: [{ id: ids.session }] }
    }
    return { rows: [], rowCount: 0 }
  }

  async end() {
    return undefined
  }
}

class FakeJobQueue implements AppJobQueue {
  async add(_name: JobName, _data: QueueJobData) {
    return { id: 'job-1' }
  }

  async close() {
    return undefined
  }
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('public webchat routes', () => {
  it('bootstraps a widget session through the backend API', async () => {
    app = await buildServer(testEnv, { pool: new FakePool() as never, jobQueue: new FakeJobQueue() })

    const response = await app.inject({
      method: 'POST',
      url: '/api/public/webchat/events',
      payload: {
        action: 'bootstrap_widget',
        publicToken: 'public-token',
        origin: 'https://site.example',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(expect.objectContaining({
      sessionId: ids.session,
      iframeUrl: expect.stringMatching(/^\/webchat\/session\//),
      sessionToken: expect.any(String),
    }))
  })
})
