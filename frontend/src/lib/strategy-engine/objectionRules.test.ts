import { describe, expect, it } from 'vitest'
import {
  classifyObjection,
  mapObjectionToPlaybookAction,
  sanitizeClientSafePlaybook,
  shouldCreateOfferImprovementSuggestion,
  shouldNotifyMarketingStrategist,
} from './objectionRules'

describe('objection intelligence rules', () => {
  it('maps price objection to offer, copy and script actions', () => {
    const category = classifyObjection('Achei caro e estou sem orçamento agora.')
    const action = mapObjectionToPlaybookAction(category)

    expect(category).toBe('price')
    expect(action.actions).toEqual(expect.arrayContaining(['offer', 'copy', 'sales_script']))
  })

  it('maps no response to follow-up and recovery sequence', () => {
    const action = mapObjectionToPlaybookAction(classifyObjection('Lead sumiu e nao respondeu.'))

    expect(action.category).toBe('no_response')
    expect(action.actions).toEqual(expect.arrayContaining(['follow_up_sequence', 'revenue_recovery']))
  })

  it('maps competitor objection to comparison and proof action', () => {
    const action = mapObjectionToPlaybookAction(classifyObjection('Ja tenho fornecedor atual e outra empresa me atende.'))

    expect(action.category).toBe('competitor')
    expect(action.actions).toEqual(expect.arrayContaining(['ethical_comparison', 'proof_points']))
  })

  it('creates offer improvement suggestion for repeated objections', () => {
    expect(shouldCreateOfferImprovementSuggestion({ categoryKey: 'price', repeatedCount: 3 })).toBe(true)
  })

  it('notifies marketing strategist for conversion-sensitive objections', () => {
    expect(shouldNotifyMarketingStrategist({ categoryKey: 'trust' })).toBe(true)
  })

  it('client-safe playbook excludes internal-only source details', () => {
    const sanitized = sanitizeClientSafePlaybook({
      visibility: 'internal_only',
      title: 'Quebra de objeção',
      sourceDetails: 'Trecho interno protegido',
    })

    expect(sanitized.visibility).toBe('client_safe')
    expect(sanitized).not.toHaveProperty('sourceDetails')
  })
})
