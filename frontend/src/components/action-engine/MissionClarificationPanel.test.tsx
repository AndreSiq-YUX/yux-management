import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionClarificationPanel } from './MissionClarificationPanel'
import type { MissionClarificationQuestion } from '@/types/actionEngine'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionClarificationPanel', () => {
  it('shows at most three questions and identifies editable company-context defaults', async () => {
    const questions: MissionClarificationQuestion[] = [
      question('legal_consent', 'Há consentimento?', true, 'source-1'),
      question('budget_limit', 'Qual orçamento?', '500', 'source-1'),
      question('campaign_goal', 'Qual meta?'),
      question('tone', 'Qual tom?'),
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<MissionClarificationPanel questions={questions} context={null} canWrite busy={false} onSubmit={vi.fn()} />)
    })

    expect(document.body.textContent).toContain('Sugerido a partir do Contexto da Empresa. Você pode alterar.')
    expect(document.body.textContent).toContain('Há consentimento?')
    expect(document.body.textContent).toContain('Qual orçamento?')
    expect(document.body.textContent).toContain('Qual meta?')
    expect(document.body.textContent).not.toContain('Qual tom?')
    act(() => root.unmount())
  })
})

function question(key: string, label: string, defaultValue: unknown = '', defaultSourceId?: string): MissionClarificationQuestion {
  return { key, label, whyNeeded: 'Necessário para o plano', priority: 1, answerType: 'text', defaultValue, defaultSourceId }
}
