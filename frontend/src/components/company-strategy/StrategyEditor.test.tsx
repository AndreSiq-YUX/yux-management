import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, click, byText } from '@/components/portal-ui/__tests__/render'
import { StrategyEditor } from './StrategyEditor'
import type { CompanyStrategyContentV1 } from '@/types/companyStrategy'

const initial: CompanyStrategyContentV1 = { schemaVersion: 1, title: 'Estratégia da oficina', objective: 'Captar revisões preventivas', summary: 'Priorizar agendamentos de revisão da região.', sections: [
  { id: '10000000-0000-4000-8000-000000000001', kind: 'audiences', title: 'Públicos', body: 'Motoristas da região.', agentUse: 'internal' },
  { id: '10000000-0000-4000-8000-000000000002', kind: 'next_steps', title: 'Próximos passos', body: 'Preparar atendimento e agendamento.', agentUse: 'internal' },
], references: { productIds: [], documentIds: [] } }
function Harness() { const [content, setContent] = useState(initial); return <StrategyEditor content={content} onChange={setContent} saving={false} /> }
describe('StrategyEditor', () => {
  it('reorders and removes optional sections without imposing sector-specific inputs', async () => {
    const { container, unmount } = await render(<Harness />)
    await click(container.querySelector('[aria-label="Mover Próximos passos para cima"]'))
    expect(Array.from(container.querySelectorAll<HTMLInputElement>('[data-section-title]')).map(input => input.value)).toEqual(['Próximos passos', 'Públicos'])
    await click(container.querySelector('[aria-label="Remover Públicos"]'))
    expect(container.querySelectorAll('[data-section-title]')).toHaveLength(1)
    expect(container.textContent).not.toContain('Pedido mínimo')
    await click(byText(container, 'button', 'Adicionar seção'))
    expect(container.querySelectorAll('[data-section-title]')).toHaveLength(2)
    await unmount()
  })
})
