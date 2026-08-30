import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach,describe,expect,it } from 'vitest'
import { CompositeMissionPlan,isCompositeMissionPlan } from './CompositeMissionPlan'
import type { MissionPlan } from '@/types/actionEngine'

const packs=[{key:'funnel_nurture',semanticVersion:'1.0.0',contentHash:'c'.repeat(64),order:0},{key:'campaign_launch',semanticVersion:'1.0.0',contentHash:'d'.repeat(64),order:1}]
const plan={id:'plan-1',organizationId:'org-1',missionId:'mission-1',revision:1,status:'pending_approval',packVersionId:'pack-1',packContentHash:'a'.repeat(64),planHash:'b'.repeat(64),parameters:{},deviations:[],estimatedEconomics:{totalExecutionCost:'600'},compiledPayload:{packs,artifactBindings:[{fromPack:'funnel_nurture',artifactKey:'crm.funnel',toPack:'campaign_launch',inputKey:'funnelVersionId',schemaVersion:1}]},steps:[{stepKey:'funnel_nurture.pack.publish_funnel',capabilityKey:'crm.pipeline.publish',capabilityVersion:1,dependsOn:[],parameters:{},approvalRequired:true,protected:true},{stepKey:'campaign_launch.pack.draft_campaign',capabilityKey:'campaign.create_draft',capabilityVersion:1,dependsOn:['funnel_nurture.pack.publish_funnel'],parameters:{},approvalRequired:false,protected:true}],createdAt:'2026-08-30T00:00:00Z',updatedAt:'2026-08-30T00:00:00Z'} satisfies MissionPlan
afterEach(()=>{document.body.innerHTML=''})
describe('CompositeMissionPlan',()=>{
  it('renders packs, explicit artifact arrow and approval without exposing hidden prompts',async()=>{const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);await act(async()=>root.render(<CompositeMissionPlan plan={plan} technical />));const text=document.body.textContent??'';expect(container.querySelector('[aria-label="Plano composto"]')).not.toBeNull();expect(text).toContain('Funnel Nurture');expect(text).toContain('Campaign Launch');expect(text).toContain('Crm Funnel v1');expect(text).toContain('aprovação');expect(text).not.toMatch(/system prompt/i);act(()=>root.unmount())})
  it('keeps single-pack compatibility',()=>{expect(isCompositeMissionPlan({...plan,compiledPayload:{packs:[packs[0]]}})).toBe(false)})
})
