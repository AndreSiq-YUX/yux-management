import { afterEach, describe, expect, it } from 'vitest'
import { byText, click, render } from '@/components/portal-ui/__tests__/render'
import { PortalJourneyPage } from './PortalJourneyPage'
import { PortalPage } from './PortalPage'

afterEach(() => { document.body.innerHTML = '' })

describe('PortalPage', () => {
  it('mostra a ajuda apenas atrás do botão, em painel com o título "Como esta área funciona"', async () => {
    const { container, unmount } = await render(
      <PortalPage title="Equipe" description="Quem acessa" help={['Convide pessoas', 'Defina papéis']} />,
    )
    expect(container.textContent).not.toContain('Convide pessoas')
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Como esta área funciona"]')
    expect(button).not.toBeNull()

    await click(button)
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Como esta área funciona')
    expect(document.body.textContent).toContain('Convide pessoas')
    expect(document.body.textContent).toContain('Defina papéis')
    await unmount()
  })

  it('não mostra o botão de ajuda quando não há ajuda', async () => {
    const { container, unmount } = await render(<PortalPage title="Equipe" />)
    expect(container.querySelector('button[aria-label="Como esta área funciona"]')).toBeNull()
    await unmount()
  })

  it('renderiza "Relacionados" no fim e a ação principal como link ou elemento', async () => {
    const { container, unmount } = await render(
      <PortalPage
        title="Tarefas"
        primaryAction={{ label: 'Nova tarefa', href: '/portal/comercial/tarefas' }}
        related={[{ label: 'Funis', href: '/portal/comercial/funis' }]}
      >
        <p>conteúdo</p>
      </PortalPage>,
    )
    const primary = byText(container, 'a', 'Nova tarefa')
    expect(primary?.getAttribute('href')).toBe('/portal/comercial/tarefas')
    const related = container.querySelector('nav[aria-labelledby="portal-page-related"]')
    expect(related?.textContent).toContain('Relacionados')
    expect(related?.querySelector('a')?.getAttribute('href')).toBe('/portal/comercial/funis')
    expect(container.textContent!.indexOf('conteúdo')).toBeLessThan(container.textContent!.indexOf('Relacionados'))
    await unmount()

    const custom = await render(<PortalPage title="Base" primaryAction={<button type="button">Adicionar</button>} />)
    expect(byText(custom.container, 'button', 'Adicionar')).not.toBeNull()
    await custom.unmount()
  })

  it('mostra indicadores reais e não renderiza a nota em âmbar', async () => {
    const { container, unmount } = await render(
      <PortalJourneyPage
        title="Antiga"
        description="Descrição"
        capabilities={['Explicação']}
        metrics={[{ label: 'Total', value: '3' }, { label: 'Ativos', value: '2' }]}
        secondaryActions={[{ label: 'Outra página', href: '/portal/x' }]}
        note="Nota interna do produto"
      />,
    )
    expect(container.textContent).toContain('Total')
    expect(container.textContent).not.toContain('Nota interna do produto')
    expect(container.textContent).not.toContain('Explicação')
    expect(container.textContent).toContain('Relacionados')
    expect(container.querySelector('button[aria-label="Como esta área funciona"]')).not.toBeNull()
    await unmount()
  })
})
