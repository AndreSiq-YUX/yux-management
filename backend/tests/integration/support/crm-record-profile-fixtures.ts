import { randomUUID } from 'node:crypto'
import type { IntegrationRig } from './rig.js'
import { fixtureIds, fixtureUsers } from './fixtures.js'

export async function createRecordProfileFixture(rig: IntegrationRig) {
  // The shared integration seed intentionally leaves CRM governance to each test.
  const existing = await rig.sql('SELECT id FROM public.crm_instances WHERE contract_id = $1', [fixtureIds.contractA])
  const instanceId: string = existing.rows[0]?.id || randomUUID()
  await rig.sql(`INSERT INTO public.crm_instances
    (id, organization_id, contract_id, status, max_custom_field_count, allow_client_field_customization)
    VALUES ($1, $2, $3, 'active', 20, true)
    ON CONFLICT (id) DO UPDATE SET status = 'active', max_custom_field_count = 20, allow_client_field_customization = true`,
  [instanceId, fixtureIds.organizationA, fixtureIds.contractA])
  await rig.sql(`INSERT INTO public.crm_instance_members (crm_instance_id, user_id, role, status)
    VALUES ($1, $2, 'client_admin', 'active'), ($1, $3, 'seller', 'active')
    ON CONFLICT (crm_instance_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
  [instanceId, fixtureUsers.client_admin_A.id, fixtureUsers.client_member_A.id])
  const pipelines = await rig.sql("SELECT id FROM public.crm_pipelines WHERE organization_id = $1 AND name = 'Clientes comerciais'", [fixtureIds.organizationA])
  const pipelineId: string = pipelines.rows[0]?.id || randomUUID()
  await rig.sql(`INSERT INTO public.crm_pipelines (id, organization_id, crm_instance_id, name, is_default, is_active)
    VALUES ($1, $2, $3, 'Clientes comerciais', true, true)
    ON CONFLICT (id) DO UPDATE SET crm_instance_id = EXCLUDED.crm_instance_id, is_active = true`, [pipelineId, fixtureIds.organizationA, instanceId])
  const stages = await rig.sql("SELECT id FROM public.crm_pipeline_stages WHERE pipeline_id = $1 AND key = 'new'", [pipelineId])
  const stageId: string = stages.rows[0]?.id || randomUUID()
  await rig.sql(`INSERT INTO public.crm_pipeline_stages (id, pipeline_id, key, name, color, order_index, is_active)
    VALUES ($1, $2, 'new', 'Novo lead', '#2563eb', 0, true) ON CONFLICT (id) DO NOTHING`, [stageId, pipelineId])
  return { instanceId, pipelineId, stageId, organizationId: fixtureIds.organizationA }
}
