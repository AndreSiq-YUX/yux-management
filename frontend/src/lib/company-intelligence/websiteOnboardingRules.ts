import type { WebsiteOnboardingResult } from '@/types/companyIntelligence'

export function hasValue(value: unknown) {
  return value !== null
    && value !== undefined
    && value !== ''
    && (!Array.isArray(value) || value.length > 0)
    && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).length > 0)
}

export function shouldSelectByDefault(item: WebsiteOnboardingResult['suggestions'][number]) {
  return !hasValue(item.currentValue) && item.confidence >= 0.75
}
