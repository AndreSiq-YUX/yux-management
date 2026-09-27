import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { RadarPlacePreviewPanel } from './RadarPlacePreviewPanel'

describe('RadarPlacePreviewPanel', () => {
  it('shows a transient result without presenting an omitted site as nonexistent', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => root.render(<RadarPlacePreviewPanel attribution="Brave Place Search" places={[{
      provider: 'brave_place_search', name: 'Empresa Exemplo', address: 'Rua A',
      websiteStatus: 'unknown', observedAt: '2026-09-27T12:00:00.000Z', storagePolicy: 'transient_only',
    }]} />))
    expect(container.textContent).toContain('Empresa Exemplo')
    expect(container.textContent).toContain('Site não informado; situação desconhecida')
    expect(container.textContent).toContain('pré-visualização temporária')
    expect(container.textContent).toContain('Brave Place Search')
    act(() => root.unmount())
  })
})
