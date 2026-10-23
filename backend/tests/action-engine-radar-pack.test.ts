import { expect, it } from 'vitest'
import { RADAR_PROSPECTING_PACK_V1, createRadarProspectingPlan } from '../src/modules/action-engine/packs/radar-prospecting-v1.js'
import { resolvePlanInputBindings, collectPlanInputBindingSteps } from '../src/modules/action-engine/plan-input-bindings.js'
import { compileMissionPlan } from '../src/modules/action-engine/planner.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'

it('keeps research protected, approved, and separate from saving a campaign', () => {
 const pack=RADAR_PROSPECTING_PACK_V1
 expect(pack.policyDefaults.mode).toBe('assisted')
 expect(pack.metricSpec.primary).toContainEqual({key:'companies_found',unit:'count'})
 const plan=createRadarProspectingPlan({campaign:{existingCampaignId:'00000000-0000-4000-8000-000000000001'},requestedCount:10})
 expect(plan.steps.map(s=>s.capabilityKey)).toEqual(['radar.campaign.inspect','radar.campaign.create','radar.capture.preflight','radar.capture.start','radar.operation.await','radar.results.inspect','system.evaluation.checkpoint'])
 expect(plan.steps.find(s=>s.capabilityKey==='radar.capture.start')?.approvalRequired).toBe(true)
 expect(pack.allowedCapabilities.some(s=>s.key.startsWith('campaign.provider'))).toBe(false)
})
it('rejects a model changing the displayed campaign or protected research bindings',()=>{
 const registry=createActionEngineCapabilityRegistry(),pack=RADAR_PROSPECTING_PACK_V1
 const parameters={campaign:{existingCampaignId:'00000000-0000-4000-8000-000000000001'},requestedCount:10}
 const raw={schemaVersion:1,missionId:'mission',actionPack:{key:pack.key,version:pack.semanticVersion,templateHash:pack.contentHash},resolvedParameters:parameters,estimatedEconomics:{currency:'BRL',totalExecutionCost:'1'},steps:pack.topologyTemplate.steps.map(step=>({stepKey:step.stepKey,capabilityKey:step.capabilityKey,capabilityVersion:1,dependsOn:step.dependsOn,input:step.defaultParameters,timeoutSeconds:60,maxAttempts:2,approvalRequired:step.approvalRequired,effect:registry.get(step.capabilityKey,1).effect}))}
 expect(()=>compileMissionPlan({rawPlan:raw,missionId:'mission',pack,registry,maxTotalCostBrl:'50'})).not.toThrow()
 const altered=structuredClone(raw);altered.steps.find(s=>s.capabilityKey==='radar.capture.start')!.input={...altered.steps[3].input,requestedCount:999}
 expect(()=>compileMissionPlan({rawPlan:altered,missionId:'mission',pack,registry,maxTotalCostBrl:'50'})).toThrow('radar_plan_protected_input_changed')
})
it('resolves nested commercial outputs and validates their real types before execution',()=>{
 const input={configurationRevision:'binding:pack.campaign.output.configurationRevision',approvalSubjectHash:'binding:pack.preflight.output.approvalSubjectHash'}
 expect(collectPlanInputBindingSteps(input)).toEqual(['pack.campaign','pack.preflight'])
 expect(resolvePlanInputBindings(input,{resolvedParameters:{},outputsByStep:{'pack.campaign':{output:{configurationRevision:2}},'pack.preflight':{output:{approvalSubjectHash:'a'.repeat(64)}}}})).toEqual({configurationRevision:2,approvalSubjectHash:'a'.repeat(64)})
})
