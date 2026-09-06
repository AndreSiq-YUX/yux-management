import { describe, expect, it } from 'vitest'
import { strategyCurationItemSchema, strategyItemHash } from '../src/modules/strategy-engine/curation.js'

describe('strategy curation identity', () => {
  it('mantém o hash quando o JSONB reorganiza as chaves', () => {
    const item = strategyCurationItemSchema.parse({
      kind: 'concept_card', title: 'Diagnóstico', principle: 'Qualifique o problema.', problem: 'Pitch prematuro',
      diagnosticQuestions: [], applicability: ['Venda consultiva'], contraindications: [], decisionRules: [],
      recommendedActions: [], successCriteria: [], confidence: 0.9, conflicts: [],
      evidence: [{ documentId: '10000000-0000-4000-8000-000000000001', documentHash: 'a'.repeat(64), locator: 'section:1', excerpt: 'Qualifique o problema.', claimType: 'literal' }],
    })
    const reordered = {
      evidence: [{ claimType: 'literal', excerpt: 'Qualifique o problema.', locator: 'section:1', documentHash: 'a'.repeat(64), documentId: '10000000-0000-4000-8000-000000000001' }],
      conflicts: [], confidence: 0.9, successCriteria: [], recommendedActions: [], decisionRules: [], contraindications: [],
      applicability: ['Venda consultiva'], diagnosticQuestions: [], problem: 'Pitch prematuro', principle: 'Qualifique o problema.',
      title: 'Diagnóstico', kind: 'concept_card',
    } as typeof item
    expect(strategyItemHash(reordered)).toBe(strategyItemHash(item))
  })
})
