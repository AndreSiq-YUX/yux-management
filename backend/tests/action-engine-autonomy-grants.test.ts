import { describe, expect, it } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import type { CapabilityRegistry } from '../src/modules/action-engine/capability-registry.js'
import { deriveAutonomyGrantStatus, hashAutonomyEnvelope, validateAutonomyGrantApproval, validateAutonomyGrantEnvelope } from '../src/modules/action-engine/autonomy-grants.js'
import type { AutonomyEnvelope, AutonomyGrant } from '../src/modules/action-engine/types.js'

const registry = createActionEngineCapabilityRegistry()
const now = new Date('2026-08-30T12:00:00.000Z')
const missionEnvelope: AutonomyEnvelope = {
  mode:'autonomous',allowedModules:['campaigns','landing_pages'],allowedCapabilityKeys:['campaign.provider.pause'],
  maxTotalCostBrl:'1000',maxHumanHours:'8',maxExternalContacts:100,expiresAt:'2026-09-30T12:00:00.000Z',alwaysRequireApprovalFor:['destructive'],
}

describe('governed autonomy grants',()=>{
  it('accepts an exact or reduced time-bound scope and hashes every material field',()=>{
    const requested={...missionEnvelope,maxTotalCostBrl:'500',maxHumanHours:'4',maxExternalContacts:50,expiresAt:'2026-09-15T12:00:00.000Z'}
    expect(()=>validateAutonomyGrantEnvelope({requested,missionEnvelope,registry,startsAt:now.toISOString(),now})).not.toThrow()
    const first=hashAutonomyEnvelope({missionId:'mission-1',missionVersion:3,envelope:requested,startsAt:now.toISOString(),expiresAt:requested.expiresAt})
    const again=hashAutonomyEnvelope({missionId:'mission-1',missionVersion:3,envelope:{...requested},startsAt:now.toISOString(),expiresAt:requested.expiresAt})
    const changed=hashAutonomyEnvelope({missionId:'mission-1',missionVersion:3,envelope:{...requested,maxTotalCostBrl:'501'},startsAt:now.toISOString(),expiresAt:requested.expiresAt})
    expect(first).toMatch(/^[a-f0-9]{64}$/);expect(again).toBe(first);expect(changed).not.toBe(first)
  })

  it.each([
    [{maxTotalCostBrl:'1000.01'},'autonomy_grant_budget_exceeds_mission'],
    [{maxHumanHours:'8.01'},'autonomy_grant_human_hours_exceeds_mission'],
    [{maxExternalContacts:101},'autonomy_grant_contacts_exceed_mission'],
    [{allowedModules:['campaigns','crm']},'autonomy_grant_module_exceeds_mission'],
    [{allowedCapabilityKeys:['provider.invented']},'autonomy_grant_capability_exceeds_mission'],
    [{expiresAt:'2026-10-01T00:00:00.000Z'},'autonomy_grant_expiry_exceeds_mission'],
  ])('rejects scope expansion %#',(change,error)=>{
    expect(()=>validateAutonomyGrantEnvelope({requested:{...missionEnvelope,...change},missionEnvelope,registry,startsAt:now.toISOString(),now})).toThrow(error)
  })

  it('rejects unknown and destructive capabilities even when the mission envelope names them',()=>{
    const openEnvelope={...missionEnvelope,allowedCapabilityKeys:[]}
    expect(()=>validateAutonomyGrantEnvelope({requested:{...openEnvelope,allowedCapabilityKeys:['provider.invented']},missionEnvelope:openEnvelope,registry,startsAt:now.toISOString(),now})).toThrow('autonomy_grant_capability_unknown')
    const destructiveRegistry={listMetadata:()=>[{key:'data.erase',effect:'destructive'}]} as unknown as CapabilityRegistry
    expect(()=>validateAutonomyGrantEnvelope({requested:{...openEnvelope,allowedCapabilityKeys:['data.erase']},missionEnvelope:openEnvelope,registry:destructiveRegistry,startsAt:now.toISOString(),now})).toThrow('autonomy_grant_destructive_capability_forbidden')
  })

  it('requires exact approval hash and current mission version, then supports expiry and revocation precedence',()=>{
    const pending=grant()
    expect(()=>validateAutonomyGrantApproval(pending,{expectedMissionVersion:3,subjectHash:pending.envelopeHash,now})).not.toThrow()
    expect(()=>validateAutonomyGrantApproval(pending,{expectedMissionVersion:4,subjectHash:pending.envelopeHash,now})).toThrow('mission_version_conflict')
    expect(()=>validateAutonomyGrantApproval(pending,{expectedMissionVersion:3,subjectHash:'b'.repeat(64),now})).toThrow('autonomy_grant_subject_changed')
    expect(()=>validateAutonomyGrantApproval({...pending,expiresAt:'2026-08-30T11:59:59.000Z'},{expectedMissionVersion:3,subjectHash:pending.envelopeHash,now})).toThrow('autonomy_grant_expired')
    expect(deriveAutonomyGrantStatus([],'2026-09-01T00:00:00.000Z',now)).toBe('pending')
    expect(deriveAutonomyGrantStatus(['activated'],'2026-09-01T00:00:00.000Z',now)).toBe('active')
    expect(deriveAutonomyGrantStatus(['activated'],'2026-08-01T00:00:00.000Z',now)).toBe('expired')
    expect(deriveAutonomyGrantStatus(['activated','revoked'],'2026-08-01T00:00:00.000Z',now)).toBe('revoked')
  })
})

function grant():AutonomyGrant{return{id:'grant-1',organizationId:'org-1',missionId:'mission-1',grantVersion:1,missionVersion:3,envelope:missionEnvelope,envelopeHash:'a'.repeat(64),status:'pending',startsAt:now.toISOString(),expiresAt:'2026-09-01T00:00:00.000Z',requestedBy:'user-1',createdAt:now.toISOString()}}
