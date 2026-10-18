import { describe, expect, it, vi } from 'vitest'
import { Inbox } from 'lucide-react'
import { AttentionItem } from '../AttentionItem'
import { BarList, FunnelBars, barPercent } from '../BarList'
import { DecisionCard } from '../DecisionCard'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { MasterDetail } from '../MasterDetail'
import { PageHeader } from '../PageHeader'
import { PeriodSelector } from '../PeriodSelector'
import { ProgressRow } from '../ProgressRow'
import { ResponsiveTable } from '../ResponsiveTable'
import { SectionCard } from '../SectionCard'
import { SkeletonCard, SkeletonKpiGrid, SkeletonLines } from '../Skeleton'
import { Sparkline, sparklinePoints } from '../Sparkline'
import { StatusChip } from '../StatusChip'
import { StickySaveBar, useUnsavedChangesWarning } from '../StickySaveBar'
import { Timeline, TimelineItem } from '../Timeline'
import { byText, click, render } from './render'

describe('Sparkline', () => {
  it('renders area + line paths, hidden from assistive tech', async () => {
    const { container, unmount } = await render(<Sparkline values={[1, 3, 2, 5]} tone="bad" />)
    expect(container.querySelectorAll('path')).toHaveLength(2)
    const line = container.querySelectorAll('path')[1]
    expect(line.getAttribute('d')).toMatch(/^M0 /)
    expect(line.getAttribute('stroke-width')).toBe('1.6')
    expect(container.querySelector('svg')!.getAttribute('preserveAspectRatio')).toBe('none')
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true')
    expect(container.firstElementChild!.className).toContain('text-yx-crit')
    await unmount()
  })

  it('renders nothing for fewer than two values', async () => {
    const a = await render(<Sparkline values={[]} />)
    expect(a.container.querySelector('svg')).toBeNull()
    await a.unmount()
    const b = await render(<Sparkline values={[4]} />)
    expect(b.container.querySelector('svg')).toBeNull()
    await b.unmount()
  })

  it('handles flat series by centering the line', () => {
    const pts = sparklinePoints([2, 2, 2])
    expect(new Set(pts.map(p => p[1])).size).toBe(1)
    expect(pts[0][0]).toBe(0)
    expect(pts[2][0]).toBe(100)
  })
})

describe('AttentionItem', () => {
  it.each([
    ['high', 'Alta'],
    ['medium', 'Média'],
    ['low', 'Baixa'],
  ] as const)('shows the written priority %s as %s', async (priority, label) => {
    const { container, unmount } = await render(<AttentionItem priority={priority} title="Título" owner="Equipe" wait="há 2 dias" />)
    expect(byText(container, 'span', label)).not.toBeNull()
    expect(container.textContent).toContain('Equipe')
    expect(container.textContent).toContain('há 2 dias')
    await unmount()
  })

  it('renders the YUX chip instead of the owner', async () => {
    const { container, unmount } = await render(<AttentionItem priority="medium" title="t" owner="Equipe" ownerIsYux />)
    expect(container.textContent).toContain('YUX cuidando')
    expect(container.textContent).not.toContain('Equipe')
    expect(container.querySelector('[data-variant="yux"]')).not.toBeNull()
    await unmount()
  })
})

describe('PeriodSelector', () => {
  it('marks the active option with aria-pressed and reports changes', async () => {
    const onChange = vi.fn()
    const { container, unmount } = await render(<PeriodSelector value="7d" onChange={onChange} caption="vs. 7 dias antes" />)
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.map(b => b.textContent)).toEqual(['Hoje', '7 dias', '30 dias'])
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(container.textContent).toContain('vs. 7 dias antes')
    await click(buttons[2])
    expect(onChange).toHaveBeenCalledWith('30d')
    await unmount()
  })
})

describe('StickySaveBar', () => {
  it('is hidden when not dirty', async () => {
    const { container, unmount } = await render(<StickySaveBar dirty={false} onSave={() => {}} onDiscard={() => {}} />)
    expect(container.textContent).toBe('')
    await unmount()
  })

  it('shows message and actions when dirty and handles saving state', async () => {
    const onSave = vi.fn()
    const onDiscard = vi.fn()
    const { container, rerender, unmount } = await render(<StickySaveBar dirty onSave={onSave} onDiscard={onDiscard} />)
    expect(container.textContent).toContain('Você tem alterações não salvas')
    expect(container.firstElementChild!.className).toContain('lg:left-64')
    await click(byText(container, 'button', 'Salvar alterações'))
    await click(byText(container, 'button', 'Descartar'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onDiscard).toHaveBeenCalledTimes(1)
    await rerender(<StickySaveBar dirty saving onSave={onSave} onDiscard={onDiscard} />)
    expect((byText(container, 'button', 'Salvar alterações') as HTMLButtonElement).disabled).toBe(true)
    await unmount()
  })

  it('useUnsavedChangesWarning registers beforeunload only while dirty', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    function Probe({ dirty }: { dirty: boolean }) {
      useUnsavedChangesWarning(dirty)
      return null
    }
    const { rerender, unmount } = await render(<Probe dirty={false} />)
    expect(add.mock.calls.some(c => c[0] === 'beforeunload')).toBe(false)
    await rerender(<Probe dirty />)
    const call = add.mock.calls.find(c => c[0] === 'beforeunload')!
    expect(call).toBeDefined()
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    ;(call[1] as (e: BeforeUnloadEvent) => void)(event)
    expect(event.defaultPrevented).toBe(true)
    await rerender(<Probe dirty={false} />)
    expect(remove.mock.calls.some(c => c[0] === 'beforeunload')).toBe(true)
    await unmount()
    add.mockRestore()
    remove.mockRestore()
  })
})

describe('ResponsiveTable', () => {
  const rows = [
    { id: '1', name: 'Ana', status: 'Ativo' },
    { id: '2', name: 'Bruno', status: 'Pausado' },
  ]
  const columns = [
    { key: 'name', header: 'Nome' },
    { key: 'status', header: 'Situação', mobileLabel: 'Status', render: (r: (typeof rows)[number]) => <b>{r.status}</b> },
  ]

  it('renders a table and stacked cards with label/value pairs', async () => {
    const { container, unmount } = await render(<ResponsiveTable columns={columns} rows={rows} getRowKey={r => r.id} />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.querySelector('[data-testid="responsive-table-desktop"]')!.className).toContain('overflow-x-auto')
    const cards = container.querySelectorAll('[data-testid="responsive-table-cards"] > li')
    expect(cards).toHaveLength(2)
    expect(Array.from(cards[0].querySelectorAll('dt')).map(d => d.textContent)).toEqual(['Nome', 'Status'])
    expect(Array.from(cards[0].querySelectorAll('dd')).map(d => d.textContent)).toEqual(['Ana', 'Ativo'])
    await unmount()
  })

  it('calls onRowClick from table rows and cards', async () => {
    const onRowClick = vi.fn()
    const { container, unmount } = await render(<ResponsiveTable columns={columns} rows={rows} getRowKey={r => r.id} onRowClick={onRowClick} />)
    await click(container.querySelector('tbody tr'))
    await click(container.querySelector('[data-testid="responsive-table-cards"] > li'))
    expect(onRowClick).toHaveBeenCalledTimes(2)
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
    await unmount()
  })

  it('renders the empty node when there are no rows', async () => {
    const { container, unmount } = await render(
      <ResponsiveTable columns={columns} rows={[]} getRowKey={(_, i) => String(i)} empty={<p>Nada aqui</p>} />,
    )
    expect(container.textContent).toBe('Nada aqui')
    expect(container.querySelector('table')).toBeNull()
    await unmount()
  })
})

describe('MasterDetail', () => {
  it('shows only the list state (no back button) when nothing is selected', async () => {
    const { container, unmount } = await render(
      <MasterDetail list={<div>Lista</div>} detail={null} onBack={() => {}} emptyDetail={<div>Escolha um item</div>} />,
    )
    expect(container.querySelector('[data-testid="master-list"]')!.className).not.toContain('hidden')
    expect(container.querySelector('[data-testid="master-detail"]')!.className).toContain('hidden lg:block')
    expect(byText(container, 'button', 'Voltar')).toBeNull()
    await unmount()
  })

  it('shows the detail with a back button that calls onBack', async () => {
    const onBack = vi.fn()
    const { container, unmount } = await render(
      <MasterDetail list={<div>Lista</div>} detail={<div>Detalhe</div>} onBack={onBack} backLabel="Voltar às conversas" listWidth={400} />,
    )
    expect(container.querySelector('[data-testid="master-list"]')!.className).toContain('hidden lg:block')
    expect(container.textContent).toContain('Detalhe')
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--md-list-w')).toBe('400px')
    await click(byText(container, 'button', 'Voltar às conversas'))
    expect(onBack).toHaveBeenCalledTimes(1)
    await unmount()
  })
})

describe('PageHeader / SectionCard / StatusChip', () => {
  it('renders header parts', async () => {
    const { container, unmount } = await render(
      <PageHeader
        eyebrow="Visão geral"
        live={{ label: 'dados atualizados há 12 min' }}
        title="Bom dia"
        lead="Resumo"
        meta={<StatusChip variant="ok">Ativo</StatusChip>}
        actions={<button>Ação</button>}
      />,
    )
    expect(container.querySelector('h1')!.textContent).toBe('Bom dia')
    expect(container.textContent).toContain('dados atualizados há 12 min')
    expect(container.textContent).toContain('Visão geral')
    expect(container.textContent).toContain('Ativo')
    expect(byText(container, 'button', 'Ação')).not.toBeNull()
    await unmount()
  })

  it('renders SectionCard with labelled heading and action', async () => {
    const { container, unmount } = await render(
      <SectionCard id="funil" title="Funil" description="Etapas" action={<a href="/x">Ver tudo</a>}>
        corpo
      </SectionCard>,
    )
    const section = container.querySelector('section')!
    expect(section.getAttribute('aria-labelledby')).toBe('funil-title')
    expect(container.querySelector('h2')!.textContent).toBe('Funil')
    expect(container.textContent).toContain('Ver tudo')
    expect(container.textContent).toContain('corpo')
    await unmount()
  })

  it('StatusChip yux uses the gradient border', async () => {
    const { container, unmount } = await render(<StatusChip variant="yux">YUX</StatusChip>)
    const chip = container.firstElementChild as HTMLElement
    expect(chip.getAttribute('style')).toContain('var(--yx-grad-brand)')
    await unmount()
  })
})

describe('BarList / FunnelBars', () => {
  it('scales bars to the largest value', async () => {
    expect(barPercent(50, 200)).toBe(25)
    expect(barPercent(5, 0)).toBe(0)
    const { container, unmount } = await render(
      <BarList items={[{ label: 'A', value: 200, display: '200' }, { label: 'B', value: 50 }]} />,
    )
    const fills = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="bar-fill"]'))
    expect(fills.map(f => f.style.width)).toEqual(['100%', '25%'])
    await unmount()
  })

  it('highlights the bottleneck and shows conversion text', async () => {
    const { container, unmount } = await render(
      <FunnelBars
        bottleneckIndex={1}
        stages={[
          { label: 'Leads', value: 100 },
          { label: 'Propostas', value: 20, conv: '20% avançaram' },
        ]}
      />,
    )
    expect(container.textContent).toContain('20% avançaram')
    expect(byText(container, 'span', 'Propostas')!.className).toContain('text-yx-warn')
    expect(byText(container, 'span', 'Leads')!.className).not.toContain('text-yx-warn')
    await unmount()
  })
})

describe('DecisionCard / Timeline / ProgressRow', () => {
  it('renders the decision stripe tone, module and actions', async () => {
    const { container, unmount } = await render(
      <DecisionCard tone="crit" module={{ label: 'Aprovações', icon: Inbox }} wait="há 2 dias" title="Aprovar peça" actions={<button>Aprovar</button>} />,
    )
    expect(container.querySelector('[data-testid="decision-stripe"]')!.className).toContain('bg-yx-crit')
    expect(container.textContent).toContain('Aprovações')
    expect(container.textContent).toContain('há 2 dias')
    expect(container.querySelector('h3')!.textContent).toBe('Aprovar peça')
    await unmount()
  })

  it('renders timeline items with gradient dot for yux', async () => {
    const { container, unmount } = await render(
      <Timeline>
        <TimelineItem when="hoje" title="Publicado" variant="yux" tag="Conteúdo" />
        <TimelineItem when="ontem" title="Reunião" />
      </Timeline>,
    )
    const dots = container.querySelectorAll('[data-testid="timeline-dot"]')
    expect(dots[0].className).toContain('bg-brand-gradient')
    expect(dots[1].className).not.toContain('bg-brand-gradient')
    expect(container.querySelectorAll('time')).toHaveLength(2)
    await unmount()
  })

  it('clamps progress and exposes aria values', async () => {
    const { container, unmount } = await render(<ProgressRow title="Site" percent={140} status={<StatusChip>Em andamento</StatusChip>} />)
    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    await unmount()
    const neg = await render(<ProgressRow title="Site" percent={-5} />)
    expect(neg.container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('0')
    await neg.unmount()
  })
})

describe('states', () => {
  it('EmptyState renders a workspace-aware link or a button action', async () => {
    const a = await render(<EmptyState icon={Inbox} title="Nada ainda" description="Comece criando" action={{ label: 'Criar', href: '/portal/novo' }} />)
    expect(a.container.querySelector('a')!.getAttribute('href')).toBe('/portal/novo')
    await a.unmount()
    const onClick = vi.fn()
    const b = await render(<EmptyState title="Nada" action={{ label: 'Criar', onClick }} />)
    await click(byText(b.container, 'button', 'Criar'))
    expect(onClick).toHaveBeenCalled()
    await b.unmount()
  })

  it('ErrorState has default title and retry button', async () => {
    const onRetry = vi.fn()
    const { container, unmount } = await render(<ErrorState onRetry={onRetry} />)
    expect(container.textContent).toContain('Não foi possível carregar.')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    await click(byText(container, 'button', 'Tentar novamente'))
    expect(onRetry).toHaveBeenCalled()
    await unmount()
  })

  it('Skeletons respect reduced motion and match KpiGrid columns', async () => {
    const { container, unmount } = await render(
      <div>
        <SkeletonLines lines={2} />
        <SkeletonCard />
        <SkeletonKpiGrid count={4} />
      </div>,
    )
    const pulsing = container.querySelectorAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)
    pulsing.forEach(el => expect(el.className).toContain('motion-reduce:animate-none'))
    expect(container.querySelectorAll('[data-skeleton="kpi"]')).toHaveLength(4)
    expect(container.innerHTML).toContain('min-[1280px]:grid-cols-4')
    await unmount()
  })
})
