import type pg from 'pg'

export function recordProviderUsage(pool: Pick<pg.Pool, 'query'>, input: {
  organizationId?: string
  providerKey: string
  model?: string
  correlationId: string
  reportedUsage?: Record<string, unknown>
  costBrl?: string
  measurementStatus: 'measured'|'estimated'|'unavailable'
  measurementReason?: string
}) {
  return pool.query(
    `INSERT INTO public.provider_usage_events (
       organization_id,provider_key,model,correlation_id,reported_usage,cost_brl,measurement_status,measurement_reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [input.organizationId??null,input.providerKey,input.model??null,input.correlationId,input.reportedUsage??{},
      input.costBrl??null,input.measurementStatus,input.measurementReason??null],
  )
}
