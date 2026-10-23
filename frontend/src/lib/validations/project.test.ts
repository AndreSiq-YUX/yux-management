import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectFormSchema, projectEditFormSchema, validateProjectBudget, validateProjectDates } from './project'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('project form validation boundaries', () => {
  it('accepts a planned project starting today in Brazil', () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00-03:00'))
    expect(projectFormSchema.safeParse({
      name: 'Projeto novo', description: 'Descrição do projeto novo', clientId: '20000000-0000-4000-8000-000000000001',
      startDate: '2026-10-23', expectedEndDate: '2026-10-24', status: 'PLANNING', priority: 'MEDIUM', type: 'WEBSITE', budget: 0, currency: 'BRL',
    }).success).toBe(true)
  })
  it('accepts ordinary cents without allowing a third decimal place', () => {
    for (const budget of [0, 0.07, 0.29, 1.1, 1234.56]) expect(validateProjectBudget(budget)).toBe(true)
    expect(validateProjectBudget(1.255)).toBe(false)
  })
  it('allows editing the original past start of a planned project', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00-03:00'))
    const data = { name: 'Projeto planejado', description: 'Editar o orçamento do projeto', clientId: '20000000-0000-4000-8000-000000000001', startDate: '2026-10-01', expectedEndDate: '2026-10-31', status: 'PLANNING', priority: 'MEDIUM', type: 'WEBSITE', budget: 0.29, currency: 'BRL' }
    expect(projectEditFormSchema.safeParse(data).success).toBe(true)
    expect(projectFormSchema.safeParse(data).success).toBe(false)
  })
  it('validates the expected end date and rejects reversed or impossible dates', () => {
    expect(validateProjectDates('2026-10-23', '2026-10-24')).toBe(true)
    expect(validateProjectDates('2026-10-24', '2026-10-23')).toBe(false)
    expect(validateProjectDates('2026-02-30', '2026-03-10')).toBe(false)
  })
})
