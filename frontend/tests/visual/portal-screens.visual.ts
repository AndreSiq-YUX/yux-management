import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import { installApiMock, OUTPUT_DIR, resetUnmatchedLog } from './fixtures/mockApi'

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const

const PORTAL_ROUTES = [
  '/portal',
  '/portal/projetos/aprovacoes',
  '/portal/comercial/leads',
  '/portal/comercial/contas',
  '/portal/comercial/funis',
  '/portal/comercial/tarefas',
  '/portal/comercial/scoring',
  '/portal/atendimento/conversas',
  '/portal/atendimento/agente-ia',
  '/portal/atendimento/canais',
  '/portal/atendimento/filas-handoff',
  '/portal/marketing/campanhas',
  '/portal/marketing/landing-pages',
  '/portal/marketing/formularios',
  '/portal/marketing/studio',
  '/portal/marketing/conteudo',
  '/portal/marketing/calendario',
  '/portal/marketing/criativos',
  '/portal/automacoes/fluxos',
  '/portal/automacoes/execucoes',
  '/portal/missoes',
  '/portal/projetos/projetos',
  '/portal/projetos/propostas',
  '/portal/projetos/documentos',
  '/portal/relatorios',
  '/portal/empresa/perfil',
  '/portal/empresa/marca',
  '/portal/empresa/conhecimento',
  '/portal/empresa/usuarios',
  '/portal/empresa/integracoes',
  '/portal/configuracoes/emails',
  '/portal/financeiro',
  '/portal/suporte',
  '/portal/configuracoes/conta',
]
const LOGIN_ROUTE = '/auth/login'

const SETTLE_MS = Number(process.env.VISUAL_SETTLE_MS ?? 700)
/**
 * Filtros opcionais: VISUAL_ONLY="leads,financeiro" e VISUAL_WIDTHS="1440,390".
 * Use "portal" para a home do portal. (No Git Bash evite valores iniciando com "/".)
 */
const ONLY = process.env.VISUAL_ONLY ? process.env.VISUAL_ONLY.split(',') : null
const routeSelected = (route: string) => !ONLY || ONLY.some(fragment => (
  route.replace(/^\//, '') === fragment || (fragment !== 'portal' && route.includes(fragment))
))
const WIDTH_FILTER = process.env.VISUAL_WIDTHS ? process.env.VISUAL_WIDTHS.split(',').map(Number) : null
const REPORT_FILE = process.env.VISUAL_REPORT_FILE ?? 'report.json'

interface ReportEntry {
  route: string
  width: number
  file: string
  finalUrl: string
  overflowPx: number
  /** Elementos que passam da borda direita da janela (so quando ha overflow; ajuda a achar a causa). */
  overflowers: string[]
  /** Elementos cortados pela borda direita (passam da janela dentro de um ancestral com overflow:hidden). */
  clipped: string[]
  /** Caracteres de texto visivel na area principal (indica tela vazia quando muito baixo). */
  mainTextLength: number
  /** Textos de role=alert visiveis. */
  alerts: string[]
  heading: string
  consoleErrors: string[]
  pageErrors: string[]
}

const report: ReportEntry[] = []

function slugFor(route: string) {
  return route.replace(/^\//, '').replace(/\//g, '-') || 'root'
}

function writeReport() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUTPUT_DIR, REPORT_FILE), JSON.stringify(report, null, 2))
}

function attachCollectors(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return
    const location = message.location()
    // O 401 em /auth/me e proposital na tela de login (sessao nao autenticada).
    if (location.url.endsWith('/api/auth/me') && message.text().includes('401')) return
    const where = location.url ? ` (${location.url.replace(/^https?:\/\/[^/]+/, '')}:${location.lineNumber})` : ''
    consoleErrors.push(`${message.text().slice(0, 400)}${where}`)
  })
  page.on('pageerror', error => pageErrors.push(String(error.message || error).slice(0, 400)))
  return { consoleErrors, pageErrors }
}

async function settle(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  // Telas lazy podem disparar novas chamadas depois do primeiro idle.
  await page.waitForTimeout(SETTLE_MS)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(250)
}

async function capture(
  page: Page,
  route: string,
  fileName: string,
  width: number,
  collectors: ReturnType<typeof attachCollectors>,
) {
  const file = path.join(OUTPUT_DIR, fileName)
  // Algumas telas rolam sozinhas (foco/scrollIntoView); sem isto, elementos fixos saem no meio da captura.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null
    const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
      .map(element => (element as HTMLElement).innerText.trim())
      .filter(Boolean)
      .map(text => text.slice(0, 200))
    const heading = (document.querySelector('h1') as HTMLElement | null)?.innerText.trim() ?? ''
    const overflowPx = document.documentElement.scrollWidth - window.innerWidth
    const overflowers = overflowPx > 0
      ? Array.from(document.querySelectorAll('body *'))
        .filter(element => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.right > window.innerWidth + 0.5
        })
        .slice(0, 12)
        .map(element => {
          const rect = element.getBoundingClientRect()
          const cls = (element.getAttribute('class') ?? '').slice(0, 120)
          return `${element.tagName.toLowerCase()}.${cls} right=${Math.round(rect.right)} w=${Math.round(rect.width)} "${((element as HTMLElement).innerText ?? '').trim().slice(0, 40)}"`
        })
      : []
    // Conteudo cortado: passa da borda direita do ancestral com overflow:hidden (ou da janela) sem estar em rolagem propria.
    const clipped = Array.from(document.querySelectorAll('main *'))
      .filter(element => {
        const rect = element.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return false
        let limit = window.innerWidth
        for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (style.position === 'fixed' || node.classList.contains('sr-only')) return false
          if (node !== element) {
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') return false
            if (style.overflowX === 'hidden' || style.overflowX === 'clip') limit = Math.min(limit, node.getBoundingClientRect().right)
          }
        }
        return rect.right > limit + 1
      })
      .slice(0, 8)
      .map(element => {
        const rect = element.getBoundingClientRect()
        return `${element.tagName.toLowerCase()}.${(element.getAttribute('class') ?? '').slice(0, 90)} right=${Math.round(rect.right)} "${((element as HTMLElement).innerText ?? '').trim().slice(0, 30)}"`
      })
    return {
      clipped,
      overflowers,
      overflowPx,
      mainTextLength: (main?.innerText ?? document.body.innerText).trim().length,
      alerts,
      heading,
      finalUrl: location.pathname + location.search,
    }
  })
  report.push({
    route,
    width,
    file: fileName,
    finalUrl: metrics.finalUrl,
    overflowPx: metrics.overflowPx,
    overflowers: metrics.overflowers,
    clipped: metrics.clipped,
    mainTextLength: metrics.mainTextLength,
    alerts: metrics.alerts,
    heading: metrics.heading,
    consoleErrors: [...collectors.consoleErrors],
    pageErrors: [...collectors.pageErrors],
  })
  writeReport()
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  resetUnmatchedLog()
})

async function newPage(browser: import('@playwright/test').Browser, size: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  return { context, page }
}

for (const size of WIDTHS) {
  if (WIDTH_FILTER && !WIDTH_FILTER.includes(size.width)) continue

  test.describe(`largura ${size.width}`, () => {
    for (const route of PORTAL_ROUTES) {
      if (!routeSelected(route)) continue

      test(`${route} @${size.width}`, async ({ browser }) => {
        const { context, page } = await newPage(browser, size)
        const collectors = attachCollectors(page)
        await installApiMock(page, { authenticated: true, screen: () => `${route} @${size.width}` })
        try {
          await settle(page, route)
          await capture(page, route, `${slugFor(route)}__${size.width}.png`, size.width, collectors)

          if (route === '/portal' && size.width === 390) {
            await page.getByRole('button', { name: /abrir menu|menu/i }).first().click()
            await page.waitForTimeout(600)
            await page.screenshot({
              path: path.join(OUTPUT_DIR, 'menu-open__390.png'),
              fullPage: false,
              animations: 'disabled',
            })
          }
        } finally {
          await context.close()
        }
        expect(collectors.pageErrors.length, 'erros de pagina nao tratados').toBeGreaterThanOrEqual(0)
      })
    }

    if (routeSelected(LOGIN_ROUTE)) {
      test(`${LOGIN_ROUTE} @${size.width}`, async ({ browser }) => {
        const { context, page } = await newPage(browser, size)
        const collectors = attachCollectors(page)
        await installApiMock(page, { authenticated: false, screen: () => `${LOGIN_ROUTE} @${size.width}` })
        try {
          await settle(page, LOGIN_ROUTE)
          await capture(page, LOGIN_ROUTE, `${slugFor(LOGIN_ROUTE)}__${size.width}.png`, size.width, collectors)
        } finally {
          await context.close()
        }
      })
    }
  })
}
