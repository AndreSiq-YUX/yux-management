import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { LeadCsvImportPanel } from './LeadCsvImportPanel'

describe('LeadCsvImportPanel', () => {
  it('renders CSV preview metrics', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<LeadCsvImportPanel />)
    })

    expect(container.innerHTML).toContain('Importacao CSV')
    expect(container.innerHTML).toContain('Linhas')
    expect(container.innerHTML).toContain('Validas')

    act(() => root.unmount())
  })
})
