import { createServer, type IncomingMessage, type Server } from 'node:http'

export type ProviderCall = {
  intentId: string
  payload: unknown
}

export type ProviderMode = 'success' | 'timeout' | 'rate-limit' | 'error' | 'lost-response'

export type TestProviderServer = {
  baseUrl: string
  calls(): ProviderCall[]
  close(): Promise<void>
}

export async function createTestProviderServer(): Promise<TestProviderServer> {
  const recorded: ProviderCall[] = []
  const server = createServer(async (request, response) => {
    const payload = await readPayload(request)
    const mode = readMode(request)
    const intentId = request.headers['x-yux-intent-id']?.toString()
      || (isRecord(payload) && typeof payload.intentId === 'string' ? payload.intentId : '')
    recorded.push({ intentId, payload })

    if (mode === 'timeout') {
      setTimeout(() => {
        if (!response.destroyed) response.destroy()
      }, 2_000)
      return
    }
    if (mode === 'lost-response') {
      request.socket.destroy()
      return
    }
    if (mode === 'rate-limit') {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' })
      response.end(JSON.stringify({ error: 'test_rate_limit' }))
      return
    }
    if (mode === 'error') {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'test_provider_error' }))
      return
    }

    response.writeHead(202, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ accepted: true, intentId }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test_provider_address_unavailable')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    calls: () => recorded.map(call => ({ ...call })),
    close: () => closeServer(server),
  }
}

async function readPayload(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return raw }
}

function readMode(request: IncomingMessage): ProviderMode {
  const value = request.headers['x-test-provider-mode']?.toString()
  return ['success', 'timeout', 'rate-limit', 'error', 'lost-response'].includes(value || '')
    ? value as ProviderMode
    : 'success'
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

