import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'

type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient

export type StudioPlanInput = {
  organizationId: string
  contractId: string
  idempotencyKey: string
  name: string
  objective: 'lead_generation' | 'traffic' | 'conversions' | 'awareness'
  audience: string
  offer: string
  channel: string
  constraints: string
  sourceIds: string[]
  provider: 'meta' | 'google'
}

export async function getStudioJourneySummary(
  db: Queryable,
  input: { organizationId: string; contractId: string; since?: string },
) {
  const context = await requireStudioContract(db, input.organizationId, input.contractId)
  const since = input.since ?? new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [campaigns, contents, workflows, publishingRuns, calendarItems, connections, counts] = await Promise.all([
    db.query(
      `SELECT id,name,objective,lifecycle_status AS status,provider,mission_id AS "missionId",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM public.campaigns
       WHERE organization_id=$1 AND contract_id=$2
       ORDER BY updated_at DESC LIMIT 50`,
      [input.organizationId, input.contractId],
    ),
    db.query(
      `SELECT content.id,content.title,content.content_type AS "contentType",content.channel,
              content.status,content.brief,content.body,content.cta,content.campaign_id AS "campaignId",
              content.scheduled_at AS "scheduledAt",content.published_at AS "publishedAt",
              content.published_url AS "publishedUrl",content.created_at AS "createdAt",content.updated_at AS "updatedAt",
              version.id AS "latestVersionId",version.version_number AS "latestVersionNumber",
              review.id AS "reviewId",review.status AS "reviewStatus",review.comments AS "reviewComments",
              review.content_version_id AS "reviewVersionId"
       FROM public.content_items content
       LEFT JOIN LATERAL (
         SELECT id,version_number FROM public.content_versions
         WHERE content_item_id=content.id ORDER BY version_number DESC LIMIT 1
       ) version ON TRUE
       LEFT JOIN LATERAL (
         SELECT id,status,comments,content_version_id FROM public.content_reviews
         WHERE content_item_id=content.id ORDER BY created_at DESC LIMIT 1
       ) review ON TRUE
       WHERE content.organization_id=$1 AND content.contract_id=$2
       ORDER BY content.updated_at DESC LIMIT 100`,
      [input.organizationId, input.contractId],
    ),
    db.query(
      `SELECT id,workflow_key AS "workflowKey",name,status,trigger_type AS "triggerType",
              config,created_at AS "createdAt",updated_at AS "updatedAt"
       FROM public.marketing_workflows
       WHERE organization_id=$1 AND contract_id=$2 AND status <> 'archived'
       ORDER BY updated_at DESC`,
      [input.organizationId, input.contractId],
    ),
    db.query(
      `SELECT run.id,run.content_item_id AS "contentItemId",run.approved_content_version_id AS "approvedContentVersionId",
              run.action,run.status,run.provider_post_id AS "providerPostId",run.published_url AS "publishedUrl",
              run.idempotency_key AS "idempotencyKey",connection.provider,connection.name AS "connectionName",
              CASE WHEN run.protected_error IS NULL THEN NULL ELSE 'publishing_failed' END AS "protectedError",
              run.created_at AS "createdAt",run.updated_at AS "updatedAt"
       FROM public.publishing_runs run
       JOIN public.publishing_connections connection ON connection.id=run.connection_id
       WHERE run.organization_id=$1 AND run.contract_id=$2
       ORDER BY run.created_at DESC LIMIT 100`,
      [input.organizationId, input.contractId],
    ),
    db.query(
      `SELECT id,content_item_id AS "contentItemId",title,channel,status,starts_at AS "startsAt",ends_at AS "endsAt"
       FROM public.editorial_calendar_items
       WHERE organization_id=$1 AND contract_id=$2 AND status <> 'cancelled'
       ORDER BY starts_at ASC LIMIT 100`,
      [input.organizationId, input.contractId],
    ),
    db.query(
      `SELECT id,provider,name,status,site_url AS "siteUrl",last_verified_at AS "lastVerifiedAt"
       FROM public.publishing_connections
       WHERE organization_id=$1 AND contract_id=$2 AND status <> 'disabled'
       ORDER BY provider,name`,
      [input.organizationId, input.contractId],
    ),
    db.query<{
      activeFlows: number; generatedAssets: number; pendingReviews: number; scheduledAssets: number; failedPublications: number
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM public.marketing_workflows WHERE organization_id=$1 AND contract_id=$2 AND status='active') AS "activeFlows",
         (SELECT COUNT(*)::int FROM public.content_items WHERE organization_id=$1 AND contract_id=$2 AND created_at >= $3) AS "generatedAssets",
         (SELECT COUNT(*)::int FROM public.content_items WHERE organization_id=$1 AND contract_id=$2 AND status='in_review') AS "pendingReviews",
         (SELECT COUNT(*)::int FROM public.content_items WHERE organization_id=$1 AND contract_id=$2 AND status='scheduled') AS "scheduledAssets",
         (SELECT COUNT(*)::int FROM public.publishing_runs WHERE organization_id=$1 AND contract_id=$2 AND status IN ('failed','blocked')) AS "failedPublications"`,
      [input.organizationId, input.contractId, since],
    ),
  ])

  return {
    organizationId: input.organizationId,
    contractId: input.contractId,
    clientId: context.clientId,
    window: { since, until: new Date().toISOString() },
    counts: counts.rows[0] ?? { activeFlows: 0, generatedAssets: 0, pendingReviews: 0, scheduledAssets: 0, failedPublications: 0 },
    links: {
      activeFlows: '/portal/marketing/studio#flows',
      generatedAssets: '/portal/marketing/studio#contents',
      pendingReviews: '/portal/marketing/studio#reviews',
      scheduledAssets: '/portal/marketing/studio#calendar',
      failedPublications: '/portal/marketing/studio#publishing',
    },
    campaigns: campaigns.rows,
    contents: contents.rows,
    workflows: workflows.rows,
    publishingRuns: publishingRuns.rows,
    calendarItems: calendarItems.rows,
    connections: connections.rows,
  }
}

export async function createStudioCampaignPlan(db: pg.Pool, actorId: string, input: StudioPlanInput) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const context = await requireStudioContract(client, input.organizationId, input.contractId)
    const sourceIds = [...new Set(input.sourceIds)]
    if (sourceIds.length) {
      const sources = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM public.marketing_sources
         WHERE organization_id=$1 AND contract_id=$2 AND id=ANY($3::uuid[])`,
        [input.organizationId, input.contractId, sourceIds],
      )
      if (sources.rows[0]?.count !== sourceIds.length) throw domainError('studio_sources_not_available', 409)
    }
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `${input.organizationId}:${input.contractId}:${input.idempotencyKey}`,
    ])
    const existing = await client.query<{ result_payload: Record<string, unknown> }>(
      `SELECT result_payload FROM public.marketing_workflow_runs
       WHERE organization_id=$1 AND contract_id=$2 AND journey_idempotency_key=$3
       ORDER BY created_at DESC LIMIT 1`,
      [input.organizationId, input.contractId, input.idempotencyKey],
    )
    if (existing.rows[0]) {
      await client.query('COMMIT')
      return { ...existing.rows[0].result_payload, duplicate: true }
    }

    const externalId = `local:studio:${randomUUID()}`
    const campaign = await client.query<{ id: string }>(
      `INSERT INTO public.campaigns (
         organization_id,client_id,contract_id,name,description,platform,external_id,status,budget,
         provider,objective,lifecycle_status,daily_budget,total_budget,start_date,target_audience,metrics,
         utm_source,utm_medium,utm_campaign,created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PAUSED',0,$8,$9,'draft',0,0,CURRENT_DATE,$10::jsonb,$11::jsonb,$8,'planned',$12,$13)
       RETURNING id`,
      [
        input.organizationId, context.clientId, input.contractId, input.name.trim(), input.offer.trim(),
        input.provider.toUpperCase(), externalId, input.provider, input.objective,
        JSON.stringify({ description: input.audience.trim() }),
        JSON.stringify({ offer: input.offer.trim(), constraints: input.constraints.trim(), sourceIds }),
        slug(input.name), actorId,
      ],
    )
    const campaignId = required(campaign.rows[0]?.id, 'studio_campaign_not_created')
    const briefing = {
      objective: input.objective, audience: input.audience.trim(), offer: input.offer.trim(),
      channel: input.channel, constraints: input.constraints.trim(), sourceIds,
    }
    const body = buildInitialDraft(input)
    const content = await client.query<{ id: string }>(
      `INSERT INTO public.content_items (
         organization_id,client_id,contract_id,title,content_type,channel,status,brief,body,campaign_id,metadata
       ) VALUES ($1,$2,$3,$4,'creative_brief',$5,'draft',$6,$7,$8,$9::jsonb)
       RETURNING id`,
      [input.organizationId, context.clientId, input.contractId, `Brief — ${input.name.trim()}`, input.channel,
        JSON.stringify(briefing), body, campaignId,
        JSON.stringify({ briefing, sources: sourceIds, generation: 'studio_campaign_planner_v1' })],
    )
    const contentId = required(content.rows[0]?.id, 'studio_content_not_created')
    const version = await client.query<{ id: string; version_number: number }>(
      `INSERT INTO public.content_versions (content_item_id,version_number,title,body,change_summary,created_by)
       VALUES ($1,1,$2,$3,'Versão inicial criada a partir do planejamento persistido.',$4)
       RETURNING id,version_number`,
      [contentId, `Brief — ${input.name.trim()}`, body, actorId],
    )
    const versionId = required(version.rows[0]?.id, 'studio_content_version_not_created')
    const workflow = await client.query<{ id: string }>(
      `INSERT INTO public.marketing_workflows (
         organization_id,client_id,contract_id,workflow_key,name,description,status,trigger_type,config,created_by
       ) VALUES ($1,$2,$3,'studio_campaign_journey','Planejamento de campanha do Studio',
                 'Briefing, conteúdo, revisão e publicação controlada.','active','manual',$4::jsonb,$5)
       ON CONFLICT (contract_id,workflow_key) DO UPDATE SET config=EXCLUDED.config,updated_at=NOW()
       RETURNING id`,
      [input.organizationId, context.clientId, input.contractId,
        JSON.stringify({ schemaVersion: 1, stages: ['planning', 'draft', 'review', 'publishing'] }), actorId],
    )
    const resultPayload = { campaignId, contentId, contentVersionId: versionId, workflowId: workflow.rows[0]?.id, status: 'draft' }
    const run = await client.query<{ id: string }>(
      `INSERT INTO public.marketing_workflow_runs (
         organization_id,client_id,contract_id,workflow_id,status,run_type,input_payload,context_snapshot,result_payload,
         journey_idempotency_key,requested_by,started_at,completed_at
       ) VALUES ($1,$2,$3,$4,'succeeded','manual',$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,NOW(),NOW())
       RETURNING id`,
      [input.organizationId, context.clientId, input.contractId, workflow.rows[0]?.id,
        JSON.stringify({ ...briefing, idempotencyKey: input.idempotencyKey }),
        JSON.stringify({ organizationId: input.organizationId, contractId: input.contractId, clientId: context.clientId }),
        JSON.stringify(resultPayload), input.idempotencyKey, actorId],
    )
    await client.query(
      `INSERT INTO public.marketing_content_generation_runs (
         organization_id,client_id,contract_id,workflow_run_id,content_item_id,content_version_id,status,
         content_type,channel,brief_snapshot,context_summary,output_title,output_body,variation_count,
         requires_grounding,grounding_status,checklist,created_by,started_at,completed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'succeeded','creative_brief',$7,$8,$9,$10,$11,1,$12,'not_required',$13::jsonb,$14,NOW(),NOW())`,
      [input.organizationId, context.clientId, input.contractId, run.rows[0]?.id, contentId, versionId,
        input.channel, JSON.stringify(briefing), `Planejamento autorizado do contrato ${input.contractId}`,
        `Brief — ${input.name.trim()}`, body, false,
        JSON.stringify({ persistedBriefing: true, sources: sourceIds }), actorId],
    )
    await client.query('COMMIT')
    return { ...resultPayload, workflowRunId: run.rows[0]?.id, duplicate: false }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function createStudioContentVersion(db: pg.Pool, actorId: string, input: {
  organizationId: string; contractId: string; contentId: string; title: string; body: string; changeSummary: string
}) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await lockStudioContent(client, input)
    const result = await client.query(
      `INSERT INTO public.content_versions (content_item_id,version_number,title,body,change_summary,created_by)
       SELECT $1,COALESCE(MAX(version_number),0)+1,$2,$3,$4,$5
       FROM public.content_versions WHERE content_item_id=$1
       RETURNING id,content_item_id AS "contentItemId",version_number AS "versionNumber",title,body,
                 change_summary AS "changeSummary",created_at AS "createdAt"`,
      [input.contentId, input.title.trim(), input.body, input.changeSummary.trim(), actorId],
    )
    await client.query(
      `UPDATE public.content_items
       SET title=$2,body=$3,status='draft',approved_by=NULL,published_at=NULL,published_url=NULL,updated_at=NOW()
       WHERE id=$1`,
      [input.contentId, input.title.trim(), input.body],
    )
    await client.query('COMMIT')
    return result.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function submitStudioContentForReview(db: pg.Pool, actorId: string, input: {
  organizationId: string; contractId: string; contentId: string; contentVersionId: string
}) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await lockStudioContentVersion(client, input)
    await client.query(`UPDATE public.content_items SET status='in_review',approved_by=NULL,updated_at=NOW() WHERE id=$1`, [input.contentId])
    const review = await client.query(
      `INSERT INTO public.content_reviews (content_item_id,content_version_id,status,checklist)
       VALUES ($1,$2,'pending','{}'::jsonb)
       ON CONFLICT (content_item_id,content_version_id)
       WHERE status='pending' AND content_version_id IS NOT NULL
       DO UPDATE SET updated_at=NOW()
       RETURNING id,content_item_id AS "contentItemId",content_version_id AS "contentVersionId",status,created_at AS "createdAt"`,
      [input.contentId, input.contentVersionId],
    )
    await client.query('COMMIT')
    return review.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function decideStudioContentReview(db: pg.Pool, actorId: string, input: {
  organizationId: string; contractId: string; contentId: string; contentVersionId: string
  status: 'approved' | 'changes_requested' | 'rejected'; comments?: string
}) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await lockStudioContentVersion(client, input)
    const review = await client.query<{ id: string }>(
      `SELECT id FROM public.content_reviews
       WHERE content_item_id=$1 AND content_version_id=$2 AND status='pending'
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.contentId, input.contentVersionId],
    )
    if (!review.rows[0]) throw domainError('studio_review_not_pending', 409)
    await client.query(
      `UPDATE public.content_reviews
       SET status=$2,comments=$3,reviewer_id=$4,decided_at=NOW(),updated_at=NOW()
       WHERE id=$1`,
      [review.rows[0].id, input.status, input.comments?.trim() || null, actorId],
    )
    const contentStatus = input.status === 'approved' ? 'approved' : input.status
    await client.query(
      `UPDATE public.content_items SET status=$2,approved_by=$3,updated_at=NOW() WHERE id=$1`,
      [input.contentId, contentStatus, input.status === 'approved' ? actorId : null],
    )
    await client.query('COMMIT')
    return { contentId: input.contentId, contentVersionId: input.contentVersionId, status: contentStatus }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function createStudioPublishingIntent(db: pg.Pool, actorId: string, input: {
  organizationId: string; contractId: string; contentId: string; approvedContentVersionId: string
  connectionId: string; action: 'create_draft' | 'update_draft' | 'publish'; idempotencyKey: string
}) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const context = await requireStudioContract(client, input.organizationId, input.contractId)
    const approved = await client.query<{ title: string; body: string | null; version_number: number; provider: string }>(
      `SELECT version.title,version.body,version.version_number,connection.provider
       FROM public.content_versions version
       JOIN public.content_items content ON content.id=version.content_item_id
       JOIN public.content_reviews review ON review.content_item_id=content.id
         AND review.content_version_id=version.id AND review.status='approved'
       JOIN public.publishing_connections connection ON connection.id=$4
         AND connection.organization_id=content.organization_id AND connection.contract_id=content.contract_id
         AND connection.status='connected'
       WHERE version.id=$1 AND content.id=$2 AND content.organization_id=$3 AND content.contract_id=$5
       LIMIT 1 FOR UPDATE OF content`,
      [input.approvedContentVersionId, input.contentId, input.organizationId, input.connectionId, input.contractId],
    )
    if (!approved.rows[0]) throw domainError('studio_approved_version_or_connection_required', 409)
    const payload = {
      approvedContentVersionId: input.approvedContentVersionId,
      approvedVersionNumber: approved.rows[0].version_number,
      title: approved.rows[0].title,
      body: approved.rows[0].body ?? '',
      payloadHash: sha256({ title: approved.rows[0].title, body: approved.rows[0].body ?? '' }),
    }
    const run = await client.query(
      `INSERT INTO public.publishing_runs (
         organization_id,client_id,contract_id,connection_id,content_item_id,approved_content_version_id,
         action,status,idempotency_key,request_payload,response_payload,requested_by,approved_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9::jsonb,'{}'::jsonb,$10,$10)
       ON CONFLICT (connection_id,idempotency_key) DO NOTHING
       RETURNING id,organization_id AS "organizationId",content_item_id AS "contentItemId",
                 approved_content_version_id AS "approvedContentVersionId",action,status,idempotency_key AS "idempotencyKey"`,
      [input.organizationId, context.clientId, input.contractId, input.connectionId, input.contentId,
        input.approvedContentVersionId, input.action, input.idempotencyKey, JSON.stringify(payload), actorId],
    )
    let persisted = run.rows[0]
    if (!persisted) {
      const duplicate = await client.query(
        `SELECT id,organization_id AS "organizationId",content_item_id AS "contentItemId",
                approved_content_version_id AS "approvedContentVersionId",action,status,idempotency_key AS "idempotencyKey"
         FROM public.publishing_runs WHERE connection_id=$1 AND idempotency_key=$2 LIMIT 1`,
        [input.connectionId, input.idempotencyKey],
      )
      persisted = duplicate.rows[0]
      if (!persisted || persisted.contentItemId !== input.contentId || persisted.approvedContentVersionId !== input.approvedContentVersionId) {
        throw domainError('studio_publishing_idempotency_conflict', 409)
      }
    }
    const retry = !run.rows[0] && ['failed', 'blocked'].includes(String(persisted.status))
    if (retry) {
      const retried = await client.query(
        `UPDATE public.publishing_runs
         SET status='queued',protected_error=NULL,started_at=NULL,completed_at=NULL,updated_at=NOW()
         WHERE id=$1 RETURNING status`,
        [persisted.id],
      )
      persisted = { ...persisted, status: retried.rows[0]?.status ?? 'queued' }
    }
    await client.query('COMMIT')
    return { ...persisted, duplicate: !run.rows[0], retry }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

async function requireStudioContract(db: Queryable, organizationId: string, contractId: string) {
  const result = await db.query<{ client_id: string }>(
    `SELECT contract.client_id
     FROM public.contracts contract
     JOIN public.organizations organization ON organization.id=$1 AND organization.client_id=contract.client_id
     JOIN public.contract_modules module ON module.contract_id=contract.id AND module.module_key='marketing_studio' AND module.enabled=TRUE
     WHERE contract.id=$2 AND contract.status='active' LIMIT 1`,
    [organizationId, contractId],
  )
  if (!result.rows[0]) throw domainError('studio_contract_not_available', 404)
  return { clientId: result.rows[0].client_id }
}

async function lockStudioContent(db: Queryable, input: { organizationId: string; contractId: string; contentId: string }) {
  await requireStudioContract(db, input.organizationId, input.contractId)
  const result = await db.query(
    `SELECT id FROM public.content_items WHERE id=$1 AND organization_id=$2 AND contract_id=$3 FOR UPDATE`,
    [input.contentId, input.organizationId, input.contractId],
  )
  if (!result.rows[0]) throw domainError('studio_content_not_found', 404)
}

async function lockStudioContentVersion(db: Queryable, input: {
  organizationId: string; contractId: string; contentId: string; contentVersionId: string
}) {
  await lockStudioContent(db, input)
  const version = await db.query(
    `SELECT id FROM public.content_versions WHERE id=$1 AND content_item_id=$2 LIMIT 1`,
    [input.contentVersionId, input.contentId],
  )
  if (!version.rows[0]) throw domainError('studio_content_version_not_found', 404)
}

function buildInitialDraft(input: StudioPlanInput) {
  return [
    `Objetivo: ${input.objective}.`,
    `Público: ${input.audience.trim()}.`,
    `Oferta: ${input.offer.trim()}.`,
    `Canal: ${input.channel}.`,
    input.constraints.trim() ? `Restrições: ${input.constraints.trim()}.` : 'Restrições: nenhuma informada.',
  ].join('\n')
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function required(value: string | undefined, code: string) {
  if (!value) throw new Error(code)
  return value
}

function domainError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode })
}
