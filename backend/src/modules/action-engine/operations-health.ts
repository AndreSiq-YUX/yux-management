export type ActionEngineNfrSnapshot = {
  planningLatencyMs: { count: number; p50: number; p95: number; p99: number; targetP95: number; withinSlo: boolean }
  executionLatencyMs: { count: number; p50: number; p95: number; p99: number; targetP95: number; withinSlo: boolean }
  executorAvailability: number
  executorAvailabilityTarget: number
  executorAvailableWithinSlo: boolean
}

export type MissionConversationHealthRow = {
  status: string
  createdAt: string | Date
  updatedAt: string | Date
  firstAgentAt?: string | Date | null
  confirmedAt?: string | Date | null
  firstPlanAt?: string | Date | null
  userTurns: number
  agentTurns: number
  questionCount: number
  totalTokens: number
  processingFailures: number
  missionId?: string | null
  missionCostBrl?: string | number | null
  readinessStatus?: string | null
}

export function buildMissionConversationHealthSnapshot(rows: MissionConversationHealthRow[]) {
  const firstAgentLatency = rows.flatMap(row => row.firstAgentAt ? [elapsed(row.createdAt, row.firstAgentAt)] : [])
  const planningLatency = rows.flatMap(row => row.confirmedAt && row.firstPlanAt ? [elapsed(row.confirmedAt, row.firstPlanAt)] : [])
  const userTurns = rows.reduce((sum, row) => sum + Number(row.userTurns || 0), 0)
  const agentTurns = rows.reduce((sum, row) => sum + Number(row.agentTurns || 0), 0)
  const failures = rows.reduce((sum, row) => sum + Number(row.processingFailures || 0), 0)
  const converted = rows.filter(row => Boolean(row.missionId)).length
  const missionCosts = rows.flatMap(row => row.missionCostBrl == null ? [] : [Number(row.missionCostBrl)])
  return {
    total: rows.length,
    acceptedToFirstAgentMessageLatencyMs: histogram(firstAgentLatency, 20_000),
    planningAfterConfirmationLatencyMs: histogram(planningLatency, 60_000),
    turns: {
      accepted: userTurns, succeeded: agentTurns, failed: failures,
      successRate: userTurns ? agentTurns / userTurns : 0,
      failureRate: userTurns ? failures / userTurns : 0,
      retryRate: null as number | null,
      retryRateReason: 'retry_attempts_not_yet_persisted_separately',
    },
    readiness: countBy(rows.map(row => row.readinessStatus || 'unknown')),
    averageQuestionsBeforeConfirmation: average(rows.map(row => row.questionCount)),
    averageTurnsBeforeConfirmation: average(rows.map(row => row.userTurns)),
    conversion: { converted, rate: rows.length ? converted / rows.length : 0 },
    outcomes: countBy(rows.map(row => row.status)),
    usage: {
      totalTokens: rows.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0),
      averageTokensPerConversation: average(rows.map(row => row.totalTokens)),
      averageConversationCostBrl: null as number | null,
      conversationCostReason: 'runtime_turn_cost_not_persisted_in_brl',
      averageConvertedMissionCostBrl: average(missionCosts),
    },
  }
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

function elapsed(from: string | Date, to: string | Date) { return Math.max(0, new Date(to).getTime() - new Date(from).getTime()) }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0 }
function countBy(values: string[]) { return Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length])) }
