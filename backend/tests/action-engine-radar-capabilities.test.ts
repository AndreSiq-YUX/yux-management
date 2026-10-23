import { expect,it } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import type { CapabilityContext } from '../src/modules/action-engine/capability-registry.js'

const ctx:CapabilityContext={organizationId:'10000000-0000-4000-8000-000000000001',missionId:'80000000-0000-4000-8000-000000000001',actionRunId:'80000000-0000-4000-8000-000000000002',actor:{type:'user',id:'40000000-0000-4000-8000-000000000001'},idempotencyKey:'test',dryRun:true,query:async()=>({rows:[]})}
it('simulates Radar campaign creation without producing an effect',async()=>{
 const registry=createActionEngineCapabilityRegistry()
 const result=await registry.invoke('radar.campaign.create',1,ctx,{name:'Campanha Radar',targetSegment:'Clínicas',targetStates:['BA'],offerType:'Serviços'})
 expect(result.effectProduced).toBe(false)
 expect(result.output).toMatchObject({preview:true,researchStarted:false})
})
it('requires explicit approval for paid research and never enables autonomous research in v1',()=>{
 const meta=createActionEngineCapabilityRegistry().listMetadata().find(x=>x.key==='radar.capture.start')
 expect(meta).toMatchObject({approval:'always',effect:'external',idempotency:'required',requiredModules:['radar']})
 expect(meta?.supportsModes).not.toContain('autonomous')
 expect(meta?.supportsModes).toEqual(['assisted'])
})
it('fails closed when a worker has no trusted mission command bridge',async()=>{
 const registry=createActionEngineCapabilityRegistry()
 await expect(registry.invoke('radar.capture.start',1,{...ctx,dryRun:false},{campaignId:ctx.missionId,configurationRevision:1,requestedCount:100,approvalSubjectHash:'a'.repeat(64)})).rejects.toThrow('radar_mission_command_unavailable')
})
