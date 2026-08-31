import { describe, expect, it } from 'vitest'
import { compileCompositePlan, type CompositeArtifactBinding } from '../src/modules/action-engine/composite-plan.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { createCapabilityManifest } from '../src/modules/action-engine/capability-manifest.js'
import { createPublishedPackRegistry } from '../src/modules/action-engine/pack-registry.js'
import { resolvePackSelection } from '../src/modules/action-engine/pack-resolver.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from '../src/modules/action-engine/packs/campaign-launch-v1.js'
import { FUNNEL_NURTURE_PACK_V1 } from '../src/modules/action-engine/packs/funnel-nurture-v1.js'
import type { CompiledMissionPlan } from '../src/modules/action-engine/planner.js'
import { compileSupervisorPlan } from '../src/modules/action-engine/planner.js'
import type { ActionPackVersion } from '../src/modules/action-engine/action-pack.js'

const missionId='00000000-0000-4000-8000-000000000001';const sourceId='source-1'
const registry=createActionEngineCapabilityRegistry();const catalog=createPublishedPackRegistry([FUNNEL_NURTURE_PACK_V1,CAMPAIGN_LAUNCH_PACK_V1]).list()
const selections=resolvePackSelection({requested:[FUNNEL_NURTURE_PACK_V1,CAMPAIGN_LAUNCH_PACK_V1].map(pack=>({key:pack.key,semanticVersion:pack.semanticVersion,contentHash:pack.contentHash})),catalog,entitledModules:['crm','automations','funnel_nurture_agent','campaigns','landing_pages','campaign_launch_agent'],availableCapabilities:registry.listMetadata().map(item=>({key:item.key,version:item.version}))})
const funnel=plan('funnel_nurture',FUNNEL_NURTURE_PACK_V1.semanticVersion,FUNNEL_NURTURE_PACK_V1.contentHash,[['pack.publish_funnel','crm.pipeline.publish']],{totalExecutionCost:'100',aiAndProviderCost:'10',mediaCost:'0',humanHours:'1',humanCost:'90'})
const campaign=plan('campaign_launch',CAMPAIGN_LAUNCH_PACK_V1.semanticVersion,CAMPAIGN_LAUNCH_PACK_V1.contentHash,[['pack.draft_campaign','campaign.create_draft']],{totalExecutionCost:'500',aiAndProviderCost:'20',mediaCost:'400',humanHours:'1',humanCost:'80'})
const binding:CompositeArtifactBinding={fromPack:'funnel_nurture',artifactKey:'crm.funnel',fromStepKey:'pack.publish_funnel',outputPath:'versionId',toPack:'campaign_launch',toStepKey:'pack.draft_campaign',inputKey:'funnelVersionId',schemaVersion:1}

describe('immutable composite plan compiler',()=>{
  it('namespaces protected steps, pins packs/binding and sums economics into one hash',()=>{
    const campaignWithBinding={...campaign,steps:campaign.steps.map(step=>({...step,parameters:{sourceVersionId:'binding:pack.previous.versionId'}}))}
    const result=compileCompositePlan({missionId,selections,plans:[funnel,campaignWithBinding],bindings:[binding],contextHash:'a'.repeat(64),sourceIds:[sourceId],allowedSourceIds:[sourceId],maxTotalCostBrl:'700'})
    expect(result.packs.map(item=>item.key)).toEqual(['funnel_nurture','campaign_launch'])
    expect(result.steps.map(item=>item.stepKey)).toEqual(['funnel_nurture.pack.publish_funnel','campaign_launch.pack.draft_campaign'])
    expect(result.steps[1]?.dependsOn).toContain('funnel_nurture.pack.publish_funnel')
    expect(result.steps[1]?.parameters).toMatchObject({sourceVersionId:'binding:campaign_launch.pack.previous.versionId'})
    expect(result.aggregateEconomics).toMatchObject({totalExecutionCost:'600',mediaCost:'400',humanHours:'2'})
    expect(result.planHash).toMatch(/^[a-f0-9]{64}$/)
  })
  it('rejects undeclared/cyclic bindings, escalation, budget overflow and an outside source',()=>{
    expect(()=>compileCompositePlan({missionId,selections,plans:[funnel,campaign],bindings:[{...binding,artifactKey:'unknown'}],contextHash:'a'.repeat(64),sourceIds:[sourceId],allowedSourceIds:[sourceId],maxTotalCostBrl:'700'})).toThrow('mission_composite_binding_producer_undeclared')
    const cyclicSelections=selections.map(item=>item.key==='funnel_nurture'?{...item,consumesArtifacts:[{key:'campaign.launch',schemaVersion:1,optional:false}]}:item)
    expect(()=>compileCompositePlan({missionId,selections:cyclicSelections,plans:[funnel,campaign],bindings:[binding,{fromPack:'campaign_launch',artifactKey:'campaign.launch',fromStepKey:'pack.draft_campaign',outputPath:'versionId',toPack:'funnel_nurture',toStepKey:'pack.publish_funnel',inputKey:'campaignVersionId',schemaVersion:1}],contextHash:'a'.repeat(64),sourceIds:[sourceId],allowedSourceIds:[sourceId],maxTotalCostBrl:'700'})).toThrow('mission_composite_pack_cycle')
    expect(()=>compileCompositePlan({missionId,selections,plans:[funnel,{...campaign,steps:[{...campaign.steps[0]!,capabilityKey:'email.message.queue'}]}],bindings:[binding],contextHash:'a'.repeat(64),sourceIds:[sourceId],allowedSourceIds:[sourceId],maxTotalCostBrl:'700'})).toThrow('mission_composite_capability_escalation')
    expect(()=>compileCompositePlan({missionId,selections,plans:[funnel,campaign],bindings:[binding],contextHash:'a'.repeat(64),sourceIds:[sourceId],allowedSourceIds:[sourceId],maxTotalCostBrl:'599.99'})).toThrow('mission_composite_budget_exceeded')
    expect(()=>compileCompositePlan({missionId,selections,plans:[funnel,campaign],bindings:[binding],contextHash:'a'.repeat(64),sourceIds:['other'],allowedSourceIds:[sourceId],maxTotalCostBrl:'700'})).toThrow('mission_plan_source_not_allowed')
  })
  it('recompiles a namespaced supervisor proposal pack by pack before composing it',()=>{
    const first=minimalPack('foundation','a'.repeat(64),{consumes:[],produces:[{key:'shared.artifact',schemaVersion:1}]})
    const second=minimalPack('activation','b'.repeat(64),{consumes:[{key:'shared.artifact',schemaVersion:1,optional:false}],produces:[]})
    const economics={currency:'BRL',aiAndProviderCost:'1',mediaCost:'0',humanHours:'0',humanCost:'0',totalExecutionCost:'1'}
    const result=compileSupervisorPlan({
      rawProposal:{kind:'plan',interpretation:{},questions:[],sourceIds:[sourceId],selectedPacks:[
        {key:first.key,version:first.semanticVersion,contentHash:first.contentHash},
        {key:second.key,version:second.semanticVersion,contentHash:second.contentHash},
      ],plan:{schemaVersion:1,missionId,actionPack:{key:'composite',version:'1.0.0',templateHash:'c'.repeat(64)},resolvedParameters:{
        packParameters:{foundation:{},activation:{}},packEconomics:{foundation:economics,activation:economics},
        artifactBindings:[{fromPack:'foundation',artifactKey:'shared.artifact',fromStepKey:'pack.evaluate',outputPath:'result',toPack:'activation',toStepKey:'pack.evaluate',inputKey:'foundationResult',schemaVersion:1}],
      },deviations:[],rationale:'Composição governada.',assumptions:[],risks:[],estimatedEconomics:{...economics,totalExecutionCost:'2'},steps:[
        wireStep('foundation.pack.evaluate'),wireStep('activation.pack.evaluate'),
      ]}},missionId,packCatalog:[first,second],registry,maxTotalCostBrl:'10',allowedSourceIds:[sourceId],contextHash:'d'.repeat(64),capabilityCatalogHash:'e'.repeat(64),expectedCapabilityCatalogHash:'e'.repeat(64),autonomyEnvelope:{mode:'prepare',allowedModules:[],allowedCapabilityKeys:[],maxTotalCostBrl:'10',maxHumanHours:'1',expiresAt:'2099-01-01T00:00:00.000Z',alwaysRequireApprovalFor:[]},
    })
    expect(result.kind).toBe('plan')
    if(result.kind!=='plan')throw new Error('expected_plan')
    expect(result.compiled.packKey).toBe('composite')
    expect(result.compiled.packs?.map(item=>item.key)).toEqual(['foundation','activation'])
    expect(result.compiled.steps[1]?.dependsOn).toContain('foundation.pack.evaluate')
    expect(result.compiled.estimatedEconomics.totalExecutionCost).toBe('2')
  })
})

function plan(packKey:string,packVersion:string,packContentHash:string,steps:Array<[string,string]>,economics:Record<string,unknown>):CompiledMissionPlan{
  const manifest=createCapabilityManifest(registry,steps.map(([,key])=>({key,version:1})))
  return{missionId,packKey,packVersion,packContentHash,planHash:'f'.repeat(64),capabilityManifest:manifest.entries,capabilityManifestHash:manifest.hash,parameters:{},deviations:[],estimatedEconomics:{currency:'BRL',aiAndProviderCost:String(economics.aiAndProviderCost),mediaCost:String(economics.mediaCost),humanHours:String(economics.humanHours),humanCost:String(economics.humanCost),totalExecutionCost:String(economics.totalExecutionCost)},steps:steps.map(([stepKey,capabilityKey])=>({stepKey,capabilityKey,capabilityVersion:1,capabilityDefinitionHash:manifest.entries.find(item=>item.key===capabilityKey)!.definitionHash,dependsOn:[],parameters:{},approvalRequired:true,protected:true,timeoutSeconds:300,maxAttempts:1,outputBindings:{}}))}
}

function minimalPack(key:string,contentHash:string,artifactContract:NonNullable<ActionPackVersion['artifactContract']>):ActionPackVersion{return{key,semanticVersion:'1.0.0',schemaVersion:1,outcomeType:key,status:'published',parameterSchema:{},readinessSpec:{requiredModules:[]},topologyTemplate:{steps:[{stepKey:'pack.evaluate',capabilityKey:'system.evaluation.checkpoint',capabilityVersion:1,dependsOn:[],approvalRequired:false,protected:true,defaultParameters:{checkpointKey:key,targetRevenueBrl:'0'}}]},protectedStepKeys:['pack.evaluate'],extensionPoints:[],allowedCapabilities:[{key:'system.evaluation.checkpoint',versions:[1],required:true}],metricSpec:{},economicsSpec:{},policyDefaults:{},artifactContract,contentHash}}
function wireStep(stepKey:string){return{stepKey,dependsOn:[],capabilityKey:'system.evaluation.checkpoint',capabilityVersion:1,input:{checkpointKey:stepKey.split('.')[0],targetRevenueBrl:'0'},timeoutSeconds:300,maxAttempts:1,approvalRequired:false,effect:'none',outputBindings:{}}}
