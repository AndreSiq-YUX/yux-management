import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { LeadWorkspaceLayout } from './LeadWorkspaceLayout'
it('makes contact and profile data reachable before the work area on mobile', () => {
  const host = document.createElement('div'),
    root = createRoot(host)
  try {
    act(() =>
      root.render(
        <LeadWorkspaceLayout
          workKey="overview"
          header="Empresa"
          identity={<p>Refeições diárias: 3.000</p>}
        >
          Atividades
        </LeadWorkspaceLayout>,
      ),
    )
    const toggle = host.querySelector(
      'button[aria-controls="lead-identity"]',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('#lead-identity')?.textContent).toContain('3.000')
    act(() =>
      root.render(
        <LeadWorkspaceLayout
          workKey="edit-profile"
          header="Empresa"
          identity={<p>Refeições diárias: 3.000</p>}
        >
          Editor do perfil
        </LeadWorkspaceLayout>,
      ),
    )
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  } finally {
    act(() => root.unmount())
  }
})
