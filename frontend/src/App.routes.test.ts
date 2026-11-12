import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8')

function routes(block: string) {
  return Array.from(block.matchAll(/<Route path="([^"]+)" element=\{(<(?!Navigate)[^}]+)\}/g))
    .map(([, path, element]) => ({ path: path!, element: element!.trim() }))
}

describe('client workspace route parity', () => {
  it('opens every client portal screen for YUX staff operating the client workspace', () => {
    const workspaceStart = source.indexOf('<Route path="client-workspaces/:organizationId"')
    const workspaceEnd = source.indexOf('</Route>', workspaceStart)
    expect(workspaceStart).toBeGreaterThan(-1)

    const workspace = new Set(routes(source.slice(workspaceStart, workspaceEnd)).map(route => `${route.path} ${route.element}`))
    const portal = routes(source)
      .filter(route => route.path.startsWith('portal/'))
      .map(route => `${route.path.slice('portal/'.length)} ${route.element}`)

    expect(portal.length).toBeGreaterThan(30)
    expect(portal.filter(route => !workspace.has(route))).toEqual([])
  })
})
