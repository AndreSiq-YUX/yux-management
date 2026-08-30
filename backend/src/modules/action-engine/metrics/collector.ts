import type { MissionEconomics } from '../economics.js'
import type { Queryable } from '../repository.js'
import type { ActionMission, MetricValue } from '../types.js'
import type { EvaluationConclusion } from '../evaluator.js'

export type MetricEvidence = {
  sourceType: string
  sourceRecordId?: string
  attribution?: {
    status: 'not_applicable' | 'legacy_unversioned' | 'versioned'
    policyVersion?: number
    policyHash?: string
    eventIds: string[]
  }
}

export type PackMetricSnapshot = {
  packKey: string
  measuredAt: string
  metrics: Record<string, MetricValue>
  evidence: Record<string, MetricEvidence>
  signals: {
    criticalGuardrailBreached: boolean
    killSwitchActive: boolean
    minimumSampleReached: boolean
    offTrack: boolean
    requiredMetricUnknownIsBlocking: boolean
    providerPaused?: boolean
    reasons: string[]
  }
}

export type PackEvaluationInput = {
  mission: ActionMission
  snapshot: PackMetricSnapshot
  economics: MissionEconomics
  now: string
}

export type PackEvaluation = { conclusion: EvaluationConclusion; reasons: string[] }

export type PackMetricCollector = {
  packKey: string
  collect(client: Queryable, mission: ActionMission): Promise<PackMetricSnapshot>
  evaluate(input: PackEvaluationInput): PackEvaluation
}

export class PackMetricCollectorRegistry {
  private readonly collectors = new Map<string, PackMetricCollector>()

  register(collector: PackMetricCollector): this {
    if (this.collectors.has(collector.packKey)) throw new Error('pack_metric_collector_duplicate')
    this.collectors.set(collector.packKey, collector)
    return this
  }

  get(packKey: string): PackMetricCollector {
    const collector = this.collectors.get(packKey)
    if (!collector) throw new Error('pack_metric_collector_not_registered')
    return collector
  }
}
