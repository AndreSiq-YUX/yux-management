import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import {requireRadarScope} from './access.js'
import {isRadarEnabledOrganization} from './repository.js'
import {assertB2bDeliveryRights} from './b2b-delivery.js'
import type {RadarContactEvidence} from './contact-evidence.js'
import {projectRadarCompanyFacts} from './company-projection.js'
import {consolidateRadarContacts,isUsefulRadarContact} from './contact-consolidation.js'
import type {RadarContactPurpose} from './contact-evidence.js'
import {radarQualityFromPayload} from './research-quality.js'
import {resolveRadarSearchConfiguration} from './search-configuration.js'
import {radarPublicPresenceFromDossier} from './public-presence.js'

export type RadarCrmDestination={crmInstanceId:string;pipelineId:string;stageId:string}
type DeliveryInput={organizationId:string;campaignId:string;configurationRevision:number;candidateIds:string[];destination:RadarCrmDestination;requestId:string}
type DeliveryItem={candidateId:string;status:'created'|'already_linked'|'blocked';leadId?:string;pipelineId?:string;reason?:string}
const failure=(code:string,statusCode=409)=>Object.assign(new Error(code),{statusCode})

export function buildRadarCrmLeadFacts(candidate:{title:string;normalizedPayload:Record<string,unknown>},offer:string){
  const data=projectRadarCompanyFacts(candidate.normalizedPayload)
  const purpose=(['general','suppliers','sales','finance','recruitment'].includes(String(data.researchContactPurpose))?data.researchContactPurpose:'general') as RadarContactPurpose
  const contacts=consolidateRadarContacts((Array.isArray(data.publicContacts)?data.publicContacts:[]).filter((item):item is RadarContactEvidence=>
    !!item&&typeof item==='object'&&item.association==='confirmed'&&typeof item.value==='string'&&typeof item.sourceUrl==='string')
    ,purpose)
  const first=(kind:string)=>contacts.filter(item=>item.kind===kind&&isUsefulRadarContact(item,purpose)).sort((a,b)=>Number(!!b.preferred)-Number(!!a.preferred))[0]?.value
  const reasons=(Array.isArray(data.triageReasons)?data.triageReasons:[]).filter((value):value is string=>typeof value==='string')
  const activity=data.activityAssessment??data.activity
  const tlsExceptions=Array.isArray(data.researchTlsExceptions)?data.researchTlsExceptions:[]
  const notes=[`Oferta da campanha: ${offer}`,
    `Público: ${({confirmed:'Confirmado',review:'Requer revisão',not_target:'Fora do público',insufficient:'Evidência insuficiente'} as Record<string,string>)[String(data.targetStatus)]??'Não avaliado'}`,
    `Adequação: ${({high:'Boa aderência',possible:'Possível aderência',low:'Baixa aderência',unknown:'Não confirmada'} as Record<string,string>)[String(data.productFit)]??'Não avaliada'}`,
    ...reasons, data.companyProfile?`Perfil e fontes: ${JSON.stringify(data.companyProfile)}`:'',
    activity?`Atividade e evidências: ${JSON.stringify(activity)}`:'',
    tlsExceptions.length?`Leitura pública com certificado vencido, autorizada pelo Admin: ${JSON.stringify(tlsExceptions)}`:'',
    'Contatos públicos não comprovam consentimento nem atendimento. Contato comercial manual.'].filter(Boolean).join('\n')
  return {name:candidate.title,email:first('email')??'',phone:first('phone')??first('whatsapp')??null,
    notes,
    attribution:{radarCnpj:typeof data.cnpj==='string'?data.cnpj:undefined,recommendedOffer:offer,websiteUrl:data.websiteUrl,
      contacts,registryPhone:data.phoneRaw,companyProfile:data.companyProfile,sizeAssessment:data.sizeAssessment,activity,tlsExceptions,
      targetStatus:data.targetStatus,productFit:data.productFit,triageReasons:reasons,
      collectionRevision:data.researchRevision,consent:'not_established',outreach:'manual_only',acquisitionKind:'outbound'}}
}

export async function listRadarCrmDestinations(pool:pg.Pool,user:AuthUser,organizationId:string){
  await requireRadarScope(pool,user,{organizationId},true,true)
  const result=await pool.query(`SELECT instance.id AS "crmInstanceId",pipeline.id AS "pipelineId",stage.id AS "stageId",
    pipeline.name AS "pipelineName",stage.name AS "stageName"
    FROM public.crm_instances instance
    JOIN public.contracts contract ON contract.id=instance.contract_id AND contract.status='active'
    JOIN public.organizations organization ON organization.id=instance.organization_id
    JOIN public.crm_pipelines pipeline ON pipeline.crm_instance_id=instance.id AND pipeline.organization_id=instance.organization_id AND pipeline.is_active=TRUE
    JOIN public.crm_pipeline_stages stage ON stage.pipeline_id=pipeline.id AND stage.is_active=TRUE AND stage.is_won=FALSE AND stage.is_lost=FALSE
    WHERE instance.organization_id=$1 AND instance.status='active'
      AND (organization.is_internal_growth_workspace=TRUE OR EXISTS(SELECT 1 FROM public.contract_modules module WHERE module.contract_id=contract.id AND module.module_key='crm' AND module.enabled=TRUE))
      AND ($3::boolean=TRUE OR EXISTS(SELECT 1 FROM public.crm_instance_members member WHERE member.crm_instance_id=instance.id AND member.user_id=$2 AND member.status='active'))
    ORDER BY pipeline.name,stage.order_index,stage.id`,[organizationId,user.id,['yux_admin','yux_operator'].includes(user.role)])
  return result.rows as Array<RadarCrmDestination&{pipelineName:string;stageName:string}>
}

export async function deliverRadarCompaniesToCrm(pool:pg.Pool,user:AuthUser,input:DeliveryInput){
  await requireRadarScope(pool,user,{organizationId:input.organizationId,campaignId:input.campaignId},true,true)
  if(!await isRadarEnabledOrganization(pool,input.organizationId))throw failure('radar_forbidden',403)
  const client=await pool.connect(),items:DeliveryItem[]=[]
  try{
    await client.query('BEGIN')
    const campaign=(await client.query(`SELECT configuration_revision,offer_type,status,search_configuration FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[input.campaignId,input.organizationId])).rows[0]
    if(!campaign)throw failure('radar_campaign_not_found',404)
    if(campaign.configuration_revision!==input.configurationRevision)throw failure('radar_campaign_configuration_changed')
    if(['paused','archived','completed'].includes(campaign.status))throw failure('radar_campaign_inactive')
    // Revalidate the full destination inside this transaction; client-provided IDs are not authorization.
    const destinations=await listRadarCrmDestinations(client as unknown as pg.Pool,user,input.organizationId)
    if(!destinations.some(item=>item.crmInstanceId===input.destination.crmInstanceId&&item.pipelineId===input.destination.pipelineId&&item.stageId===input.destination.stageId))throw failure('radar_crm_destination_invalid',403)
    const providers=(await client.query(`SELECT provider_key,public_config FROM public.platform_provider_connections WHERE environment='production' AND is_default=TRUE AND provider_key IN ('cnpja','brave_place','serper')`)).rows
    for(const candidateId of [...new Set(input.candidateIds)].sort()){
      const candidate=(await client.query(`SELECT candidate.*,review.approved_at,review.configuration_revision AS review_revision,
        review.target_status,review.verification_method,research.output AS research_output
        FROM public.radar_candidate_records candidate LEFT JOIN public.radar_b2b_reviews review ON review.candidate_id=candidate.id AND review.organization_id=candidate.organization_id AND review.campaign_id=candidate.campaign_id
        LEFT JOIN LATERAL(SELECT output FROM public.radar_candidate_research_runs run WHERE run.candidate_id=candidate.id AND run.organization_id=candidate.organization_id AND run.campaign_id=candidate.campaign_id AND run.configuration_revision=$4 AND run.status IN ('succeeded','partial') ORDER BY run.created_at DESC,run.id DESC LIMIT 1) research ON TRUE
        WHERE candidate.id=$1 AND candidate.organization_id=$2 AND candidate.campaign_id=$3 FOR UPDATE OF candidate`,[candidateId,input.organizationId,input.campaignId,input.configurationRevision])).rows[0]
      const block=(reason:string,leadId?:string,pipelineId?:string)=>items.push({candidateId,status:'blocked',reason,...(leadId?{leadId,pipelineId}:{})})
      if(!candidate){block('radar_candidate_not_found');continue}
      if(candidate.crm_lead_id){const linked=(await client.query('SELECT pipeline_id FROM public.leads WHERE id=$1 AND organization_id=$2',[candidate.crm_lead_id,input.organizationId])).rows[0];items.push({candidateId,status:'already_linked',leadId:candidate.crm_lead_id,pipelineId:linked?.pipeline_id});continue}
      const payload=candidate.normalized_payload as Record<string,unknown>
      const presence=candidate.research_output&&radarPublicPresenceFromDossier(candidate.research_output,input.configurationRevision,{name:String(payload.tradeName||candidate.title),legalName:typeof payload.legalName==='string'?payload.legalName:undefined,cnpj:typeof payload.cnpj==='string'?payload.cnpj:undefined})
      const data=projectRadarCompanyFacts({...payload,...(presence?{publicPresence:presence}: {})})
      const research=resolveRadarSearchConfiguration(campaign.search_configuration).research
      if(research.completion.enabled&&!radarQualityFromPayload(data,research,input.configurationRevision).readyForReview){block('radar_crm_completion_requirements_missing');continue}
      if(data.researchAssociationNeedsReview===true&&candidate.verification_method!=='manual'){block('radar_crm_review_required');continue}
      if(candidate.status!=='pending_review'||!candidate.approved_at||candidate.target_status!=='confirmed'||candidate.review_revision!==input.configurationRevision
        ||![Number(data.researchRevision??0),Number(data.discoveryRevision??1)].includes(input.configurationRevision)){
        block('radar_crm_review_required');continue
      }
      try{assertB2bDeliveryRights(candidate.source_type.startsWith('cnpja')?providers.find(row=>row.provider_key==='cnpja')?.public_config??{}:{clientDeliveryLicensed:true},
        providers.find(row=>row.provider_key==='brave_place')?.public_config,!!data.braveSourceUrl||data.researchUsesBrave===true,
        providers.find(row=>row.provider_key==='serper')?.public_config,data.researchUsesSerper===true)}
      catch(cause){block(cause instanceof Error?cause.message:'radar_crm_delivery_rights_required');continue}
      const facts=buildRadarCrmLeadFacts({title:candidate.title,normalizedPayload:data},campaign.offer_type)
      const companyKey=facts.attribution.radarCnpj??candidateId
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-crm:${input.organizationId}:${companyKey}`])
      if(facts.attribution.radarCnpj){
        const duplicate=(await client.query(`SELECT id,pipeline_id FROM public.leads WHERE organization_id=$1 AND crm_instance_id=$2 AND attribution_context->>'radarCnpj'=$3 LIMIT 1`,[input.organizationId,input.destination.crmInstanceId,facts.attribution.radarCnpj])).rows[0]
        if(duplicate){block('radar_crm_company_already_exists',duplicate.id,duplicate.pipeline_id);continue}
      }
      const evidence=(await client.query(`SELECT kind,value,source_url,observed_at FROM public.radar_b2b_evidence WHERE candidate_id=$1 AND organization_id=$2 ORDER BY observed_at DESC LIMIT 100`,[candidateId,input.organizationId])).rows
      const lead=(await client.query(`INSERT INTO public.leads(organization_id,crm_instance_id,pipeline_id,stage_id,name,email,phone,company,source,source_kind,status,score,notes,last_activity_at,attribution_context,stage)
        VALUES($1,$2,$3,$4,$5,$6,$7,$5,'Radar Comercial','manual','open',0,$8,NOW(),$9::jsonb,'NEW') RETURNING id`,
        [input.organizationId,input.destination.crmInstanceId,input.destination.pipelineId,input.destination.stageId,facts.name,facts.email,facts.phone,facts.notes,
          JSON.stringify({...facts.attribution,radarCandidateId:candidateId,radarCampaignId:input.campaignId,evidence,reviewedBy:user.id,deliveryRequestId:input.requestId,configurationRevision:input.configurationRevision})])).rows[0]
      await client.query(`UPDATE public.radar_candidate_records SET crm_lead_id=$3::uuid,normalized_payload=normalized_payload||jsonb_build_object('crmLeadId',($3::uuid)::text),updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[candidateId,input.organizationId,lead.id])
      items.push({candidateId,status:'created',leadId:lead.id,pipelineId:input.destination.pipelineId})
    }
    await client.query('COMMIT')
    return{items}
  }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
