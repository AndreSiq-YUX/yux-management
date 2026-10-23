import { expect, it } from 'vitest'
import { radarCapabilityInputSchemas, projectRadarMissionPreflight } from '../src/modules/radar/action-engine-contracts.js'
import { resolveRadarMissionActor } from '../src/modules/radar/action-engine-access.js'

const org='11111111-1111-4111-8111-111111111111'
const campaign='22222222-2222-4222-8222-222222222222'
const context={organizationId:org,missionId:org,actionRunId:campaign,actorUserId:org,idempotencyKey:'intent-1'}

it('does not allow the model to select a tenant or a technical research provider', () => {
  const input={name:'Campanha',targetSegment:'Clínicas',targetStates:['BA'],cities:[{city:'Salvador',state:'BA'}],offerType:'Serviços'}
  expect(radarCapabilityInputSchemas['radar.campaign.create'].safeParse(input).success).toBe(true)
  expect(radarCapabilityInputSchemas['radar.campaign.create'].safeParse({...input,organizationId:campaign}).success).toBe(false)
  expect(radarCapabilityInputSchemas['radar.campaign.create'].safeParse({...input,searchConfiguration:{provider:'secret'}}).success).toBe(false)
})

it('separates an existing-company refresh from discovery and refuses mixed revision requests', () => {
  const value={campaignId:campaign,criteriaRevision:2,candidateIds:[org],intent:'refresh'}
  expect(radarCapabilityInputSchemas['radar.research.request'].safeParse(value).success).toBe(true)
  expect(radarCapabilityInputSchemas['radar.research.request'].safeParse({...value,requestedCount:100}).success).toBe(false)
})

it('projects preflight blockers without internal diagnostics, preserving the exact approved quantity', () => {
  const output=projectRadarMissionPreflight({campaignId:campaign,configurationRevision:2,criteriaRevision:3,requestedCount:100},
    {allowed:false,stateId:'a'.repeat(64),blockers:[{code:'provider_secret_missing',message:'secret provider detail'}],researchCapacity:{estimatedMaximumCostBrl:5}},10)
  expect(output.allowed).toBe(false)
  expect(output.requestedCount).toBe(100)
  expect(output.blockers).toEqual(['A pesquisa precisa de uma configuração ou autorização do administrador.'])
  expect(JSON.stringify(output)).not.toContain('provider')
  expect(output.approvalSubjectHash).toMatch(/^[a-f0-9]{64}$/)
})

it.each(['yux_operator','client_admin','client_member'])('does not promote %s to global administrator',async(role)=>{
  const pool={query:async()=>({rows:[{id:org,role,is_active:true,created_by:org,organization_id:org,status:'active',mode:'assisted'}]})}
  await expect(resolveRadarMissionActor(pool as never,context)).rejects.toThrow('radar_mission_actor_forbidden')
})

it('rejects a cross-tenant mission even for a global administrator',async()=>{
  const pool={query:async()=>({rows:[{id:org,role:'yux_admin',is_active:true,created_by:org,organization_id:campaign,status:'active',mode:'assisted'}]})}
  await expect(resolveRadarMissionActor(pool as never,context)).rejects.toThrow('radar_mission_scope_forbidden')
})
