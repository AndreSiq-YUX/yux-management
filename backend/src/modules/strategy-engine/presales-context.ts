import { createHash } from 'node:crypto'
import type pg from 'pg'
import { z } from 'zod'
import { ApiError } from '../../http/errors.js'

type Queryable = Pick<pg.Pool, 'query'>

export const recommendationSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('recommend'),
    packageId: z.uuid(),
    rationale: z.string().trim().min(1).max(4_000),
    itemKeys: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
    alternativePackageIds: z.array(z.uuid()).max(10).default([]),
    missingInformation: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
  }),
  z.object({
    decision: z.literal('defer'),
    rationale: z.string().trim().min(1).max(4_000),
    missingInformation: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
  }),
])
export type Recommendation = z.infer<typeof recommendationSchema>

type CommercialOffer = {
  packageId: string
  name: string
  description: string
  templateId: string
  blueprintId: string | null
  scope: string
  moduleKeys: string[]
  items: Array<{ key: string; label: string; minimum: string; recommended: string; maximum: string }>
}

export async function loadCommercialCatalog(pool: Queryable, organizationId: string) {
  const { rows } = await pool.query<CommercialOffer>(
    `SELECT pkg.id AS "packageId", pkg.name, pkg.description, template.id AS "templateId",
       template.blueprint_id AS "blueprintId", template.scope,
       ARRAY(SELECT module_key FROM public.package_modules module
         WHERE module.package_id = pkg.id ORDER BY module_key) AS "moduleKeys",
       jsonb_agg(jsonb_build_object('key', price.item_key, 'label', price.label,
         'minimum', price.minimum_value::text, 'recommended', price.recommended_value::text,
         'maximum', price.maximum_value::text) ORDER BY price.item_key) AS items
     FROM public.proposal_templates template
     JOIN public.packages pkg ON pkg.id = template.package_id AND pkg.key <> 'yux_internal_growth'
     JOIN public.proposal_price_rules price
       ON price.organization_id = template.organization_id AND price.package_id = template.package_id
     WHERE template.organization_id = $1 AND template.is_active AND template.presales_sellable
     GROUP BY pkg.id, template.id
     HAVING bool_or(price.item_key = 'base')
     ORDER BY pkg.id`,
    [organizationId],
  )
  return { offers: rows, version: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }
}

export async function listPresalesLeads(pool: Queryable, organizationId: string, contractId?: string) {
  return (await pool.query<{ id: string; name: string; company: string | null; stage: string }>(
    `SELECT lead.id, lead.name, lead.company, lead.stage
     FROM public.leads lead
     LEFT JOIN public.crm_instances crm ON crm.id = lead.crm_instance_id AND crm.organization_id = lead.organization_id
     WHERE lead.organization_id = $1 AND lead.stage NOT IN ('WON', 'LOST')
       AND (lead.crm_instance_id IS NULL OR crm.contract_id = $2::uuid)
     ORDER BY lead.updated_at DESC, lead.id LIMIT 100`,
    [organizationId, contractId ?? null],
  )).rows
}

export async function loadPresalesLead(pool: Queryable, organizationId: string, leadId: string, contractId?: string) {
  const { rows } = await pool.query<{
    id: string; name: string; company: string | null; stage: string; crmInstanceId: string | null
    summary: string | null; budget: string | null; painPoints: string[] | null; goals: string[] | null; timeline: string | null
  }>(
    `SELECT lead.id, lead.name, lead.company, lead.stage, lead.crm_instance_id AS "crmInstanceId",
       left(diagnostic.summary, 4000) AS summary, left(diagnostic.budget_range, 300) AS budget,
       diagnostic.pain_points[1:12] AS "painPoints", diagnostic.goals[1:12] AS goals,
       left(diagnostic.timeline, 300) AS timeline
     FROM public.leads lead
     LEFT JOIN public.crm_instances crm ON crm.id = lead.crm_instance_id AND crm.organization_id = lead.organization_id
     LEFT JOIN public.commercial_diagnostics diagnostic
       ON diagnostic.lead_id = lead.id AND diagnostic.organization_id = lead.organization_id
     WHERE lead.organization_id = $1 AND lead.id = $2 AND lead.stage NOT IN ('WON', 'LOST')
       AND (lead.crm_instance_id IS NULL OR crm.contract_id = $3::uuid)`,
    [organizationId, leadId, contractId ?? null],
  )
  if (!rows[0]) throw new ApiError(404, 'strategy_presales_opportunity_out_of_scope')
  const lead = rows[0]
  return { ...lead, version: createHash('sha256').update(JSON.stringify(lead)).digest('hex') }
}

export function validateRecommendation(raw: unknown, catalog: Awaited<ReturnType<typeof loadCommercialCatalog>>): Recommendation {
  const parsed = recommendationSchema.safeParse(raw)
  if (parsed.success) {
    const recommendation = parsed.data
    if (recommendation.decision === 'defer') return recommendation
    const offer = catalog.offers.find(item => item.packageId === recommendation.packageId)
    if (offer && recommendation.itemKeys.includes('base') && recommendation.itemKeys.every(key => offer.items.some(item => item.key === key))) {
      return {
        ...recommendation,
        itemKeys: [...new Set(recommendation.itemKeys)],
        alternativePackageIds: [...new Set(recommendation.alternativePackageIds)].filter(id =>
          id !== offer.packageId && catalog.offers.some(item => item.packageId === id)),
      }
    }
  }
  return {
    decision: 'defer',
    rationale: 'A recomendação precisa de um pacote do catálogo aprovado e de itens com preço vigente.',
    missingInformation: [catalog.offers.length ? 'Confirmar o pacote e os itens elegíveis.' : 'Publicar o catálogo comercial desta conta.'],
  }
}
