import { hashCanonical, type Queryable } from '../action-engine/repository.js'
import type { MissionSourceRefWire } from '../action-engine/generated/mission-wire.js'

type Audience = 'internal_operator' | 'client_user' | 'external_contact'
type StrategyContextItem = { strategyId: string; revisionId: string; revisionNumber: number; title: string; sections: unknown[]; sourceContent: string; [key: string]: unknown }
type RawContext = { index: unknown[]; selected: StrategyContextItem[]; coverage: Record<string, unknown>; contextHash: string }
export function normalizeCompanyStrategyContext(raw: RawContext, audience: Audience) {
  const sources: MissionSourceRefWire[] = []
  const selected = raw.selected.map(({ sourceContent, ...item }) => {
    const contentHash = hashCanonical({ id: item.revisionId, version: String(item.revisionNumber), content: sourceContent })
    sources.push({ ref: `customer:strategy:${item.revisionId}`, kind: 'company_strategy', id: item.revisionId, version: String(item.revisionNumber), contentHash,
      visibility: audience === 'external_contact' ? 'external' : 'internal', title: item.title.slice(0, 240), displayMode: 'named' })
    return { ...item, projectionHash: contentHash }
  })
  return { context: { ...raw, selected }, sources }
}
export async function getCompanyStrategyContext(db: Queryable, input: { organizationId: string; contractId?: string | null; profileKey: string; audience: Audience; query: string; strategyIds?: string[]; maxChars?: number }) {
  const result = await db.query<{ context: RawContext }>('SELECT private.get_company_strategy_context_v1($1,$2,$3,$4,$5,$6::uuid[],$7) AS context', [input.organizationId,input.contractId ?? null,input.profileKey,input.audience,input.query,input.strategyIds ?? [],input.maxChars ?? 6000])
  return normalizeCompanyStrategyContext(result.rows[0]!.context, input.audience)
}
export async function loadPublishedCompanyStrategySources(db: Queryable, input: { organizationId: string; contractId?: string | null; audience: Audience; revisionIds: string[] }) {
  if (!input.revisionIds.length) return []
  return (await db.query<{ id: string; strategy_id: string; revision_number: number; content: string; title: string }>(`SELECT revision.id,revision.strategy_id,revision.revision_number,
    private.company_strategy_projection_v1(revision.content,$4)::text AS content,
    private.company_strategy_projection_v1(revision.content,$4)->>'title' AS title
    FROM public.company_strategy_revisions revision JOIN public.company_strategies strategy
      ON strategy.organization_id=revision.organization_id AND strategy.id=revision.strategy_id AND strategy.published_revision_id=revision.id
    WHERE strategy.organization_id=$1 AND revision.id=ANY($2::uuid[]) AND strategy.archived_at IS NULL
      AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM public.contracts contract JOIN public.organizations org ON org.client_id=contract.client_id WHERE contract.id=$3 AND org.id=$1))
      AND EXISTS(SELECT 1 FROM public.company_strategy_publications publication WHERE publication.organization_id=$1 AND publication.strategy_id=strategy.id AND publication.revision_id=revision.id)`, [input.organizationId,input.revisionIds,input.contractId ?? null,input.audience])).rows
}
