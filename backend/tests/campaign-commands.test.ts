import { describe, expect, it } from 'vitest'
import { buildProviderMutationIdempotencyKey, executeProviderAdapter } from '../src/lib/edge-compat/adsProvider.js'
import { validateCampaignLaunchArtifact, type CampaignLaunchArtifact } from '../src/modules/campaigns/repository.js'

const valid:CampaignLaunchArtifact={name:'Captação imobiliária',objective:'lead_generation',offer:'Avaliação consultiva',audience:{region:'SP'},platform:'meta',providerConnectionId:'00000000-0000-4000-8000-000000000001',dailyBudgetBrl:'50',totalBudgetBrl:'500',startsAt:'2026-09-01T00:00:00.000Z',creatives:[{format:'image',headline:'Encontre seu imóvel',body:'Converse com um especialista.',sourceIds:['kb-brand']}],landingPageId:'00000000-0000-4000-8000-000000000002',leadFormId:'00000000-0000-4000-8000-000000000003',trackingPlan:{utm_source:'meta',utm_medium:'paid_social',utm_campaign:'imoveis'},sourceIds:['kb-offer','kb-brand']}

describe('campaign mission command invariants',()=>{
  it('accepts only grounded, tracked artifacts inside a coherent budget',()=>{
    expect(validateCampaignLaunchArtifact(valid).sourceIds).toEqual(['kb-brand','kb-offer'])
    expect(()=>validateCampaignLaunchArtifact({...valid,totalBudgetBrl:'10'})).toThrow('campaign_budget_invalid')
    expect(()=>validateCampaignLaunchArtifact({...valid,trackingPlan:{}})).toThrow('campaign_tracking_invalid')
    expect(()=>validateCampaignLaunchArtifact({...valid,creatives:[{...valid.creatives[0]!,sourceIds:[]}]})).toThrow('campaign_creatives_invalid')
  })
  it('scopes provider mutation idempotency by action',()=>{
    expect(buildProviderMutationIdempotencyKey({provider:'meta',action:'create_campaign',localMutationId:'run'})).not.toBe(buildProviderMutationIdempotencyKey({provider:'meta',action:'activate_campaign',localMutationId:'run'}))
  })
  it('activates an existing Meta campaign without exposing the access token',async()=>{
    let requestBody='';const response=await executeProviderAdapter({provider:'meta',action:'activate_campaign',localMutationId:'activation-1',requestPayload:{accessToken:'top-secret',adAccountId:'123',externalCampaignId:'provider-campaign-1'},fetcher:async(_url,init)=>{requestBody=String(init?.body);return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}})}})
    expect(response.status).toBe('succeeded');expect(requestBody).toContain('status=ACTIVE');expect(JSON.stringify(response)).not.toContain('top-secret')
  })
})
