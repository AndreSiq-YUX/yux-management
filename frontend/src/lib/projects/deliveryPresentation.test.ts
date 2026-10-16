import { describe, expect, it } from 'vitest'
import {
  formatDeliveryDate,
  isDeliveryOverdue,
  safeDeliveryUrl,
} from './deliveryPresentation'

describe('delivery presentation', () => {
  it('treats the whole deadline day as on time and ignores completed deliveries', () => {
    expect(
      isDeliveryOverdue('2026-10-15', 'draft', new Date('2026-10-15T23:00:00'))
    ).toBe(false)
    expect(
      isDeliveryOverdue('2026-10-15', 'draft', new Date('2026-10-16T00:00:00'))
    ).toBe(true)
    expect(
      isDeliveryOverdue('2026-10-15', 'approved', new Date('2026-10-16'))
    ).toBe(false)
    expect(isDeliveryOverdue(undefined, 'draft')).toBe(false)
    expect(formatDeliveryDate('2026-10-15')).toBe('15/10/2026')
  })
  it('only displays web URLs for delivered artifacts', () => {
    expect(safeDeliveryUrl('https://example.com/arquivo')).toBe(
      'https://example.com/arquivo'
    )
    expect(safeDeliveryUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeDeliveryUrl('file:///arquivo')).toBeUndefined()
    expect(safeDeliveryUrl('link inválido')).toBeUndefined()
  })
})
