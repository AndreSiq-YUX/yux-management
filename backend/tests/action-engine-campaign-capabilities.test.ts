import { describe, expect, it } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'

const registry=createActionEngineCapabilityRegistry()
const uuid='00000000-0000-4000-8000-000000000001'
const source='00000000-0000-4000-8000-000000000002'
const hash='a'.repeat(64)
const context={organizationId:uuid,missionId:uuid,actionRunId:uuid,actor:{type:'user' as const,id:uuid},idempotencyKey:'idem',dryRun:true,query:async()=>({rows:[]})}

describe('campaign capability governance matrix',()=>{
  it('registers the complete campaign and acquisition capability set',()=>{
    const metadata=registry.listMetadata();const keys=metadata.map(item=>item.key)
    expect(keys).toEqual(expect.arrayContaining(['campaign.state.inspect','campaign.create_draft','marketing.creative.generate_draft','campaign.creative.attach_draft','landing_page.create_draft','lead_form.configure_draft','campaign.acquisition.attach_draft','campaign.tracking.validate','campaign.provider.create_paused','campaign.provider.activate','campaign.provider.pause']))
  })
  it('keeps draft capabilities available in every mode and external mutations out of shadow/prepare',()=>{
    expect(registry.get('campaign.create_draft',1).supportsModes).toEqual(['shadow','prepare','assisted','autonomous'])
    expect(registry.get('campaign.provider.create_paused',1)).toMatchObject({effect:'external',approval:'always',supportsModes:['assisted','autonomous'],recovery:{kind:'pausable'}})
    expect(registry.get('campaign.provider.activate',1)).toMatchObject({effect:'external',approval:'always',supportsModes:['assisted','autonomous']})
    expect(registry.get('campaign.provider.pause',1)).toMatchObject({effect:'external',approval:'risk_based',supportsModes:['assisted','autonomous']})
  })
  it('produces previews without command or provider effects in dry-run execution',async()=>{
    const draft=await registry.invoke('campaign.create_draft',1,context,{name:'Captação',objective:'lead_generation',offer:'Consultoria',audience:{region:'SP'},platform:'meta',providerConnectionId:uuid,dailyBudgetBrl:'50',totalBudgetBrl:'500',startsAt:'2026-09-01T00:00:00.000Z',creatives:[{format:'image',headline:'Imóveis',body:'Fale conosco',sourceIds:[source]}],trackingPlan:{utm_source:'meta',utm_medium:'paid',utm_campaign:'imoveis'},sourceIds:[source]})
    const provider=await registry.invoke('campaign.provider.create_paused',1,context,{versionId:uuid,expectedContentHash:hash,approvedSubjectHash:hash,maxTotalBudgetBrl:'500'})
    expect(draft.effectProduced).toBe(false);expect(draft.output).toMatchObject({preview:true,status:'draft',activated:false})
    expect(provider.effectProduced).toBe(false);expect(provider.output).toMatchObject({preview:true,status:'provider_paused',activated:false})
  })
  it('requires grounded creatives, consent fields and tracking',async()=>{
    await expect(registry.invoke('marketing.creative.generate_draft',1,context,{campaignVersionId:uuid,position:0,creative:{format:'image',headline:'H',body:'B',sourceIds:[]}})).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('lead_form.configure_draft',1,context,{landingPageId:uuid,name:'Form',submitLabel:'Enviar',successMessage:'Ok',consentCode:'ads',consentVersion:'1',privacyPolicyVersion:'1',fields:[{fieldName:'email',crmFieldKey:'email',required:true}]})).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('campaign.tracking.validate',1,context,{utmSource:'',utmMedium:'paid',utmCampaign:'x',landingPageUrl:'https://example.com',conversionEvent:'lead'})).rejects.toThrow('capability_input_invalid')
  })
})
