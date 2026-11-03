import { describe, expect, it } from 'vitest'
import { evaluatePriority, priorityDefinitionSchema, type PriorityInput } from '../src/modules/crm/priority-model.js'

const definition = {
  fitWeight: 60,
  temperatureWeight: 40,
  minimumCoverage: 50,
  fitGroups: [
    { id: 'capacity', label: 'Capacidade', maxPoints: 40, alternatives: [
      { fieldKey: 'custom:capacity', bands: [
        { min: null, max: 1, points: 0 },
        { min: 1, max: null, points: 30 },
      ] },
      { fieldKey: 'custom:proxy', points: 20, estimated: true },
    ] },
    { id: 'reach', label: 'Alcance', maxPoints: 60, alternatives: [
      { fieldKey: 'custom:reach', points: 60 },
    ] },
  ],
  interestGroups: [{ id: 'intent', label: 'Intenção', maxPoints: 100, strategy: 'max', rules: [
    { kind: 'quote_requested', points: 80, validForDays: 10, buyerRelevant: true },
    { kind: 'buyer_reply', points: 40, buyerRelevant: true },
  ] }],
  inactivity: [{ afterDays: 5, points: 10 }, { afterDays: 8, points: 20 }],
  historyDays: 30,
  fitBands: [{ id: 'all', label: 'Potencial', min: 0 }],
  temperatureBands: [{ id: 'cold', label: 'Frio', min: 0 }, { id: 'hot', label: 'Quente', min: 70 }],
  queues: [{ id: 'work', label: 'Acompanhar' }, { id: 'now', label: 'Priorizar' }],
  matrix: [{ fitBandId: 'all', temperatureBandId: 'cold', queueId: 'work' }, { fitBandId: 'all', temperatureBandId: 'hot', queueId: 'now' }],
}
const input: PriorityInput = {
  leadId: 'lead', recordTypeId: null, fields: {}, signals: [],
  status: 'open', deleted: false, contactBlocked: false,
}
const now = new Date('2026-11-03T12:00:00Z')
function evaluate(fields: PriorityInput['fields'], overrides: Partial<PriorityInput> = {}) {
  return evaluatePriority({ id: 'draft', revision: 1, definition: priorityDefinitionSchema.parse(definition) }, { ...input, fields, ...overrides }, now)
}

describe('priority model', () => {
  it('first_known_zero_wins', () => {
    expect(evaluate({ 'custom:capacity': 0, 'custom:proxy': 10 })).toMatchObject({
      fitScore: 0, coveragePercent: 40,
      reasons: expect.arrayContaining([expect.objectContaining({ kind: 'criterion', fieldKey: 'custom:capacity', points: 0 })]),
    })
    expect(evaluate({ 'custom:capacity': null, 'custom:proxy': 10 }).fitScore).toBe(50)
  })
  it('coverage_gates_ranking', () => {
    expect(evaluate({ 'custom:capacity': 3 })).toMatchObject({
      fitScore: 75, coveragePercent: 40, state: 'needs_data', priorityScore: null,
    })
    expect(evaluate({}).fitScore).toBeNull()
  })
  it('explains an archived criterion when an estimated fallback is available', () => {
    const result = evaluate({ 'custom:proxy': 10 }, { archivedFieldKeys: new Set(['custom:capacity']) })
    expect(result.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'missing_data', fieldKeys: ['custom:capacity'], archivedFieldKeys: ['custom:capacity'] }),
      expect.objectContaining({ kind: 'criterion', fieldKey: 'custom:proxy', estimated: true }),
    ]))
  })
  it('warmth_is_independent', () => {
    expect(evaluate({ 'custom:proxy': 10, 'custom:reach': true })).toMatchObject({
      fitScore: 80, temperatureScore: 0, temperatureBandId: 'cold', priorityScore: 48, queueId: 'work',
    })
  })
  it('exclusion_wins', () => {
    expect(evaluate({ 'custom:reach': true }, { contactBlocked: true })).toMatchObject({
      state: 'excluded', queueId: null, priorityScore: null,
    })
  })
  it('scores one canonical signal and applies only the latest inactivity band', () => {
    const signals: PriorityInput['signals'] = [
      { id: 'reply', canonicalKey: 'buyer-1', kind: 'buyer_reply', channel: 'whatsapp', actor: 'buyer', occurredAt: '2026-10-26T12:00:00Z' },
      { id: 'quote', canonicalKey: 'buyer-1', kind: 'quote_requested', channel: 'crm', actor: 'buyer', occurredAt: '2026-10-26T12:00:00Z' },
      { id: 'future', canonicalKey: 'future', kind: 'quote_requested', channel: 'crm', actor: 'buyer', occurredAt: '2026-11-04T12:00:00Z' },
    ]
    const result = evaluate({}, { signals })
    expect(result.temperatureScore).toBe(60)
    expect(result.reasons.filter(r => r.kind === 'signal')).toHaveLength(1)
    expect(result.nextEvaluationAt).toBe('2026-11-05T12:00:00.000Z')
  })
  it('rejects missing or duplicate matrix combinations and overlapping bands', () => {
    expect(priorityDefinitionSchema.safeParse({ ...definition, matrix: [definition.matrix[0], definition.matrix[0]] }).success).toBe(false)
    expect(priorityDefinitionSchema.safeParse({ ...definition, fitWeight: 70 }).success).toBe(false)
    expect(priorityDefinitionSchema.safeParse({ ...definition, fitGroups: [{ ...definition.fitGroups[0], alternatives: [{ fieldKey: 'custom:capacity', bands: [{ min: 0, max: 10, points: 5 }, { min: 9, max: 20, points: 10 }] }] }] }).success).toBe(false)
  })
  it('requires purchase windows to use date bands and only scores the latest unexpired forecast', () => {
    const group = { id: 'purchase', label: 'Previsão', maxPoints: 100, strategy: 'sumCapped' }
    expect(priorityDefinitionSchema.safeParse({
      ...definition, interestGroups: [{ ...group, rules: [{ kind: 'purchase_window', points: 40 }] }],
    }).success).toBe(false)
    const version = {
      id: 'draft', revision: 1, definition: priorityDefinitionSchema.parse({
        ...definition, timeZone: 'America/Sao_Paulo',
        interestGroups: [{ ...group, rules: [{
          kind: 'purchase_window', purchaseBands: [{ min: 0, max: 2, points: 40 }],
        }] }],
      }),
    }
    const forecasts: PriorityInput['signals'] = [
      { id: 'old', canonicalKey: 'old', kind: 'purchase_window', channel: 'crm', actor: 'buyer', occurredAt: '2026-10-31T12:00:00Z', targetDate: '2026-11-03' },
      { id: 'new', canonicalKey: 'new', kind: 'purchase_window', channel: 'crm', actor: 'buyer', occurredAt: '2026-11-01T12:00:00Z', targetDate: '2026-11-04' },
    ]
    expect(evaluatePriority(version, { ...input, signals: forecasts }, now)).toMatchObject({
      temperatureScore: 40, nextEvaluationAt: '2026-11-05T03:00:00.000Z',
    })
    expect(evaluatePriority(version, { ...input, signals: forecasts }, new Date('2026-11-05T03:00:00.000Z'))).toMatchObject({
      temperatureScore: 0,
      reasons: expect.arrayContaining([expect.objectContaining({ kind: 'expired_signal', signalId: 'new' })]),
    })
  })
})
