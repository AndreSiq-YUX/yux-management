import { loadMissionCommandResult, missionArtifactHash, saveMissionCommandResult, type MissionCommandContext, type MissionCommandQueryable } from '../action-engine/mission-command.js'
import { recordDomainEvent } from '../events/repository.js'

type Result={entityId:string;versionId:string;status:'draft';contentHash:string;evidence:Record<string,unknown>}

export async function createLandingPageDraft(client:MissionCommandQueryable,context:MissionCommandContext,input:{name:string;slug:string;title:string;primaryCtaType:'form'|'whatsapp'|'phone'|'external_url';primaryCtaValue:string;content:Record<string,unknown>;campaignId?:string}):Promise<Result>{
  const key='landing_page.create_draft';const prior=await loadMissionCommandResult<Result>(client,context,key);if(prior)return prior
  if(!input.name.trim()||!/^[a-z0-9-]+$/.test(input.slug)||!input.title.trim())throw new Error('landing_page_draft_invalid')
  const contract=await client.query<{contract_id:string;client_id:string}>(`SELECT contract.id AS contract_id,contract.client_id FROM public.action_missions mission JOIN public.contracts contract ON contract.id=mission.contract_id AND contract.status='active' JOIN public.organizations organization ON organization.id=mission.organization_id AND organization.client_id=contract.client_id JOIN public.contract_modules module ON module.contract_id=contract.id AND module.module_key='landing_pages' AND module.enabled=TRUE WHERE mission.id=$1 AND mission.organization_id=$2 LIMIT 1`,[context.missionId,context.organizationId]);if(!contract.rows[0])throw new Error('landing_page_contract_not_entitled')
  const hash=missionArtifactHash({title:input.title,content:input.content,primaryCtaType:input.primaryCtaType,primaryCtaValue:input.primaryCtaValue})
  const page=await client.query<{id:string}>(`INSERT INTO public.landing_pages (organization_id,client_id,contract_id,campaign_id,name,slug,status,primary_cta_type,primary_cta_value,preview_url,metadata) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10) RETURNING id`,[context.organizationId,contract.rows[0].client_id,contract.rows[0].contract_id,input.campaignId??null,input.name.trim(),input.slug,input.primaryCtaType,input.primaryCtaValue,`/landing-preview/${input.slug}`,{missionId:context.missionId,contentHash:hash}]);const pageId=required(page.rows[0]?.id)
  const version=await client.query<{id:string}>(`INSERT INTO public.landing_page_versions (landing_page_id,version_number,title,status,preview_url,content_snapshot,internal_only) VALUES ($1,1,$2,'draft',$3,$4,TRUE) RETURNING id`,[pageId,input.title,`/landing-preview/${input.slug}`,input.content]);const versionId=required(version.rows[0]?.id)
  const result={entityId:pageId,versionId,status:'draft' as const,contentHash:hash,evidence:{previewOnly:true,published:false}}
  await recordDomainEvent(client as never,{eventType:'mission.landing_page_draft_created',organizationId:context.organizationId,aggregateType:'mission',aggregateId:context.missionId,actor:{type:'user',id:context.actorId},payload:{missionId:context.missionId,actionRunId:context.actionRunId,pageId,versionId,contentHash:hash}})
  return saveMissionCommandResult(client,context,key,result)
}

export async function createLeadFormDraft(client:MissionCommandQueryable,context:MissionCommandContext,input:{landingPageId:string;name:string;submitLabel:string;successMessage:string;consentCode:string;consentVersion:string;privacyPolicyVersion:string;fields:Array<{fieldName:string;crmFieldKey:string;required:boolean}>}):Promise<Result>{
  const key='lead_form.configure_draft';const prior=await loadMissionCommandResult<Result>(client,context,key);if(prior)return prior
  if(input.fields.length<2||!input.consentCode||!input.consentVersion||!input.privacyPolicyVersion)throw new Error('lead_form_consent_invalid')
  const page=await client.query<{id:string}>(`SELECT page.id FROM public.landing_pages page JOIN public.action_missions mission ON mission.contract_id=page.contract_id WHERE page.id=$1 AND page.organization_id=$2 AND mission.id=$3 LIMIT 1`,[input.landingPageId,context.organizationId,context.missionId]);if(!page.rows[0])throw new Error('landing_page_draft_not_found')
  const payload={name:input.name,submitLabel:input.submitLabel,successMessage:input.successMessage,consentCode:input.consentCode,consentVersion:input.consentVersion,privacyPolicyVersion:input.privacyPolicyVersion,fields:input.fields};const hash=missionArtifactHash(payload)
  const form=await client.query<{id:string}>(`INSERT INTO public.landing_page_forms (landing_page_id,name,submit_label,success_message,metadata,is_active) VALUES ($1,$2,$3,$4,$5,FALSE) RETURNING id`,[input.landingPageId,input.name,input.submitLabel,input.successMessage,{consentCode:input.consentCode,consentVersion:input.consentVersion,privacyPolicyVersion:input.privacyPolicyVersion,missionId:context.missionId,contentHash:hash}]);const formId=required(form.rows[0]?.id)
  for(const field of input.fields)await client.query(`INSERT INTO public.landing_page_field_mappings (form_id,field_name,crm_field_key,required) VALUES ($1,$2,$3,$4)`,[formId,field.fieldName,field.crmFieldKey,field.required])
  const result={entityId:formId,versionId:formId,status:'draft' as const,contentHash:hash,evidence:{fieldCount:input.fields.length,active:false,consentVersion:input.consentVersion}}
  return saveMissionCommandResult(client,context,key,result)
}
function required(value?:string){if(!value)throw new Error('landing_page_mission_persistence_failed');return value}
