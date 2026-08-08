import { describe, expect, it } from 'vitest'
import { selectSuggestionsForApplication } from '../src/modules/company-intelligence/repository.js'

describe('company intelligence suggestion application', () => {
  it('recovers selected suggestions left in a non-suggested status by a partial attempt', () => {
    const suggestions = [
      { id: 'a', status: 'applied', suggestedValue: 'original' },
      { id: 'b', status: 'rejected', suggestedValue: 'descartada anteriormente' },
      { id: 'c', status: 'suggested', suggestedValue: 'não selecionada' },
    ]

    expect(selectSuggestionsForApplication(
      suggestions,
      ['a', 'b'],
      new Map([['a', 'valor revisado']]),
    )).toEqual([
      { id: 'a', status: 'applied', suggestedValue: 'valor revisado' },
      { id: 'b', status: 'rejected', suggestedValue: 'descartada anteriormente' },
    ])
  })
})
