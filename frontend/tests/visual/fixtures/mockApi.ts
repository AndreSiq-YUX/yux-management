import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { allRoutes } from './index'
import { isStatusResult, type MockRequest, type MockRoute } from './types'

export const OUTPUT_DIR = path.resolve(process.cwd(), 'test-results/visual')
const PARTIAL_RUN = Boolean(process.env.VISUAL_ONLY || process.env.VISUAL_WIDTHS)
export const UNMATCHED_FILE = path.join(
  OUTPUT_DIR,
  PARTIAL_RUN ? 'unmatched-requests.partial.txt' : 'unmatched-requests.txt',
)

function matches(route: MockRoute, req: { method: string; path: string }) {
  if (route.method) {
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    if (!methods.includes(req.method)) return null
  }
  if (typeof route.path === 'string') return route.path === req.path ? [] : null
  const found = route.path.exec(req.path)
  return found ? found.slice(1) : null
}

/** endpoint -> telas em que a chamada apareceu sem fixture. */
const unmatched = new Map<string, Set<string>>()

function flushUnmatched() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const lines = Array.from(unmatched.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([endpoint, screens]) => `${endpoint}   <- ${Array.from(screens).join(', ')}`)
  fs.writeFileSync(UNMATCHED_FILE, lines.length ? `${lines.join('\n')}\n` : '')
}

export function resetUnmatchedLog() {
  unmatched.clear()
  flushUnmatched()
}

function logUnmatched(method: string, pathname: string, screen: string) {
  // Normaliza ids para agrupar (uuid e numeros longos).
  const normalized = pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d{3,}(?=\/|$)/g, '/:n')
  const key = `${method} ${normalized}`
  const screens = unmatched.get(key) ?? new Set<string>()
  const before = screens.size
  screens.add(screen)
  unmatched.set(key, screens)
  if (before !== screens.size) flushUnmatched()
}

export interface MockApiOptions {
  authenticated?: boolean
  /** Nome da tela atual, usado no log de requisicoes sem fixture. */
  screen: () => string
}

/**
 * Instala o mock de /api/** na pagina. Qualquer requisicao sem fixture recebe um padrao
 * seguro (GET -> [] , demais -> {}) com status 200 e e registrada em unmatched-requests.txt.
 */
export async function installApiMock(page: Page, options: MockApiOptions) {
  const routes = allRoutes(options.authenticated !== false)

  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) {
      await route.fallback()
      return
    }

    const method = request.method()
    const apiPath = url.pathname.replace(/^\/api/, '')
    let body: unknown = null
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }

    for (const candidate of routes) {
      const params = matches(candidate, { method, path: apiPath })
      if (!params) continue
      const mockRequest: MockRequest = { method, path: apiPath, url, query: url.searchParams, body, params }
      const result = candidate.respond(mockRequest)
      if (isStatusResult(result)) {
        await route.fulfill({ status: result.__status, contentType: 'application/json', body: JSON.stringify(result.body) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
      }
      return
    }

    logUnmatched(method, apiPath, options.screen())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(method === 'GET' ? [] : {}),
    })
  })
}
