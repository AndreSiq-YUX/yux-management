import { describe, expect, it } from 'vitest'
import { hasValue, shouldSelectByDefault } from '@/lib/company-intelligence/websiteOnboardingRules'

const suggestion = {
  id: 'suggestion-1', suggestionKind: 'profile' as const, fieldPath: 'industry',
  suggestedValue: 'Tecnologia', evidenceExcerpt: 'empresa de tecnologia',
  sourceUrl: 'https://example.com', confidence: 0.8, selected: false,
  status: 'suggested' as const,
}

describe('WebsiteOnboardingCard rules', () => {
  it('preselects confident additions but never preselects an overwrite of an existing value', () => {
    expect(shouldSelectByDefault({ ...suggestion, currentValue: '' })).toBe(true)
    expect(shouldSelectByDefault({ ...suggestion, currentValue: 'Consultoria' })).toBe(false)
    expect(shouldSelectByDefault({ ...suggestion, currentValue: 'Consultoria', confidence: 0.92 })).toBe(false)
  })

  it('recognizes meaningful scalar, list and object values', () => {
    expect(hasValue([])).toBe(false)
    expect(hasValue({})).toBe(false)
    expect(hasValue(['Brasil'])).toBe(true)
  })
})
