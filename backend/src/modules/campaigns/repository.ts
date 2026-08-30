import { missionArtifactHash, type MissionCommandContext, type MissionCommandQueryable } from '../action-engine/mission-command.js'

export type CampaignLaunchArtifact = {
  name: string; objective: 'lead_generation' | 'traffic' | 'conversions' | 'awareness'; offer: string
  audience: Record<string, unknown>; platform: 'meta' | 'google'; providerConnectionId: string
  dailyBudgetBrl: string; totalBudgetBrl: string; startsAt: string; endsAt?: string
  creatives: Array<{ format: 'image' | 'video' | 'carousel' | 'text'; headline: string; body: string; sourceIds: string[] }>
  landingPageId?: string; leadFormId?: string; trackingPlan: Record<string, string>; sourceIds: string[]
}

export type CampaignMissionVersion = {
  id: string; organizationId: string; campaignId?: string; versionNumber: number
  status: 'draft' | 'approved' | 'provider_paused' | 'active' | 'paused' | 'archived'
  snapshotPayload: CampaignLaunchArtifact; contentHash: string; approvedSubjectHash?: string
}

export function validateCampaignLaunchArtifact(input: CampaignLaunchArtifact): CampaignLaunchArtifact {
  if (!input.name?.trim() || !input.offer?.trim()) throw new Error('campaign_draft_identity_invalid')
  if (!['meta','google'].includes(input.platform)) throw new Error('campaign_provider_invalid')
  const daily = Number(input.dailyBudgetBrl); const total = Number(input.totalBudgetBrl)
  if (!Number.isFinite(daily) || daily <= 0 || !Number.isFinite(total) || total < daily) throw new Error('campaign_budget_invalid')
  if (!input.providerConnectionId) throw new Error('campaign_provider_connection_required')
  if (!input.creatives.length || input.creatives.some(item => !item.headline.trim() || !item.body.trim() || item.sourceIds.length === 0)) throw new Error('campaign_creatives_invalid')
  if (!input.sourceIds.length) throw new Error('campaign_evidence_required')
  for (const key of ['utm_source','utm_medium','utm_campaign']) if (!input.trackingPlan[key]?.trim()) throw new Error('campaign_tracking_invalid')
  return { ...input, name: input.name.trim(), offer: input.offer.trim(), sourceIds: [...new Set(input.sourceIds)].sort() }
}

export async function inspectCampaignState(client: MissionCommandQueryable, organizationId: string, missionId?: string) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT campaign.id,campaign.name,campaign.provider,campaign.lifecycle_status AS status,
            campaign.daily_budget::TEXT AS "dailyBudgetBrl",campaign.total_budget::TEXT AS "totalBudgetBrl",
            campaign.external_id AS "providerReference",version.id AS "versionId",version.content_hash AS "contentHash"
     FROM public.campaigns campaign LEFT JOIN public.campaign_mission_versions version ON version.id=campaign.active_mission_version_id
     WHERE campaign.organization_id=$1 AND ($2::UUID IS NULL OR campaign.mission_id=$2) ORDER BY campaign.updated_at DESC`,
    [organizationId, missionId ?? null],
  )
  return result.rows
}

export async function insertCampaignDraft(client: MissionCommandQueryable, context: MissionCommandContext, raw: CampaignLaunchArtifact): Promise<CampaignMissionVersion> {
  const artifact = validateCampaignLaunchArtifact(raw); const contentHash = missionArtifactHash(artifact)
  const contract = await client.query<{ contract_id: string; client_id: string }>(
    `SELECT contract.id AS contract_id,contract.client_id FROM public.action_missions mission
     JOIN public.contracts contract ON contract.id=mission.contract_id AND contract.status='active'
     JOIN public.organizations organization ON organization.id=mission.organization_id AND organization.client_id=contract.client_id
     JOIN public.contract_modules module ON module.contract_id=contract.id AND module.module_key='campaigns' AND module.enabled=TRUE
     WHERE mission.id=$1 AND mission.organization_id=$2 LIMIT 1`, [context.missionId, context.organizationId],
  )
  if (!contract.rows[0]) throw new Error('campaign_contract_not_entitled')
  const connection = await client.query<{ id: string }>(`SELECT id FROM public.ad_provider_connections WHERE id=$1 AND organization_id=$2 AND provider=$3 AND status='connected' LIMIT 1`, [artifact.providerConnectionId, context.organizationId, artifact.platform])
  if (!connection.rows[0]) throw new Error('campaign_provider_connection_unavailable')
  const campaign = await client.query<{ id: string }>(
    `INSERT INTO public.campaigns (organization_id,client_id,contract_id,provider_connection_id,name,description,platform,external_id,status,budget,provider,objective,lifecycle_status,daily_budget,total_budget,starts_at,ends_at,target_audience,metrics,utm_source,utm_medium,utm_campaign,mission_id,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$21,'PAUSED',$8,$9,$10,'draft',$8,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
    [context.organizationId, contract.rows[0].client_id, contract.rows[0].contract_id, artifact.providerConnectionId,
      artifact.name, artifact.offer, artifact.platform.toUpperCase(), artifact.totalBudgetBrl, artifact.platform, artifact.objective,
      artifact.totalBudgetBrl, artifact.startsAt, artifact.endsAt ?? null, artifact.audience, { sourceIds: artifact.sourceIds },
      artifact.trackingPlan.utm_source, artifact.trackingPlan.utm_medium, artifact.trackingPlan.utm_campaign, context.missionId, context.actorId,
      `local:${context.missionId}:${context.actionRunId}`],
  )
  const campaignId = required(campaign.rows[0]?.id)
  const version = await client.query<{ id: string; version_number: number }>(
    `INSERT INTO public.campaign_mission_versions (organization_id,campaign_id,version_number,snapshot_payload,content_hash,mission_id,action_run_id)
     VALUES ($1,$2,COALESCE((SELECT MAX(version_number)+1 FROM public.campaign_mission_versions WHERE organization_id=$1 AND mission_id=$3),1),$4,$5,$3,$6)
     RETURNING id,version_number`, [context.organizationId,campaignId,context.missionId,artifact,contentHash,context.actionRunId],
  )
  const id=required(version.rows[0]?.id)
  await client.query(`UPDATE public.campaigns SET active_mission_version_id=$2 WHERE id=$1 AND organization_id=$3`, [campaignId,id,context.organizationId])
  return { id,organizationId:context.organizationId,campaignId,versionNumber:Number(version.rows[0]?.version_number),status:'draft',snapshotPayload:artifact,contentHash }
}

export async function getCampaignMissionVersion(client: MissionCommandQueryable, input: { organizationId: string; missionId: string; versionId: string }): Promise<CampaignMissionVersion | null> {
  const result=await client.query<{id:string;organization_id:string;campaign_id:string|null;version_number:number;status:CampaignMissionVersion['status'];snapshot_payload:CampaignLaunchArtifact;content_hash:string;approved_subject_hash:string|null}>(
    `SELECT id,organization_id,campaign_id,version_number,status,snapshot_payload,content_hash,approved_subject_hash FROM public.campaign_mission_versions WHERE id=$1 AND organization_id=$2 AND mission_id=$3 LIMIT 1`,
    [input.versionId,input.organizationId,input.missionId],
  ); const row=result.rows[0]; return row?{id:row.id,organizationId:row.organization_id,...(row.campaign_id?{campaignId:row.campaign_id}:{}),versionNumber:Number(row.version_number),status:row.status,snapshotPayload:row.snapshot_payload,contentHash:row.content_hash,...(row.approved_subject_hash?{approvedSubjectHash:row.approved_subject_hash}:{})}:null
}

function required(value?: string){if(!value)throw new Error('campaign_persistence_failed');return value}
