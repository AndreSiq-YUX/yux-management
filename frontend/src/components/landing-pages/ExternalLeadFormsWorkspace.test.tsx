import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ExternalLeadFormsWorkspace } from './ExternalLeadFormsWorkspace'

describe('ExternalLeadFormsWorkspace', () => {
  it('lets a client create the first form without a landing page', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onCreate = vi.fn().mockResolvedValue(undefined)

    act(() => {
      root.render(
        <ExternalLeadFormsWorkspace
          contractName="Contrato principal"
          forms={[]}
          onCreate={onCreate}
          onRotate={vi.fn()}
          onToggle={vi.fn()}
          onUpdateOrigins={vi.fn()}
          onUpdateFields={vi.fn()}
        />,
      )
    })

    expect(container.innerHTML).toContain('Formulários externos')
    expect(container.innerHTML).toContain('Nenhum formulário externo criado')
    expect(container.innerHTML).toContain('sem depender de uma Landing Page')

    const firstFormButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Criar primeiro formulário'))
    await act(async () => { firstFormButton!.click() })

    expect(container.innerHTML).toContain('Novo formulário externo')
    const createButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Criar formulário e gerar endpoint'))
    await act(async () => { createButton!.click() })

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Formulário do site',
      allowedOrigins: [],
      consentCode: 'lead_capture',
      consentVersion: '1.0',
      privacyPolicyVersion: '1.0',
    })

    act(() => root.unmount())
  })
})
