import { createHash } from 'node:crypto'
import type { AuthUser } from '../../auth/routes.js'
import {
  getLeadProfile,
  inProfileTransaction,
  profileError,
  type ProfileDb,
} from '../crm/record-profile.js'
import { projectLeadCommercialProfile } from '../crm/lead-commercial-profile.js'
import { buildRadarCrmLeadFacts } from './crm-delivery.js'
import { projectRadarCompanyFacts } from './company-projection.js'
import { assertB2bDeliveryRights } from './b2b-delivery.js'
import { requireRadarScope } from './access.js'
import { radarPublicPresenceFromDossier } from './public-presence.js'
import type pg from 'pg'

const fieldColumns = {
  websiteUrl: 'website_url',
  whatsappPhone: 'whatsapp_phone',
  city: 'city',
  state: 'state',
  address: 'address',
  cnpj: 'cnpj',
  email: 'email',
  phone: 'phone',
} as const
const empty = (value: unknown) => value == null || value === ''
/** Current nonempty scalar wins; arrays keep distinct business facts. */
export function fillCommercialGaps(
  current: unknown,
  incoming: unknown,
): unknown {
  if (empty(current)) return incoming
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const key = (item: any) =>
      JSON.stringify(
        item && typeof item === 'object'
          ? [item.kind, item.value ?? item.metric, item.scope, item.sourceUrl]
          : item,
      )
    return [
      ...new Map(
        [...incoming, ...current].map((item) => [key(item), item]),
      ).values(),
    ]
  }
  if (
    current &&
    incoming &&
    typeof current === 'object' &&
    typeof incoming === 'object' &&
    !Array.isArray(current) &&
    !Array.isArray(incoming)
  ) {
    const result = { ...incoming } as Record<string, unknown>
    for (const [key, value] of Object.entries(current))
      result[key] = fillCommercialGaps(value, result[key])
    return result
  }
  return current
}
async function load(db: ProfileDb, user: AuthUser, leadId: string) {
  await getLeadProfile(db, user, leadId)
  const lead = (
    await db.query(
      'SELECT * FROM public.leads WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
      [leadId],
    )
  ).rows[0]
  if (!lead) throw profileError(404, 'Lead não encontrado.')
  const linked = (
    await db.query(
      `SELECT c.*,campaign.offer_type,campaign.configuration_revision,research.output AS research_output
 FROM public.radar_candidate_records c JOIN public.radar_campaigns campaign ON campaign.id=c.campaign_id AND campaign.organization_id=c.organization_id
 LEFT JOIN LATERAL(SELECT output FROM public.radar_candidate_research_runs r WHERE r.candidate_id=c.id AND r.organization_id=c.organization_id AND r.configuration_revision=campaign.configuration_revision AND r.status IN ('succeeded','partial') ORDER BY r.created_at DESC LIMIT 1) research ON TRUE
 WHERE c.crm_lead_id=$1 AND c.organization_id=$2 ORDER BY c.updated_at DESC LIMIT 1`,
      [leadId, lead.organization_id],
    )
  ).rows[0]
  let candidate = linked
  if (!candidate) {
    const old = (
      await db.query(
        `SELECT c.*,o.campaign_id FROM public.radar_company_records c JOIN public.radar_opportunities o ON o.company_record_id=c.id AND o.organization_id=c.organization_id WHERE o.converted_lead_id=$1 AND o.organization_id=$2 LIMIT 1`,
        [leadId, lead.organization_id],
      )
    ).rows[0]
    if (old)
      candidate = {
        ...old,
        title: old.trade_name || old.legal_name,
        normalized_payload: {
          legalName: old.legal_name,
          tradeName: old.trade_name,
          cnpj: old.cnpj,
          city: old.city,
          state: old.state,
          address: old.address,
          websiteUrl: old.website_url,
          phoneRaw: old.phone_raw,
        },
        offer_type: '',
        configuration_revision: 1,
      }
  }
  if (!candidate)
    throw profileError(409, 'Este lead não possui pesquisa salva vinculada.')
  await requireRadarScope(db, user, {
    organizationId: lead.organization_id,
    campaignId: candidate.campaign_id,
  })
  if (candidate.source_type === 'osm_extract')
    throw profileError(
      409,
      'Os dados ainda não estão liberados para entrega ao CRM.',
    )
  const original = candidate.normalized_payload ?? {}
  const presence =
    candidate.research_output &&
    radarPublicPresenceFromDossier(
      candidate.research_output,
      candidate.configuration_revision,
      {
        name: String(original.tradeName || candidate.title),
        legalName: original.legalName,
        cnpj: original.cnpj,
      },
    )
  const payload = projectRadarCompanyFacts(
    { ...original, ...(presence ? { publicPresence: presence } : {}) },
    candidate.title,
  )
  const normalize = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  if (
    lead.cnpj &&
    payload.cnpj &&
    normalize(lead.cnpj) !== normalize(payload.cnpj)
  )
    throw profileError(
      409,
      'A identificação da empresa diverge da pesquisa vinculada. Revise o CNPJ.',
    )
  const providers = (
    await db.query(
      "SELECT provider_key,public_config FROM public.platform_provider_connections WHERE environment='production' AND is_default=TRUE AND provider_key IN ('cnpja','brave_place','serper','perplexity')",
    )
  ).rows
  const config = (key: string) =>
    providers.find((p) => p.provider_key === key)?.public_config ?? {}
  try {
    assertB2bDeliveryRights(
      candidate.source_type?.startsWith('cnpja')
        ? config('cnpja')
        : { clientDeliveryLicensed: true },
      config('brave_place'),
      !!payload.braveSourceUrl || payload.researchUsesBrave === true,
      config('serper'),
      payload.researchUsesSerper === true,
      config('perplexity'),
      payload.researchUsesPerplexity === true,
      payload.researchUsesSerperPlaces === true,
    )
  } catch {
    throw profileError(
      409,
      'A autorização de entrega desta pesquisa precisa ser revisada pela equipe YUX.',
    )
  }
  const facts = buildRadarCrmLeadFacts(
    { title: candidate.title, normalizedPayload: payload },
    candidate.offer_type || '',
  )
  const proposals = Object.entries(fieldColumns).flatMap(([field, column]) => {
    const incomingValue = facts[field as keyof typeof facts]
    return empty(incomingValue)
      ? []
      : [
          {
            field,
            currentValue: lead[column] ?? null,
            incomingValue,
            decision: empty(lead[column]) ? 'fill' : 'preserve',
          },
        ]
  })
  const commercialProfile = projectLeadCommercialProfile(
    fillCommercialGaps(
      projectLeadCommercialProfile(lead.commercial_profile),
      facts.commercialProfile,
    ),
  )
  const previewRevision = createHash('sha256')
    .update(
      JSON.stringify([
        lead.updated_at,
        lead.commercial_profile,
        proposals,
        commercialProfile,
        candidate.updated_at,
      ]),
    )
    .digest('hex')
  return { lead, previewRevision, proposals, commercialProfile }
}
export async function previewRadarLeadReconciliation(
  db: ProfileDb,
  user: AuthUser,
  { leadId }: { leadId: string },
) {
  const { previewRevision, proposals, commercialProfile } = await load(
    db,
    user,
    leadId,
  )
  return { previewRevision, proposals, commercialProfile }
}
export async function applyRadarLeadReconciliation(
  pool: pg.Pool,
  user: AuthUser,
  input: { leadId: string; previewRevision: string; requestId: string },
) {
  return inProfileTransaction(pool, async (db) => {
    await getLeadProfile(db, user, input.leadId)
    await db.query(
      'SELECT id FROM public.leads WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
      [input.leadId],
    )
    const prior = (
      await db.query(
        'SELECT applied_fields FROM public.crm_lead_reconciliations WHERE id=$1 AND lead_id=$2',
        [input.requestId, input.leadId],
      )
    ).rows[0]
    if (prior)
      return { requestId: input.requestId, appliedFields: prior.applied_fields }
    const current = await load(db, user, input.leadId)
    if (current.previewRevision !== input.previewRevision)
      throw profileError(
        409,
        'O lead ou a pesquisa mudou. Atualize a prévia antes de aplicar.',
      )
    const filled = current.proposals.filter((p) => p.decision === 'fill')
    const profileChanged =
      JSON.stringify(
        projectLeadCommercialProfile(current.lead.commercial_profile),
      ) !== JSON.stringify(current.commercialProfile)
    const assignments = filled.map(
      (p, i) =>
        `${fieldColumns[p.field as keyof typeof fieldColumns]}=$${i + 2}`,
    )
    const values = [
      input.leadId,
      ...filled.map((p) => p.incomingValue),
      JSON.stringify(current.commercialProfile),
    ]
    if (profileChanged)
      assignments.push(`commercial_profile=$${values.length}::jsonb`)
    else values.pop()
    if (assignments.length)
      await db.query(
        `UPDATE public.leads SET ${assignments.join(',')},updated_at=now() WHERE id=$1 AND deleted_at IS NULL`,
        values,
      )
    const appliedFields = [
      ...filled.map((p) => p.field),
      ...(profileChanged ? ['commercialProfile'] : []),
    ]
    await db.query(
      'INSERT INTO public.crm_lead_reconciliations(id,organization_id,lead_id,actor_id,applied_fields) VALUES($1,$2,$3,$4,$5)',
      [
        input.requestId,
        current.lead.organization_id,
        input.leadId,
        user.id,
        appliedFields,
      ],
    )
    if (appliedFields.length)
      await db.query(
        "INSERT INTO public.interactions(organization_id,lead_id,type,title,description,date) VALUES($1,$2,'note','Dados comerciais atualizados','Lacunas preenchidas com a pesquisa salva. Dados existentes preservados.',now())",
        [current.lead.organization_id, input.leadId],
      )
    return { requestId: input.requestId, appliedFields }
  })
}
