import { randomUUID } from 'node:crypto'
import { fixtureUsers } from './fixtures.js'
import type { IntegrationRig } from './rig.js'

export async function seedRadarMissionAction(rig:IntegrationRig,key='radar.campaign.create',input:unknown={}) {
  const missionId=randomUUID(),planId=randomUUID(),stepId=randomUUID(),actionRunId=randomUUID()
  await rig.sql(`INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE)
    ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[rig.ids.contractA])
  await rig.sql(`INSERT INTO public.action_missions(id,organization_id,contract_id,pack_version_id,title,objective,status,mode,created_by,autonomy_envelope,create_idempotency_key)
    SELECT $1::uuid,organization_id,contract_id,pack_version_id,'Radar test','Pesquisar empresas','active','assisted',$2,$3::jsonb,$1::uuid::text
    FROM public.action_missions WHERE id=$4`,[missionId,fixtureUsers.yux_admin.id,JSON.stringify({maxTotalCostBrl:'50',allowedModules:['radar']}),rig.ids.missionA])
  await rig.sql(`INSERT INTO public.action_plans(id,organization_id,mission_id,revision,status,pack_version_id,pack_content_hash,plan_hash)
    SELECT $1,organization_id,id,1,'active',pack_version_id,$2,$2 FROM public.action_missions WHERE id=$3`,[planId,'a'.repeat(64),missionId])
  await rig.sql(`INSERT INTO public.action_plan_steps(id,organization_id,plan_id,step_key,position,capability_key,capability_version)
    VALUES($1,$2,$3,'radar',0,$4,1)`,[stepId,rig.ids.organizationA,planId,key])
  await rig.sql(`INSERT INTO public.action_runs(id,organization_id,mission_id,plan_id,plan_step_id,status,idempotency_key,input)
    VALUES($1,$2,$3,$4,$5,'running',$6,$7::jsonb)`,[actionRunId,rig.ids.organizationA,missionId,planId,stepId,randomUUID(),JSON.stringify(input)])
  return{organizationId:rig.ids.organizationA,missionId,actionRunId,actorUserId:fixtureUsers.yux_admin.id,idempotencyKey:randomUUID()}
}
