import { expect, it } from 'vitest'
import { normalizeCompanyStrategyContext } from '../src/modules/company-strategy/context.js'

it('exposes a compact context and a typed source without copying the full source into the provider payload', () => {
  const raw = { index: [], selected: [{ strategyId: 'strategy-1', revisionId: 'revision-1', revisionNumber: 2, title: 'Expansão', sections: [], sourceContent: '{"title":"Expansão","summary":"Conteúdo completo da origem"}' }], coverage: { total: 1, incomplete: false }, contextHash: 'a'.repeat(64) }
  const result = normalizeCompanyStrategyContext(raw, 'client_user')
  expect(result.context.selected[0]).not.toHaveProperty('sourceContent')
  expect(result.sources[0]).toMatchObject({ ref: 'customer:strategy:revision-1', kind: 'company_strategy', id: 'revision-1', version: '2', visibility: 'internal' })
  expect(JSON.stringify(result.context)).not.toContain('Conteúdo completo da origem')
  expect(result.sources[0].publicationId).toBeUndefined()
})
