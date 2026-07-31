import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { CrmPublicationWizard } from './CrmPublicationWizard'

describe('CrmPublicationWizard', () => {
  it('requires a migration plan before publishing impacted leads', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<CrmPublicationWizard impactedOpenLeadCount={7} />)
    })

    expect(container.innerHTML).toContain('7 leads abertos impactados')
    expect(container.innerHTML).toContain('Mapear etapas antigas para novas')
    expect(container.querySelector('button')?.disabled).toBe(true)
  })
})
