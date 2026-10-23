import { z } from 'zod';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import { requireRadarScope } from './access.js';
import { resolveRadarSearchConfiguration, radarTargetsSchema, radarCnaePrefixSchema } from './search-configuration.js';
import { radarDecisionHash } from './decision-service.js';
import { mapCampaign } from './repository.js';

const terms = z.array(z.string().trim().min(1).max(160)).max(50);
export const radarCommercialCriteriaSchema = z.object({ organizationId: z.uuid(), configurationRevision: z.number().int().positive(),
    targetCnaes: z.array(z.string().transform(value => value.replace(/\D/g, '')).pipe(z.string().regex(/^\d{7}$/))).max(50), targets: radarTargetsSchema,
    outOfScopeExamples: terms, excludedNameTerms: terms,
    registry: z.object({ mainActivityRule: z.enum(['any', 'target_main_required', 'target_secondary_needs_review']), blockedMainCnaes: z.array(radarCnaePrefixSchema).max(200), blockedNameTerms: terms }).strict(),
    contactPurpose: z.enum(['general', 'suppliers', 'sales', 'finance', 'recruitment']), minPassRatio: z.number().min(0).max(1), closePendingLots: z.boolean().default(false),
}).strict();
const failure = (code: string) => Object.assign(Error(code), { statusCode: 409 });
export async function saveRadarCommercialCriteria(pool: pg.Pool, user: AuthUser, campaignId: string, value: unknown, options:{client?:Pick<pg.PoolClient,'query'>}={}) {
    const input = radarCommercialCriteriaSchema.parse(value);
    await requireRadarScope(pool, user, { organizationId: input.organizationId, campaignId }, true);
    const ownedClient=options.client?null:await pool.connect();
    const db = options.client ?? ownedClient!;
    try {
        if(!options.client)await db.query('BEGIN');
        const row = (await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE', [campaignId, input.organizationId])).rows[0];
        if (!row || row.configuration_revision !== input.configurationRevision) throw failure('radar_campaign_configuration_changed');
        const config = resolveRadarSearchConfiguration(row.search_configuration);
        const before = radarDecisionHash({ targetCnaes: row.target_cnaes, targets: config.qualification.targets, outOfScopeExamples: config.qualification.outOfScopeExamples, registry: config.qualification.registry,
            excludedNameTerms: config.excludedNameTerms, contactPurpose: config.research.contactPurpose, minPassRatio: config.batch.minPassRatio });
        const { organizationId: _org, configurationRevision: _revision, closePendingLots: _close, ...criteria } = input;
        if (before === radarDecisionHash(criteria)) { if(!options.client)await db.query('COMMIT'); return { campaign: mapCampaign(row as never), criteriaChanged: false }; }
        const busy = (await db.query(`SELECT EXISTS(SELECT 1 FROM public.radar_candidate_research_runs WHERE organization_id=$1 AND campaign_id=$2 AND status='running' AND lease_until>NOW() UNION ALL SELECT 1 FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 AND lease_until>NOW()) AS busy`, [input.organizationId, campaignId])).rows[0]?.busy;
        if (busy) throw failure('radar_wait_for_active_research_before_editing');
        const pending = (await db.query(`SELECT EXISTS(SELECT 1 FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND status IN('queued','discovering','researching','blocked') UNION ALL SELECT 1 FROM public.radar_candidate_research_runs WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL AND status IN('queued','running','blocked')) AS pending`, [input.organizationId, campaignId])).rows[0]?.pending;
        if (pending && !input.closePendingLots) throw failure('radar_confirm_criteria_history_transition');
        await db.query(`UPDATE public.radar_capture_operations SET historical_closed_at=NOW(),status='partial',discovery_stopped=TRUE,discovery_reason='historical_closed',updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL`, [input.organizationId, campaignId]);
        await db.query(`UPDATE public.radar_candidate_research_runs SET historical_closed_at=NOW(),status=CASE WHEN status IN('queued','running') THEN 'partial' ELSE status END,lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND historical_closed_at IS NULL`, [input.organizationId, campaignId]);
        await db.query(`UPDATE public.radar_research_request_items SET state='unchanged',reason_code='radar_historical_closed',updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND state IN('accepted','running','waiting')`, [input.organizationId, campaignId]);
        await db.query(`UPDATE public.radar_research_requests SET status='completed',lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND status IN('accepted','running','waiting')`, [input.organizationId, campaignId]);
        await db.query('DELETE FROM public.radar_capture_outbox WHERE organization_id=$1 AND campaign_id=$2', [input.organizationId, campaignId]);
        config.qualification.targets = input.targets; config.qualification.outOfScopeExamples = input.outOfScopeExamples; config.qualification.registry = input.registry;
        config.excludedNameTerms = input.excludedNameTerms; config.research.contactPurpose = input.contactPurpose; config.batch.minPassRatio = input.minPassRatio;
        for (const gate of ['g1', 'g5'] as const) if (config.funnel[gate].mode === 'enforce') config.funnel[gate].mode = 'shadow';
        const updated = (await db.query(`UPDATE public.radar_campaigns SET target_cnaes=$3,search_configuration=$4,configuration_revision=configuration_revision+1,commercial_criteria_revision=commercial_criteria_revision+1,operational_policy_version=operational_policy_version+1,updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [campaignId, input.organizationId, input.targetCnaes, JSON.stringify(config)])).rows[0];
        await db.query(`UPDATE public.radar_b2b_reviews SET approved_at=NULL,approved_by=NULL,target_status='review',product_fit='unknown',reasons=ARRAY['Critérios alterados; aguarda reavaliação pelas regras atuais.'],updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2`, [input.organizationId, campaignId]);
        await db.query(`UPDATE public.radar_campaign_gate_calibrations SET status='superseded',updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND status='approved'`, [input.organizationId, campaignId]);
        if(!options.client)await db.query('COMMIT'); return { campaign: mapCampaign(updated as never), criteriaChanged: true };
    } catch (cause) { if(!options.client)await db.query('ROLLBACK'); throw cause; } finally { ownedClient?.release(); }
}
