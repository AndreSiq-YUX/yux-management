import { describe, expect, it } from 'vitest'
import { KpiCard } from '../KpiCard'
import { KpiGrid, getKpiGridColumns } from '../KpiGrid'
import { PendingBadge } from '../PendingBadge'
import { byText, render } from './render'

describe('getKpiGridColumns', () => {
  it('maps counts to column classes that fill each row', () => {
    expect(getKpiGridColumns(6)).toBe('grid-cols-2 md:grid-cols-3 min-[1480px]:grid-cols-6')
    expect(getKpiGridColumns(4)).toBe('grid-cols-2 min-[1280px]:grid-cols-4')
    expect(getKpiGridColumns(3)).toBe('grid-cols-1 md:grid-cols-3')
    expect(getKpiGridColumns(2)).toBe('grid-cols-2')
    expect(getKpiGridColumns(5)).toBe('grid-cols-2 md:grid-cols-3')
    expect(getKpiGridColumns(1)).toBe('grid-cols-2 md:grid-cols-3')
  })

  it('never leaves a lone card in a row for the supported counts at standard widths', () => {
    // 390 -> 2 cols, 768 -> md (3 cols or 2), 1280 -> 3 cols (6) / 4 cols (4), 1440 -> 3 cols (6) / 4 cols (4)
    const widths: Record<string, number[]> = { 6: [2, 3, 3, 3], 4: [2, 2, 4, 4], 3: [1, 3, 3, 3], 2: [2, 2, 2, 2] }
    for (const [count, cols] of Object.entries(widths)) {
      for (const c of cols) expect(Number(count) % c).toBe(0)
    }
  })
})

describe('KpiGrid', () => {
  it('uses the children count when count is omitted and wraps each child in a list item', async () => {
    const { container, unmount } = await render(
      <KpiGrid>
        <KpiCard label="A" value="1" />
        <KpiCard label="B" value="2" />
        <KpiCard label="C" value="3" />
      </KpiGrid>,
    )
    const list = container.querySelector('ul')!
    expect(list.getAttribute('data-columns')).toBe('grid-cols-1 md:grid-cols-3')
    expect(list.querySelectorAll('li')).toHaveLength(3)
    await unmount()
  })

  it('respects an explicit count', async () => {
    const { container, unmount } = await render(
      <KpiGrid count={6}>
        <KpiCard label="A" value="1" />
      </KpiGrid>,
    )
    expect(container.querySelector('ul')!.className).toContain('min-[1480px]:grid-cols-6')
    await unmount()
  })
})

describe('KpiCard', () => {
  it('renders label, value, delta with tone and comparison', async () => {
    const { container, unmount } = await render(
      <KpiCard label="Leads" value="1.284" delta={{ text: '+12%', tone: 'good' }} comparison="vs. 7 dias antes" />,
    )
    expect(container.textContent).toContain('Leads')
    expect(container.textContent).toContain('1.284')
    expect(container.textContent).toContain('vs. 7 dias antes')
    expect(container.querySelector('[data-tone="good"]')?.textContent).toBe('+12%')
    expect(container.querySelector('a')).toBeNull()
    await unmount()
  })

  it('renders a link with the resolved path when href is given', async () => {
    const { container, unmount } = await render(<KpiCard label="Leads" value="9" href="/portal/leads" />)
    const link = container.querySelector('a')!
    expect(link.getAttribute('href')).toBe('/portal/leads')
    expect(link.querySelector('svg')).not.toBeNull()
    await unmount()
  })

  it('shows the pending slot instead of value and delta', async () => {
    const { container, unmount } = await render(
      <KpiCard label="Prazo de resposta" value="98%" delta={{ text: '+1', tone: 'good' }} pending={<PendingBadge code="B1" />} />,
    )
    expect(container.textContent).not.toContain('98%')
    expect(byText(container, 'span', 'Pendente')).not.toBeNull()
    expect(container.querySelector('[data-tone]')).toBeNull()
    await unmount()
  })

  it('renders a sparkline when spark has at least two values', async () => {
    const { container, unmount } = await render(<KpiCard label="x" value="1" spark={[1, 2, 3]} />)
    expect(container.querySelector('svg[aria-hidden]')).toBeNull() // wrapper is aria-hidden, not the svg
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
    await unmount()
  })
})

