import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { AdminChannelsTable } from './AdminChannelsTable'

describe('AdminChannelsTable', () => {
  it('renders client channel health rows', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <AdminChannelsTable
          rows={[{
            id: 'conn-1',
            organizationName: 'Clinica YUX',
            channel: 'whatsapp',
            displayName: 'Comercial',
            providerAccountId: 'waba-1',
            healthStatus: 'connected',
            tokenState: 'connected',
            providerVerifyState: 'verified',
            lastEventAt: '2026-06-05T12:00:00Z',
          }]}
        />,
      )
    })

    const html = container.textContent || ''
    expect(html).toContain('Clinica YUX')
    expect(html).toContain('whatsapp')
    expect(html).toContain('connected')

    act(() => root.unmount())
    container.remove()
  })
})
