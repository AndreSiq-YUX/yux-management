type Attempt = { stage?: unknown; status?: unknown; costUsd?: unknown; tokens?: Record<string, unknown> }

export function providerAttempts(value: unknown): Attempt[] {
  return Array.isArray(value) ? value.map(attempt => attempt && typeof attempt === 'object' ? attempt : {}) : []
}

export function summarizeProviderAttempts(attempts: Attempt[]) {
  const costs = attempts.flatMap(attempt => attempt.status === 'received' && typeof attempt.costUsd === 'number'
    && Number.isFinite(attempt.costUsd) && attempt.costUsd >= 0 ? [attempt.costUsd] : [])
  const knownSubtotalUsd = costs.length ? costs.reduce((total, cost) => total + cost, 0) : null
  function observedTokens(key: 'input' | 'output' | 'reasoning') {
    const values = attempts.flatMap(attempt => {
      const value = attempt.tokens?.[key]
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? [value] : []
    })
    return values.length ? values.reduce((total, value) => total + value, 0) : null
  }
  return {
    attempts: attempts.length || null, knownSubtotalUsd,
    totalUsd: costs.length === attempts.length ? knownSubtotalUsd : null,
    inputTokens: observedTokens('input'), outputTokens: observedTokens('output'), reasoningTokens: observedTokens('reasoning'),
  }
}

export type CreditHoldUsage = {
  credit_state: 'held' | 'executing' | 'released' | 'settled' | 'uncertain' | null
  reserved: number | null
  charged: number | null
  unlimited: boolean | null
  unbilled: boolean
}

export function summarizeCreditHold(row: CreditHoldUsage) {
  return {
    state: row.credit_state ?? (row.unbilled ? 'unbilled' as const : 'unmeasured' as const),
    unlimited: row.unlimited, reserved: row.unlimited ? null : row.reserved, charged: row.charged,
    released: !row.unlimited && row.reserved !== null && row.charged !== null ? row.reserved - row.charged : null,
  }
}
