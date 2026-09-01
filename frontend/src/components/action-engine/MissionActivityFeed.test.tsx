import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { MissionActivityFeed } from './MissionActivityFeed'
import type { MissionActivityItem } from '@/types/actionEngine'

afterEach(() => { document.body.innerHTML = '' })

describe('MissionActivityFeed', () => {
  it('shows plain-language progress, safe technical disclosure and valid artifact destinations', () => {
    const activity: MissionActivityItem[] = [
      { id: 'request-1', kind: 'request', state: 'success', title: 'Pedido confirmado', description: 'O briefing virou uma missão.', occurredAt: '2026-08-31T12:00:00.000Z' },
      { id: 'planning-1', kind: 'planning', state: 'active', title: 'Plano em preparação', description: 'O agente está verificando o contexto.', occurredAt: '2026-08-31T12:01:00.000Z', technicalEvidence: { recordId: 'event-1' } },
      { id: 'artifact-1', kind: 'artifact', state: 'success', title: 'Funil criado', description: 'O entregável está disponível.', occurredAt: '2026-08-31T12:02:00.000Z', artifact: { kind: 'funnel', title: 'Funil comercial', status: 'draft', entityId: 'pipeline-1' } },
      { id: 'artifact-2', kind: 'artifact', state: 'success', title: 'Entregável criado', description: 'Evidência registrada.', occurredAt: '2026-08-31T12:03:00.000Z', artifact: { kind: 'unknown', title: 'Outro', status: 'draft', entityId: 'other-1' } },
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<MemoryRouter><MissionActivityFeed activity={activity} artifactHref={artifact => artifact.kind === 'funnel' ? '/portal/comercial/funis' : undefined} /></MemoryRouter>))
    expect(container.textContent).toContain('Pedido confirmado')
    expect(container.textContent).toContain('Plano em preparação')
    expect(container.textContent).toContain('Evidência técnica')
    const links = [...container.querySelectorAll('a')]
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/portal/comercial/funis')
    act(() => root.unmount())
  })
})
