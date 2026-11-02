import type pg from 'pg'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { assertB2bDeliveryRights } from './b2b-delivery.js'

type Rights = Array<{
  provider_key: string
  public_config: Record<string, unknown>
}>
export async function loadRadarCrmDeliveryRights(
  db: Pick<pg.Pool, 'query'>,
): Promise<Rights> {
  // Configuration is read only inside the server and never enters a customer DTO.
  return runWithDatabaseRequestContext(
    { role: 'yux_admin', organizationIds: [] },
    async () =>
      (
        await db.query(
          "SELECT provider_key,public_config FROM public.platform_provider_connections WHERE environment='production' AND is_default=TRUE AND provider_key IN ('cnpja','brave_place','serper','perplexity') ORDER BY updated_at DESC",
        )
      ).rows,
  )
}
export function assertRadarCrmDeliveryRights(
  rights: Rights,
  sourceType: string | undefined,
  facts: Record<string, unknown> = {},
) {
  const source = (sourceType ?? '').toLowerCase()
  if (source === 'osm_extract')
    throw Object.assign(new Error('radar_delivery_attribution_required'), {
      statusCode: 409,
    })
  const config = (key: string) =>
    rights.find((row) => row.provider_key === key)?.public_config ?? {}
  assertB2bDeliveryRights(
    source.startsWith('cnpja')
      ? config('cnpja')
      : { clientDeliveryLicensed: true },
    config('brave_place'),
    source.includes('brave') ||
      !!facts.braveSourceUrl ||
      facts.researchUsesBrave === true,
    config('serper'),
    (source.includes('serper') && !source.includes('places')) ||
      facts.researchUsesSerper === true,
    config('perplexity'),
    source.includes('perplexity') || facts.researchUsesPerplexity === true,
    source.includes('serper_places') || facts.researchUsesSerperPlaces === true,
  )
}
