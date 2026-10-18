import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalEditorialCalendarPage } from './PortalEditorialCalendarPage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const marketingContext = vi.hoisted(() => ({ value: {} as Record<string, unknown>, reload: vi.fn() }))

vi.mock('@/hooks/usePortalMarketingContext', () => ({
  usePortalMarketingContext: () => marketingContext.value,
}))

/** Datas locais: o teste não depende do fuso do computador. */
const at = (day: number, hour = 10, month = 9) => new Date(2026, month, day, hour, 0).toISOString()

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  title: 'Post de lançamento',
  channel: 'linkedin',
  status: 'scheduled',
  startsAt: at(20),
  metadata: {},
  createdAt: at(1),
  updatedAt: at(1),
  ...overrides,
})

const baseContext = () => ({
  loading: false,
  error: null,
  calendarItems: [] as unknown[],
  reload: marketingContext.reload,
})

let root: Root
let container: HTMLDivElement

const render = () => {
  act(() => root.render(
    <MemoryRouter>
      <PortalEditorialCalendarPage />
    </MemoryRouter>,
  ))
}

const buttonByText = (text: string) => (
  Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === text)
)
const cell = (key: string) => container.querySelector(`[data-day="${key}"]`) as HTMLElement | null
const select = (label: string) => container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement
const choose = (element: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  act(() => {
    setter.call(element, value)
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const mockViewport = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 17, 12, 0))
  marketingContext.value = baseContext()
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  // @ts-expect-error remove the mock so the default (desktop) applies again
  delete window.matchMedia
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PortalEditorialCalendarPage', () => {
  it('sem itens mostra estado vazio honesto que aponta para o Marketing Studio', () => {
    render()

    expect(container.textContent).toContain('Calendário editorial')
    expect(container.textContent).toContain('Nenhuma publicação no calendário ainda')
    expect(container.querySelector('[data-testid="month-grid"]')).toBeNull()
    expect(container.querySelector('a[href="/portal/marketing/studio"]')).not.toBeNull()
  })

  it('mostra o carregamento e o erro com "Tentar novamente"', () => {
    marketingContext.value = { ...baseContext(), loading: true }
    render()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()

    marketingContext.value = { ...baseContext(), error: 'Falha de rede' }
    render()
    expect(container.textContent).toContain('Falha de rede')
    act(() => buttonByText('Tentar novamente')!.click())
    expect(marketingContext.reload).toHaveBeenCalledTimes(1)
  })

  it('a grade do mês coloca cada item no dia de startsAt, com canal e status', () => {
    marketingContext.value = {
      ...baseContext(),
      calendarItems: [
        item(),
        item({ id: 'item-2', title: 'Newsletter da semana', channel: 'newsletter', status: 'planned', startsAt: at(22, 8) }),
      ],
    }
    render()

    expect(container.querySelector('[data-testid="month-grid"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="calendar-range"]')!.textContent).toBe('outubro de 2026')
    // 1/out/2026 é quinta; a grade começa no domingo 27/set e termina no sábado 31/out.
    expect(container.querySelectorAll('[data-testid="month-grid"] li[data-day]').length).toBe(35)
    expect(cell('2026-09-27')).not.toBeNull()

    const day20 = cell('2026-10-20')!
    expect(day20.textContent).toContain('Post de lançamento')
    expect(day20.textContent).toContain('LinkedIn')
    expect(day20.textContent).toContain('Agendado')
    expect(day20.textContent).not.toContain('Newsletter da semana')

    const day22 = cell('2026-10-22')!
    expect(day22.textContent).toContain('Newsletter da semana')
    expect(day22.textContent).toContain('Newsletter')
    expect(day22.textContent).toContain('Planejado')
    expect(cell('2026-10-21')!.querySelectorAll('[data-testid="calendar-entry"]').length).toBe(0)
  })

  it('navega para o mês anterior, o próximo e volta para hoje', () => {
    marketingContext.value = {
      ...baseContext(),
      calendarItems: [item({ id: 'nov', title: 'Post de novembro', startsAt: at(5, 10, 10) })],
    }
    render()
    const range = () => container.querySelector('[data-testid="calendar-range"]')!.textContent

    expect(container.textContent).not.toContain('Post de novembro')
    act(() => (container.querySelector('button[aria-label="Próximo período"]') as HTMLButtonElement).click())
    expect(range()).toBe('novembro de 2026')
    expect(cell('2026-11-05')!.textContent).toContain('Post de novembro')

    act(() => (container.querySelector('button[aria-label="Período anterior"]') as HTMLButtonElement).click())
    act(() => (container.querySelector('button[aria-label="Período anterior"]') as HTMLButtonElement).click())
    expect(range()).toBe('setembro de 2026')

    act(() => buttonByText('Hoje')!.click())
    expect(range()).toBe('outubro de 2026')
  })

  it('a visão de semana mostra só os sete dias da semana navegada', () => {
    marketingContext.value = {
      ...baseContext(),
      calendarItems: [
        item(),
        item({ id: 'later', title: 'Post de fim de mês', startsAt: at(29) }),
      ],
    }
    render()

    act(() => buttonByText('Semana')!.click())
    expect(container.querySelector('[data-testid="week-grid"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="month-grid"]')).toBeNull()
    // Hoje é sábado 17/out: a semana vai de 11/out a 17/out.
    expect(container.querySelectorAll('[data-testid="week-grid"] li[data-day]').length).toBe(7)
    expect(container.querySelector('[data-testid="calendar-range"]')!.textContent).toBe('11 a 17 de out de 2026')
    expect(container.textContent).not.toContain('Post de lançamento')

    act(() => (container.querySelector('button[aria-label="Próximo período"]') as HTMLButtonElement).click())
    expect(cell('2026-10-20')!.textContent).toContain('Post de lançamento')
    expect(container.textContent).not.toContain('Post de fim de mês')
  })

  it('filtra por canal e por status com opções vindas dos dados e limpa os filtros', () => {
    marketingContext.value = {
      ...baseContext(),
      calendarItems: [
        item(),
        item({ id: 'item-2', title: 'Newsletter da semana', channel: 'newsletter', status: 'planned', startsAt: at(22) }),
      ],
    }
    render()

    expect(Array.from(select('Canal').options).map(option => option.textContent)).toEqual(['Todos os canais', 'LinkedIn', 'Newsletter'])
    expect(Array.from(select('Status').options).map(option => option.textContent)).toEqual(['Todos os status', 'Agendado', 'Planejado'])
    expect(buttonByText('Limpar filtros')).toBeUndefined()

    choose(select('Canal'), 'newsletter')
    expect(container.textContent).toContain('Newsletter da semana')
    expect(container.textContent).not.toContain('Post de lançamento')

    choose(select('Status'), 'scheduled')
    expect(container.textContent).toContain('Nenhum item com esses filtros')

    act(() => buttonByText('Limpar filtros')!.click())
    expect(container.textContent).toContain('Post de lançamento')
    expect(container.textContent).toContain('Newsletter da semana')
  })

  it('mostra "+N itens" quando o dia tem mais itens do que cabem e leva à semana', () => {
    marketingContext.value = {
      ...baseContext(),
      calendarItems: [
        item({ id: 'a', title: 'Item A', startsAt: at(20, 8) }),
        item({ id: 'b', title: 'Item B', startsAt: at(20, 9) }),
        item({ id: 'c', title: 'Item C', startsAt: at(20, 10) }),
      ],
    }
    render()

    expect(cell('2026-10-20')!.textContent).not.toContain('Item C')
    act(() => buttonByText('+1 item')!.click())
    expect(container.querySelector('[data-testid="week-grid"]')).not.toBeNull()
    expect(cell('2026-10-20')!.textContent).toContain('Item C')
  })

  it('no celular mostra a agenda em lista, agrupada por dia, em vez da grade', () => {
    mockViewport(false)
    marketingContext.value = {
      ...baseContext(),
      calendarItems: [
        item({ id: 'b', title: 'Segundo post', startsAt: at(22) }),
        item({ id: 'a', title: 'Primeiro post', startsAt: at(20) }),
      ],
    }
    render()

    expect(container.querySelector('[data-testid="month-grid"]')).toBeNull()
    const agenda = container.querySelector('[data-testid="agenda-list"]')!
    expect(agenda).not.toBeNull()
    const days = Array.from(agenda.querySelectorAll('li[data-day]')).map(node => node.getAttribute('data-day'))
    expect(days).toEqual(['2026-10-20', '2026-10-22'])
    expect(agenda.textContent!.indexOf('Primeiro post')).toBeLessThan(agenda.textContent!.indexOf('Segundo post'))
  })

  it('a agenda do celular avisa quando o período não tem itens', () => {
    mockViewport(false)
    marketingContext.value = {
      ...baseContext(),
      calendarItems: [item({ startsAt: at(5, 10, 10) })],
    }
    render()

    expect(container.textContent).toContain('Nada programado neste mês')
  })
})
