export type ActionEngineNfrSnapshot = {
  planningLatencyMs: { count: number; p50: number; p95: number; p99: number; targetP95: number; withinSlo: boolean }
  executionLatencyMs: { count: number; p50: number; p95: number; p99: number; targetP95: number; withinSlo: boolean }
  executorAvailability: number
  executorAvailabilityTarget: number
  executorAvailableWithinSlo: boolean
}

export function buildActionEngineNfrSnapshot(input: {
  planningLatencyMs: number[]
  executionLatencyMs: number[]
  executorAvailable: boolean[]
}): ActionEngineNfrSnapshot {
  const planning = histogram(input.planningLatencyMs, 60_000)
  const execution = histogram(input.executionLatencyMs, 30_000)
  const availability = input.executorAvailable.length === 0
    ? 0
    : input.executorAvailable.filter(Boolean).length / input.executorAvailable.length
  return {
    planningLatencyMs: planning,
    executionLatencyMs: execution,
    executorAvailability: availability,
    executorAvailabilityTarget: 0.995,
    executorAvailableWithinSlo: availability >= 0.995,
  }
}

function histogram(values: number[], targetP95: number) {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  const percentile = (value: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)]! : 0
  const p95 = percentile(0.95)
  return { count: sorted.length, p50: percentile(0.5), p95, p99: percentile(0.99), targetP95, withinSlo: sorted.length > 0 && p95 <= targetP95 }
}
