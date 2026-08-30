import { attributeMissionValue, hashAttributionPolicy, type AttributionEvent } from './attribution.js'
import { CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY } from '../packs/campaign-launch-v1.js'
import type { PackEvaluationInput, PackMetricCollector, PackMetricSnapshot } from './collector.js'
import type { ActionMission, MetricValue } from '../types.js'

type CampaignMetricRow = {
  id: string
  lifecycle_status: string
  spent: string
  impressions: number | string
  clicks: number | string
  leads: number | string
  total_budget: string | null
  daily_budget: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  snapshot_id: string | null
  snapshot_at: string | Date | null
  snapshot_spend: string | null
  snapshot_impressions: number | string | null
  snapshot_clicks: number | string | null
  snapshot_leads: number | string | null
  raw_metrics: Record<string, unknown> | null
}

type ObservationRow = {
  id: string
  observation_type: string
  source_event_id: string | null
  payload: Record<string, unknown>
  observed_at: string | Date
}

export type CampaignLaunchMetricSource = {
  campaign: CampaignMetricRow | null
  observations: ObservationRow[]
  executionCostBrl: string
  killSwitchActive: boolean
  mission: Pick<ActionMission, 'status' | 'parameters' | 'createdAt' | 'deadlineAt'>
  measuredAt: string
}

export const campaignLaunchMetricCollector: PackMetricCollector = {
  packKey: 'campaign_launch',
  async collect(client, mission) {
    const [campaignResult, observationsResult, costsResult, policyResult] = await Promise.all([
      client.query<CampaignMetricRow>(
        `SELECT campaign.id,campaign.lifecycle_status,campaign.spent::TEXT,campaign.impressions,campaign.clicks,campaign.leads,
                campaign.total_budget::TEXT,campaign.daily_budget::TEXT,campaign.utm_source,campaign.utm_medium,campaign.utm_campaign,
                snapshot.id AS snapshot_id,snapshot.snapshot_at,snapshot.spend::TEXT AS snapshot_spend,
                snapshot.impressions AS snapshot_impressions,snapshot.clicks AS snapshot_clicks,
                snapshot.leads AS snapshot_leads,snapshot.raw_metrics
         FROM public.campaigns campaign
         LEFT JOIN LATERAL (
           SELECT metric.id,metric.snapshot_at,metric.spend,metric.impressions,metric.clicks,metric.leads,metric.raw_metrics
           FROM public.campaign_metric_snapshots metric WHERE metric.campaign_id=campaign.id
           ORDER BY metric.snapshot_at DESC,metric.id DESC LIMIT 1
         ) snapshot ON TRUE
         WHERE campaign.organization_id=$1 AND campaign.mission_id=$2
         ORDER BY campaign.updated_at DESC LIMIT 1`,
        [mission.organizationId, mission.id],
      ),
      client.query<ObservationRow>(
        `SELECT id,observation_type,source_event_id,payload,observed_at
         FROM public.action_observations WHERE organization_id=$1 AND mission_id=$2
         ORDER BY observed_at,id`, [mission.organizationId, mission.id],
      ),
      client.query<{ amount: string | null }>(
        `SELECT SUM(amount_brl)::TEXT AS amount FROM public.action_cost_entries
         WHERE organization_id=$1 AND mission_id=$2 AND nature IN ('actual','reversal') AND category <> 'media'`,
        [mission.organizationId, mission.id],
      ),
      client.query<{ active: boolean }>(
        `SELECT COALESCE(BOOL_OR(kill_switch OR NOT enabled),FALSE) AS active
         FROM public.action_capability_policies
         WHERE organization_id=$1 AND capability_key IN ('campaign.provider.create_paused','campaign.provider.activate')`,
        [mission.organizationId],
      ),
    ])
    return deriveCampaignLaunchMetricSnapshot({
      campaign: campaignResult.rows[0] ?? null,
      observations: observationsResult.rows,
      executionCostBrl: costsResult.rows[0]?.amount ?? '0',
      killSwitchActive: policyResult.rows[0]?.active ?? false,
      mission,
      measuredAt: new Date().toISOString(),
    })
  },
  evaluate: evaluateCampaignLaunchMetrics,
}

export function deriveCampaignLaunchMetricSnapshot(input: CampaignLaunchMetricSource): PackMetricSnapshot {
  const campaign = input.campaign
  if (!campaign) return missingCampaignSnapshot(input)
  const spend = decimal(campaign.snapshot_spend ?? campaign.spent)
  const impressions = integer(campaign.snapshot_impressions ?? campaign.impressions)
  const clicks = integer(campaign.snapshot_clicks ?? campaign.clicks)
  const leads = integer(campaign.snapshot_leads ?? campaign.leads)
  const trackingKnown = Boolean(campaign.utm_source?.trim() && campaign.utm_medium?.trim() && campaign.utm_campaign?.trim())
  const observationTypes = input.observations.map(row => row.observation_type)
  const qualifiedLeadIds = new Set(input.observations
    .filter(row => ['qualified_lead','lead_qualified'].includes(eventType(row)))
    .map(row => stringValue(row.payload.leadId) ?? stringValue(row.payload.bindingId) ?? row.id))
  const complaints = observationTypes.filter(type => type === 'complaint').length
  const consentBlocks = observationTypes.filter(type => ['consent_block','suppression_block'].includes(type)).length
  const trackingFailures = observationTypes.filter(type => type === 'tracking_failure').length
  const attributionEvents = input.observations
    .filter(row => CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY.eligibleEventTypes.includes(eventType(row)) || eventType(row) === 'invoice_paid')
    .map(toAttributionEvent)
  const unresolvedIdentity = attributionEvents.some(event => !event.bindingId && !event.leadId)
  const attribution = !trackingKnown
    ? unknownAttribution('campaign_tracking_unresolved')
    : unresolvedIdentity
      ? unknownAttribution('attribution_identity_unresolved')
      : attributeMissionValue({
        policy: CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY,
        missionStartedAt: input.mission.createdAt,
        evaluatedAt: input.measuredAt,
        touches: attributionEvents.filter(event => event.eventType !== 'invoice_paid'),
        revenueEvents: attributionEvents.filter(event => event.eventType === 'invoice_paid'),
      })
  const executionCost = decimal(input.executionCostBrl)
  const totalCost = spend + executionCost
  const totalBudget = decimal(campaign.total_budget ?? String(input.mission.parameters.totalBudgetBrl ?? '0'))
  const dailyBudget = decimal(campaign.daily_budget)
  const dailySpend = decimalOrNull(campaign.raw_metrics?.dailySpendBrl)
  const complaintRate = ratioMetric(complaints, leads, 'ratio')
  const totalBudgetBreached = totalBudget > 0 && spend > totalBudget
  const dailyBudgetBreached = dailySpend !== null && dailyBudget > 0 && dailySpend > dailyBudget
  const complaintBreached = complaintRate.kind === 'known' && Number(complaintRate.value) > 0.02
  const criticalReasons = [
    ...(totalBudgetBreached ? ['campaign_total_budget_breached'] : []),
    ...(dailyBudgetBreached ? ['campaign_daily_budget_breached'] : []),
    ...(trackingFailures > 0 ? ['campaign_tracking_failed'] : []),
    ...(complaintBreached ? ['campaign_complaint_rate_breached'] : []),
    ...(campaign.lifecycle_status === 'failed' ? ['campaign_provider_failed'] : []),
  ]
  const cpl = leads === 0 ? notApplicable('zero_denominator', 'BRL') : known(totalCost / leads, 'BRL')
  const mroi = attribution.metric.kind !== 'known'
    ? unknown(attribution.metric.reason, 'ratio')
    : totalCost === 0
      ? notApplicable('zero_denominator', 'ratio')
      : known((decimal(attribution.metric.value) - totalCost) / totalCost, 'ratio')
  const maximumCpl = decimal(String(input.mission.parameters.maximumCplBrl ?? '0'))
  const minimumSampleReached = leads >= 5 || clicks >= 100
  const offTrack = minimumSampleReached && cpl.kind === 'known' && maximumCpl > 0 && Number(cpl.value) > maximumCpl
  const sourceRecordId = campaign.snapshot_id ?? campaign.id
  const metricEvidence = { sourceType: campaign.snapshot_id ? 'campaign_metric_snapshot' : 'campaign_current_state', sourceRecordId }
  const metrics: Record<string, MetricValue> = {
    leads: known(leads, 'count'),
    qualified_leads: known(qualifiedLeadIds.size, 'count'),
    attributed_revenue_brl: attribution.metric,
    impressions: known(impressions, 'count'),
    clicks: known(clicks, 'count'),
    ctr: ratioMetric(clicks, impressions, 'ratio'),
    landing_conversion_rate: ratioMetric(leads, clicks, 'ratio'),
    spend_brl: known(spend, 'BRL'),
    total_execution_cost_brl: known(totalCost, 'BRL'),
    cpl_brl: cpl,
    mroi,
    consent_blocks: known(consentBlocks, 'count'),
    tracking_failure: trackingFailures > 0 ? known(trackingFailures, 'count') : known(0, 'count'),
    complaint_rate: complaintRate,
    total_budget_brl: known(totalBudget, 'BRL'),
    daily_budget_brl: known(dailyBudget, 'BRL'),
  }
  return {
    packKey: 'campaign_launch', measuredAt: input.measuredAt, metrics,
    evidence: {
      ...Object.fromEntries(Object.keys(metrics).map(key => [key, metricEvidence])),
      attributed_revenue_brl: {
        ...metricEvidence,
        attribution: {
          status: 'versioned',
          policyVersion: CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY.version,
          policyHash: hashAttributionPolicy(CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY),
          eventIds: attribution.eventIds,
        },
      },
    },
    signals: {
      criticalGuardrailBreached: criticalReasons.length > 0,
      killSwitchActive: input.killSwitchActive,
      minimumSampleReached,
      offTrack,
      requiredMetricUnknownIsBlocking: !trackingKnown,
      providerPaused: campaign.lifecycle_status === 'paused',
      reasons: criticalReasons,
    },
  }
}

export function evaluateCampaignLaunchMetrics(input: PackEvaluationInput) {
  const { snapshot, mission } = input
  if (snapshot.signals.criticalGuardrailBreached) {
    return { conclusion: 'pause' as const, reasons: snapshot.signals.reasons.length ? snapshot.signals.reasons : ['critical_guardrail_breached'] }
  }
  if (snapshot.signals.killSwitchActive) return { conclusion: 'pause' as const, reasons: ['kill_switch_active'] }
  if (snapshot.signals.providerPaused && mission.status === 'active') return { conclusion: 'pause' as const, reasons: ['campaign_provider_paused'] }
  const leads = snapshot.metrics.leads
  const targetLeads = Number(mission.parameters.targetLeads ?? 0)
  if (leads?.kind === 'known' && targetLeads > 0 && Number(leads.value) >= targetLeads) {
    return { conclusion: 'succeed' as const, reasons: ['campaign_target_leads_met'] }
  }
  if (mission.deadlineAt && Date.parse(input.now) > Date.parse(mission.deadlineAt)) {
    return { conclusion: 'expire' as const, reasons: ['deadline_passed'] }
  }
  if (snapshot.signals.requiredMetricUnknownIsBlocking) return { conclusion: 'block' as const, reasons: ['campaign_tracking_unknown'] }
  if (snapshot.signals.minimumSampleReached && snapshot.signals.offTrack) {
    return { conclusion: 'propose_replan' as const, reasons: ['campaign_cpl_off_track'] }
  }
  return { conclusion: 'continue' as const, reasons: ['campaign_trajectory_acceptable'] }
}

function missingCampaignSnapshot(input: CampaignLaunchMetricSource): PackMetricSnapshot {
  const value = unknown('campaign_snapshot_unavailable', 'count')
  return {
    packKey: 'campaign_launch', measuredAt: input.measuredAt,
    metrics: { leads: value, qualified_leads: value, attributed_revenue_brl: unknown('campaign_snapshot_unavailable', 'BRL') },
    evidence: {},
    signals: { criticalGuardrailBreached: false, killSwitchActive: input.killSwitchActive, minimumSampleReached: false, offTrack: false, requiredMetricUnknownIsBlocking: true, reasons: ['campaign_snapshot_unavailable'] },
  }
}

function toAttributionEvent(row: ObservationRow): AttributionEvent {
  return {
    id: row.source_event_id ?? row.id,
    eventType: eventType(row),
    occurredAt: dateString(row.payload.occurredAt) ?? dateString(row.observed_at)!,
    observedAt: dateString(row.observed_at)!,
    ...(stringValue(row.payload.leadId) ? { leadId: stringValue(row.payload.leadId)! } : {}),
    ...(stringValue(row.payload.bindingId) ? { bindingId: stringValue(row.payload.bindingId)! } : {}),
    ...(stringValue(row.payload.amountBrl ?? row.payload.amount) ? { amount: stringValue(row.payload.amountBrl ?? row.payload.amount)! } : {}),
    ...(stringValue(row.payload.currency) ? { currency: stringValue(row.payload.currency)! } : {}),
  }
}

function unknownAttribution(reason: string) {
  return {
    metric: unknown(reason, 'BRL'),
    policyHash: hashAttributionPolicy(CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY),
    policyVersion: CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY.version,
    eventIds: [] as string[], credits: [],
  }
}

function eventType(row: ObservationRow): string { return stringValue(row.payload.eventType) ?? row.observation_type }
function stringValue(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function dateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}
function integer(value: number | string | null): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0 }
function decimal(value: string): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function decimalOrNull(value: unknown): number | null { const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null }
function known(value: number, unit: string): MetricValue { return { kind: 'known', value: normalized(value), unit } }
function unknown(reason: string, unit: string): MetricValue { return { kind: 'unknown', reason, unit } }
function notApplicable(reason: string, unit: string): MetricValue { return { kind: 'not_applicable', reason, unit } }
function ratioMetric(numerator: number, denominator: number, unit: string): MetricValue { return denominator === 0 ? notApplicable('zero_denominator', unit) : known(numerator / denominator, unit) }
function normalized(value: number): `${number}` { return String(Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000) as `${number}` }
