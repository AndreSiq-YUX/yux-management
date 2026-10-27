import { expect, it } from 'vitest'
import { z } from 'zod'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { systemReadinessCheck } from '../src/modules/action-engine/capabilities/system.js'
import { CapabilityRegistry } from '../src/modules/action-engine/capability-registry.js'
import { assertPinnedCapabilityAvailable, createCapabilityManifest } from '../src/modules/action-engine/capability-manifest.js'
import { compileMissionPlan } from '../src/modules/action-engine/planner.js'
import { CRM_PREPARATION_PACK_V1 as pack } from '../src/modules/action-engine/packs/crm-preparation-v1.js'
import { crmPreparationProposal } from './support/crm-preparation-fixture.js'

it('preserves the legacy readiness version and its pinned definition hash', () => {
 const legacyRegistry=new CapabilityRegistry().register({...systemReadinessCheck,inputSchema:z.object({contractId:z.string().uuid().optional(),requiredModules:z.array(z.string().min(1)).default([]),requiredConnections:z.array(z.string().min(1)).default([])})} as typeof systemReadinessCheck)
 const pinned=createCapabilityManifest(legacyRegistry,[{key:'system.readiness.check',version:1}]).entries[0]!
 expect(()=>assertPinnedCapabilityAvailable(createActionEngineCapabilityRegistry(),pinned)).not.toThrow()
})
for (const change of ['extra_step','removed_dependency','unsafe_readiness'] as const) it(`rejects ${change} at the preparation compiler boundary`, () => {
 const missionId='00000000-0000-4000-8000-000000000001'
 const raw=crmPreparationProposal(missionId,'00000000-0000-4000-8000-000000000002').plan
 if(change==='extra_step') raw.steps.push({...raw.steps[4]!,stepKey:'extra.email'})
 if(change==='removed_dependency') raw.steps[7]!.dependsOn=[]
 if(change==='unsafe_readiness') raw.steps[0]!.input={requiredModules:[],requiredConnections:[],preparationOnly:false}
 expect(()=>compileMissionPlan({missionId,rawPlan:raw,pack,registry:createActionEngineCapabilityRegistry(),maxTotalCostBrl:'0'})).toThrow('crm_preparation_topology_invalid')
})
