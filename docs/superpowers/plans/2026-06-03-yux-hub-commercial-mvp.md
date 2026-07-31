# YUX Hub Commercial MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next sellable YUX Hub layer: CRM cockpit, sector funnels, landing pages, API-first campaigns, real WhatsApp path, configurable AI assistant, Flow Builder Lite, operational reports, and client portal value.

**Architecture:** Extend the current React/Vite/Supabase platform with commercial entities that connect the same loop: campaign -> landing page or WhatsApp CTA -> tracking -> CRM lead -> pipeline -> conversation/follow-up -> proposal/sale -> report. Reuse existing CRM, omnichannel, proposal, project, platform, finance, and support boundaries instead of duplicating records. Provider mutations must run through Supabase Edge Functions with audit logs, idempotency keys, RLS, and safe operational states.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres migrations, Supabase RLS, Supabase Edge Functions, provider APIs for Meta/Google Ads and WhatsApp provider integration.

---

## Execution Strategy

This is not one giant feature branch in practice. Execute in releaseable phases,
with each phase producing a working product slice:

1. Commercial navigation and shared attribution model.
2. CRM cockpit and sector funnel templates.
3. Landing Pages module.
4. Campaigns And Ads API-first module.
5. Real WhatsApp provider path.
6. Configurable AI assistant.
7. Flow Builder Lite.
8. Operational reports and portal consolidation.

Each phase must keep:

- internal YUX view;
- portal view where the client should see the asset;
- Supabase schema and RLS;
- typed frontend service;
- pure rules with tests;
- focused component tests;
- probes for new Supabase tables/policies;
- validation with `npm test`, `npm run type-check`, `npm run build`, and
  `deno test supabase/functions/_shared`.

## Shared Design Rules

- Contracts remain the portal access source of truth.
- Existing leads remain the CRM source of truth.
- Existing conversations/messages remain the omnichannel source of truth.
- New campaign and landing page records add attribution and funnel-entry context.
- Provider credentials never enter frontend code.
- Every provider mutation has an execution log.
- Every new public Supabase table has RLS.
- Every new portal surface must hide protected/internal fields.
- UI should use polished operational views: Kanban, asset cards, timelines,
  metric strips, side panels, and clear next-action buttons.

---

### Task 0: Commercial Module Registry And Navigation Alignment

**Files:**
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`
- Modify: `frontend/src/components/navigation/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types/platform.ts`
- Create: `supabase/migrations/20260601240000_commercial_module_registry.sql`
- Create: `supabase/probes/20260601240000_commercial_module_registry.sql`
- Test: `frontend/src/lib/platform/navigation.test.ts`
- Test: `frontend/src/lib/platform/accessControl.test.ts`

- [x] **Step 1: Write failing navigation/access tests**

Add expectations that the internal menu can expose:

```ts
expect(keys).toEqual(expect.arrayContaining([
  'crm',
  'omnichannel',
  'landing_pages',
  'campaigns',
  'automations',
  'bi_reports',
]))
```

Add portal expectations for contracted modules:

```ts
expect(portalRoutes).toEqual(expect.arrayContaining([
  '/portal/crm',
  '/portal/omnichannel',
  '/portal/landing-pages',
  '/portal/campaigns',
  '/portal/reports',
]))
```

Run:

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/lib/platform/accessControl.test.ts
```

Expected: FAIL because `landing_pages` is not registered yet and commercial
navigation does not expose the new route set.

- [x] **Step 2: Add platform permission/module primitives**

Add permission keys:

```ts
| 'landing_pages.read'
| 'landing_pages.write'
```

Add module registry entry:

```ts
{
  key: 'landing_pages',
  name: 'Landing Pages',
  base: false,
  internalRoute: '/landing-pages',
  portalRoute: '/portal/landing-pages',
  requiredPermissions: ['landing_pages.read'],
}
```

Rename only visible labels where useful:

- CRM -> `CRM & Funis`;
- Omnichannel -> `Conversas IA`;
- BI reports -> `Relatorios & ROI`;
- Campaigns -> `Campanhas`.

Do not rename database module keys already used by contracts unless a migration
updates dependent rows safely.

- [x] **Step 3: Add registry migration and probes**

Migration must insert/update:

```sql
INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES
  ('landing_pages', 'Landing Pages', false, '/landing-pages', '/portal/landing-pages', ARRAY['landing_pages.read'])
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  base = EXCLUDED.base,
  internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route,
  required_permissions = EXCLUDED.required_permissions,
  updated_at = NOW();
```

Also grant `landing_pages.read` to client roles and `landing_pages.write` to
internal/admin roles. Probe must confirm module metadata and role permissions.

- [x] **Step 4: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/lib/platform/accessControl.test.ts
npm run type-check
```

Expected: PASS.

---

### Task 1: Shared Attribution And Commercial Asset Model

**Files:**
- Create: `frontend/src/types/commercial.ts`
- Create: `frontend/src/lib/commercial/attributionRules.ts`
- Create: `frontend/src/lib/commercial/attributionRules.test.ts`
- Create: `supabase/migrations/20260601250000_commercial_attribution_core.sql`
- Create: `supabase/probes/20260601250000_commercial_attribution_core.sql`

- [x] **Step 1: Write failing attribution tests**

Test canonical UTM normalization:

```ts
expect(normalizeUtm({
  source: 'Meta Ads ',
  medium: ' Paid Social ',
  campaign: 'Botox Junho'
})).toEqual({
  source: 'meta_ads',
  medium: 'paid_social',
  campaign: 'botox_junho'
})
```

Test source classification:

```ts
expect(classifyLeadSource({ utmSource: 'meta', landingPageId: 'lp-1' })).toBe('paid_campaign')
expect(classifyLeadSource({ whatsappClickId: 'wa-1' })).toBe('whatsapp_cta')
```

Run:

```bash
cd frontend
npm test -- src/lib/commercial/attributionRules.test.ts
```

Expected: FAIL because commercial attribution helpers do not exist.

- [x] **Step 2: Implement commercial attribution types/rules**

Create types:

```ts
export type LeadSourceKind =
  | 'paid_campaign'
  | 'landing_page'
  | 'whatsapp_cta'
  | 'organic'
  | 'referral'
  | 'manual'

export interface AttributionContext {
  campaignId?: string
  landingPageId?: string
  whatsappClickId?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
}
```

Rules should be pure and reusable by CRM, landing pages, campaigns, WhatsApp,
and reports.

- [x] **Step 3: Add attribution schema**

Add:

- `lead_sources`;
- `tracking_events`;
- `utm_sessions`.

Each record must support `organization_id`, `client_id`, optional
`contract_id`, optional `lead_id`, optional `campaign_id`, optional
`landing_page_id`, optional `conversation_id`, sanitized metadata, timestamps,
and RLS.

Do not duplicate campaign metrics here. Attribution tables record how a lead or
event entered the funnel.

- [x] **Step 4: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/commercial/attributionRules.test.ts
npm run type-check
```

Expected: PASS.

---

### Task 2: CRM Cockpit Upgrade

**Files:**
- Modify: `frontend/src/types/crm.ts`
- Modify: `frontend/src/services/crmService.ts`
- Modify: `frontend/src/components/crm/CrmWorkspace.tsx`
- Modify: `frontend/src/pages/leads/LeadsPage.tsx`
- Create: `frontend/src/components/crm/LeadKanbanBoard.tsx`
- Create: `frontend/src/components/crm/LeadDetailPanel.tsx`
- Create: `frontend/src/components/crm/LeadTimeline.tsx`
- Create: `frontend/src/components/crm/LeadTaskPanel.tsx`
- Create: `frontend/src/lib/crm/pipelineRules.ts`
- Create: `frontend/src/lib/crm/pipelineRules.test.ts`
- Create: `frontend/src/components/crm/CrmWorkspace.test.tsx`
- Create: `supabase/migrations/20260601260000_crm_cockpit_upgrade.sql`
- Create: `supabase/probes/20260601260000_crm_cockpit_upgrade.sql`

- [x] **Step 1: Write failing pipeline rule tests**

Test stage ordering and win/loss states:

```ts
expect(sortPipelineStages([
  { id: 'proposal', orderIndex: 3 },
  { id: 'new', orderIndex: 1 },
])).toEqual([
  expect.objectContaining({ id: 'new' }),
  expect.objectContaining({ id: 'proposal' }),
])
```

Test stale lead detection:

```ts
expect(getLeadAttentionState({
  status: 'open',
  lastActivityAt: '2026-06-01T10:00:00.000Z',
  nextFollowUpAt: undefined,
}, new Date('2026-06-03T10:00:00.000Z'))).toBe('stale')
```

- [x] **Step 2: Add CRM schema improvements**

Add or normalize:

- `pipeline_templates`;
- `pipeline_template_stages`;
- `lead_custom_field_values`;
- `lead_tasks` as the commercial CRM task table, mapped from existing follow-up
  concepts where possible;
- lead fields for `owner_id`, `score`, `lost_reason`, `won_at`, `lost_at`,
  `last_activity_at`, `next_follow_up_at`, `source_kind`, `attribution_context`.

Use additive migrations. Preserve existing leads and stages.

- [x] **Step 3: Extend `crmService`**

Add methods:

```ts
getPipelinesForOrganization(organizationId: string)
getLeadsForPipeline(pipelineId: string)
moveLeadToStage(leadId: string, stageId: string)
updateLeadScore(leadId: string, score: number)
createLeadTask(input)
completeLeadTask(taskId: string)
recordLeadActivity(input)
markLeadWon(input)
markLeadLost(input)
```

Tests should mock row mapping and payload builders before service methods call
Supabase.

- [x] **Step 4: Build polished CRM UI**

Internal:

- top metric strip: new leads, stale leads, conversion rate, tasks due;
- Kanban board with stage columns and lead cards;
- list/table toggle;
- detail side panel with timeline, tasks, notes, source, owner, score;
- quick actions: assign owner, create task, move stage, mark won/lost, create
  proposal.

Portal:

- contracted pipeline visibility where enabled;
- client-safe stage summary;
- lead details only when contract policy allows it.

- [x] **Step 5: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/crm/pipelineRules.test.ts src/components/crm/CrmWorkspace.test.tsx
npm run type-check
npm run build
```

Expected: PASS.

---

### Task 3: Sector Funnel Templates And Blueprint Application

**Files:**
- Modify: `frontend/src/types/platform.ts`
- Modify: `frontend/src/services/platformService.ts`
- Modify: `frontend/src/pages/platform/BlueprintsPage.tsx`
- Create: `frontend/src/components/platform/BlueprintApplyPanel.tsx`
- Create: `frontend/src/lib/platform/blueprintApplicationRules.ts`
- Create: `frontend/src/lib/platform/blueprintApplicationRules.test.ts`
- Create: `supabase/migrations/20260601270000_sector_funnel_blueprints.sql`
- Create: `supabase/probes/20260601270000_sector_funnel_blueprints.sql`

- [x] **Step 1: Write failing blueprint application tests**

Test that a clinic blueprint resolves pipeline stages:

```ts
expect(buildPipelineFromBlueprint(clinicBlueprint).stages.map(stage => stage.name)).toEqual([
  'Novo lead',
  'Triagem IA',
  'Agendamento pendente',
  'Consulta confirmada',
  'Compareceu',
  'Pos-consulta',
  'Reativacao futura',
])
```

- [x] **Step 2: Add blueprint schema**

Add:

- `blueprint_pipeline_templates`;
- `blueprint_pipeline_stages`;
- `blueprint_custom_fields`;
- `blueprint_message_templates`;
- `blueprint_automation_templates`;
- `blueprint_report_presets`;
- `blueprint_application_runs`.

Seed first templates:

- clinics;
- real estate;
- vehicle dealers;
- repair shops;
- agencies.

- [x] **Step 3: Add application service**

`platformService.applyBlueprintToContract(input)` should create or link:

- pipeline;
- stages;
- custom fields;
- message templates;
- automation templates in draft state;
- reporting presets.

The operation should be idempotent through `blueprint_application_runs`.

- [x] **Step 4: Build UI**

Blueprint page should show:

- sector cards;
- included modules;
- default funnel preview;
- fields/templates count;
- "Aplicar ao contrato" command;
- application history and errors.

- [x] **Step 5: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/platform/blueprintApplicationRules.test.ts
npm run type-check
```

Expected: PASS.

---

### Task 4: Landing Pages Module

**Files:**
- Create: `frontend/src/types/landingPage.ts`
- Create: `frontend/src/lib/landing-pages/landingPageRules.ts`
- Create: `frontend/src/lib/landing-pages/landingPageRules.test.ts`
- Create: `frontend/src/services/landingPageService.ts`
- Create: `frontend/src/services/landingPageService.test.ts`
- Create: `frontend/src/components/landing-pages/LandingPagesWorkspace.tsx`
- Create: `frontend/src/components/landing-pages/PortalLandingPagesWorkspace.tsx`
- Create: `frontend/src/components/landing-pages/LandingPagesWorkspace.test.tsx`
- Create: `frontend/src/pages/landing-pages/LandingPagesPage.tsx`
- Create: `frontend/src/pages/client-portal/PortalLandingPagesPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `supabase/migrations/20260601280000_landing_pages.sql`
- Create: `supabase/probes/20260601280000_landing_pages.sql`

- [x] **Step 1: Write failing rules tests**

Test portal sanitization:

```ts
expect(sanitizeLandingPageForPortal(page)).not.toHaveProperty('internalNotes')
expect(sanitizeLandingPageForPortal(page).versions.every(v => !v.internalOnly)).toBe(true)
```

Test conversion rate:

```ts
expect(calculateLandingPageMetrics({ visits: 1000, leads: 83 }).conversionRate).toBe(8.3)
```

- [x] **Step 2: Add landing page schema**

Add:

- `landing_pages`;
- `landing_page_versions`;
- `landing_page_forms`;
- `landing_page_field_mappings`;
- `landing_page_events`;
- `landing_page_change_requests`;
- `landing_page_approvals`.

Core fields must include `organization_id`, `client_id`, `contract_id`,
optional `project_id`, optional `campaign_id`, `pipeline_id`,
`initial_stage_id`, `preview_url`, `published_url`, `thumbnail_url`,
`primary_cta_type`, `primary_cta_value`, and status.

- [x] **Step 3: Implement service**

Add:

```ts
getLandingPages(filters)
getPortalLandingPages(contractId)
createLandingPage(input)
updateLandingPageStatus(id, status)
addLandingPageVersion(input)
requestLandingPageChange(input)
approveLandingPage(input)
recordLandingPageEvent(input)
```

- [x] **Step 4: Build internal UI**

Internal route `/landing-pages`:

- metric strip: active pages, conversion rate, leads, pending approvals;
- asset cards with thumbnail;
- detail panel with preview link, CTA, campaign, funnel routing, versions;
- form mapping editor;
- approval/change-request controls.

- [x] **Step 5: Build portal UI**

Portal route `/portal/landing-pages`:

- active/pending landing page cards;
- preview button;
- status;
- basic metrics;
- generated leads summary;
- request change;
- approve publication.

- [x] **Step 6: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/landing-pages/landingPageRules.test.ts src/services/landingPageService.test.ts src/components/landing-pages/LandingPagesWorkspace.test.tsx
npm run type-check
npm run build
```

Expected: PASS.

---

### Task 5: Campaigns And Ads API-First Core

**Files:**
- Create: `frontend/src/types/campaign.ts`
- Create: `frontend/src/lib/campaigns/campaignRules.ts`
- Create: `frontend/src/lib/campaigns/campaignRules.test.ts`
- Create: `frontend/src/services/campaignService.ts`
- Create: `frontend/src/services/campaignService.test.ts`
- Replace or heavily modify: `frontend/src/pages/campaigns/CampaignsPage.tsx`
- Create: `frontend/src/components/campaigns/CampaignsWorkspace.tsx`
- Create: `frontend/src/components/campaigns/PortalCampaignsWorkspace.tsx`
- Create: `frontend/src/components/campaigns/CampaignBuilder.tsx`
- Create: `frontend/src/components/campaigns/CampaignCreativePanel.tsx`
- Create: `frontend/src/components/campaigns/CampaignMetricsPanel.tsx`
- Create: `frontend/src/components/campaigns/CampaignsWorkspace.test.tsx`
- Create: `frontend/src/pages/client-portal/PortalCampaignsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `supabase/migrations/20260601290000_campaigns_ads_api_core.sql`
- Create: `supabase/probes/20260601290000_campaigns_ads_api_core.sql`

- [x] **Step 1: Write failing campaign rules tests**

Test budget mutation safety:

```ts
expect(validateBudgetChange({ currentDaily: 50, nextDaily: 5000 })).toEqual({
  ok: false,
  reason: 'budget_change_requires_explicit_approval',
})
```

Test portal sanitization:

```ts
expect(sanitizeCampaignForPortal(campaign)).not.toHaveProperty('protectedError')
expect(sanitizeCampaignForPortal(campaign).executionLogs).toBeUndefined()
```

Test MROI:

```ts
expect(calculateCampaignMroi({ spend: 1000, attributedRevenue: 4300 })).toBe(3.3)
```

- [x] **Step 2: Add campaign schema**

Add:

- `ad_provider_connections`;
- `ad_accounts`;
- `campaigns`;
- `campaign_ad_sets`;
- `campaign_ads`;
- `campaign_creatives`;
- `campaign_metric_snapshots`;
- `campaign_recommendations`;
- `campaign_alerts`;
- `ad_provider_mutation_runs`.

Provider connection states must include:

- `connected`;
- `stale`;
- `needs_reauth`;
- `failed`.

Campaign lifecycle states must include:

- `draft`;
- `pending_approval`;
- `approved`;
- `syncing`;
- `active`;
- `paused`;
- `archived`;
- `failed`.

- [x] **Step 3: Implement campaign service**

Add mapping and methods:

```ts
getProviderConnections()
getCampaigns(filters)
getPortalCampaigns(contractId)
createCampaignDraft(input)
updateCampaignDraft(id, input)
submitCampaignForApproval(id)
approveCampaign(id)
enqueueProviderMutation(input)
syncCampaignMetrics(campaignId)
pauseCampaign(campaignId)
updateCampaignBudget(input)
```

Payload builders must be unit-tested before methods call Supabase.

- [x] **Step 4: Build internal campaign workspace**

Internal `/campaigns` must show:

- provider health banner;
- spend/leads/CPL/MROI metric strip;
- campaign cards/table;
- campaign builder with objective, provider, account, budget, schedule,
  landing page, funnel, UTM, creatives;
- approval status;
- mutation history;
- alerts/recommendations.

- [x] **Step 5: Build portal campaign workspace**

Portal `/portal/campaigns` must show:

- active campaigns;
- investment;
- status;
- leads;
- CPL;
- creative preview;
- landing page;
- simple performance evolution;
- recommendation cards;
- request new campaign/change command.

- [x] **Step 6: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/campaigns/campaignRules.test.ts src/services/campaignService.test.ts src/components/campaigns/CampaignsWorkspace.test.tsx
npm run type-check
npm run build
```

Expected: PASS.

---

### Task 6: Ads Provider Edge Functions

**Files:**
- Create: `supabase/functions/_shared/adsProvider.ts`
- Create: `supabase/functions/_shared/adsProvider.test.ts`
- Create: `supabase/functions/connect-ads-provider/index.ts`
- Create: `supabase/functions/connect-ads-provider/deno.json`
- Create: `supabase/functions/execute-ad-provider-mutation/index.ts`
- Create: `supabase/functions/execute-ad-provider-mutation/deno.json`
- Create: `supabase/functions/sync-ad-metrics/index.ts`
- Create: `supabase/functions/sync-ad-metrics/deno.json`

- [x] **Step 1: Write failing shared provider tests**

Test provider mutation normalization:

```ts
assertEquals(buildProviderMutationIdempotencyKey({
  provider: 'meta',
  localMutationId: 'mutation-1',
  action: 'create_campaign',
}), 'meta:create_campaign:mutation-1')
```

Test protected error sanitization:

```ts
assertEquals(sanitizeProviderError(new Error('token abc123 failed')).includes('abc123'), false)
```

Run:

```bash
deno test supabase/functions/_shared/adsProvider.test.ts
```

Expected: FAIL because shared ads provider helpers do not exist.

- [x] **Step 2: Implement provider-agnostic contracts**

Define:

- provider keys: `meta`, `google`;
- mutation actions: `create_campaign`, `update_budget`, `pause_campaign`,
  `sync_metrics`;
- normalized provider response shape;
- sanitized error shape.

- [x] **Step 3: Implement Edge Functions**

Functions must:

- authenticate user;
- verify internal permission for provider mutation;
- load provider connection from Supabase;
- reject `needs_reauth` connections;
- execute provider-specific adapter;
- store `ad_provider_mutation_runs`;
- update local campaign external IDs/status;
- never return raw tokens or raw provider errors.

If live credentials are not configured locally, tests should cover adapter
contract and fallback states without hitting provider APIs.

- [x] **Step 4: Verify**

Run:

```bash
deno test supabase/functions/_shared
```

Expected: PASS.

---

### Task 7: Real WhatsApp Provider Path

**Files:**
- Modify: `frontend/src/types/omnichannel.ts`
- Modify: `frontend/src/services/omnichannelService.ts`
- Modify: `frontend/src/components/omnichannel/OmnichannelWorkspace.tsx`
- Modify: `frontend/src/components/omnichannel/OmnichannelAdminTabs.tsx`
- Modify: `supabase/functions/_shared/omnichannel.ts`
- Modify: `supabase/functions/receive-channel-event/index.ts`
- Modify: `supabase/functions/dispatch-outbound-message/index.ts`
- Create: `supabase/functions/_shared/whatsappProvider.ts`
- Create: `supabase/functions/_shared/whatsappProvider.test.ts`
- Create: `supabase/migrations/20260601300000_whatsapp_provider_path.sql`
- Create: `supabase/probes/20260601300000_whatsapp_provider_path.sql`

- [x] **Step 1: Write failing WhatsApp provider tests**

Test inbound normalization:

```ts
assertEquals(normalizeWhatsAppInbound(metaPayload).channel, 'whatsapp')
assertEquals(normalizeWhatsAppInbound(metaPayload).externalMessageId, 'wamid.test')
```

Test outbound payload:

```ts
assertEquals(buildWhatsAppTextPayload({
  to: '+5543999999999',
  body: 'Ola',
}).type, 'text')
```

- [x] **Step 2: Add provider connection fields**

Extend channel/provider config with:

- provider account ID;
- phone number ID;
- webhook verify state;
- token state;
- last sync;
- `needs_reauth`;
- protected metadata references.

- [x] **Step 3: Implement inbound webhook path**

`receive-channel-event` should:

- validate provider signature when configured;
- normalize inbound WhatsApp payload;
- upsert contact;
- create/update conversation;
- persist message;
- link to lead when phone/contact matches;
- call CRM sync path;
- record webhook event status.

- [x] **Step 4: Implement outbound manual send**

`dispatch-outbound-message` should:

- load connection;
- validate permission and conversation;
- build provider payload;
- send through provider adapter;
- update message delivery status;
- store outbound run.

- [x] **Step 5: Update UI**

Internal inbox should show:

- provider health;
- WhatsApp channel badge;
- linked lead;
- manual send state;
- handoff state;
- AI summary/classification.

Keep simulator clearly labeled as simulator.

- [x] **Step 6: Verify**

Run:

```bash
cd frontend
npm test -- src/services/omnichannelService.test.ts src/components/omnichannel/OmnichannelWorkspace.test.tsx
npm run type-check
deno test supabase/functions/_shared
```

Expected: PASS.

---

### Task 8: Configurable AI Assistant

**Files:**
- Create: `frontend/src/types/aiAssistant.ts`
- Create: `frontend/src/lib/ai-assistant/assistantRules.ts`
- Create: `frontend/src/lib/ai-assistant/assistantRules.test.ts`
- Create: `frontend/src/services/aiAssistantService.ts`
- Create: `frontend/src/services/aiAssistantService.test.ts`
- Create: `frontend/src/components/ai-assistant/AssistantSettingsPanel.tsx`
- Modify: `frontend/src/components/omnichannel/OmnichannelAdminTabs.tsx`
- Modify: `supabase/functions/process-ai-message/index.ts`
- Create: `supabase/migrations/20260601310000_ai_assistant_settings.sql`
- Create: `supabase/probes/20260601310000_ai_assistant_settings.sql`

- [x] **Step 1: Write failing assistant rule tests**

Test required fields:

```ts
expect(getMissingCollectedFields(['name'], ['name', 'phone'])).toEqual(['phone'])
```

Test handoff trigger:

```ts
expect(shouldHandoffToHuman({
  sentiment: 'negative',
  intent: 'complaint',
  confidence: 0.82,
}, settings)).toBe(true)
```

- [x] **Step 2: Add assistant schema**

Add:

- `ai_assistants`;
- `ai_assistant_objectives`;
- `ai_assistant_required_fields`;
- `ai_assistant_handoff_rules`;
- `ai_assistant_safety_rules`;
- `ai_assistant_knowledge_links`.

Scope by `organization_id`, optional `client_id`, optional `contract_id`.

- [x] **Step 3: Implement service and UI**

UI should allow:

- name;
- tone;
- objective;
- fields to collect;
- FAQ/knowledge links;
- handoff rules;
- safety rules;
- summary/classification settings.

- [x] **Step 4: Wire into AI processing**

`process-ai-message` should load assistant settings and include sanitized
settings metadata in `ai_message_runs`.

- [x] **Step 5: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/ai-assistant/assistantRules.test.ts src/services/aiAssistantService.test.ts
npm run type-check
deno test supabase/functions/_shared
```

Expected: PASS.

---

### Task 9: Flow Builder Lite

**Files:**
- Create: `frontend/src/types/automation.ts`
- Create: `frontend/src/lib/automations/automationRules.ts`
- Create: `frontend/src/lib/automations/automationRules.test.ts`
- Create: `frontend/src/services/automationService.ts`
- Create: `frontend/src/services/automationService.test.ts`
- Create: `frontend/src/components/automations/AutomationWorkspace.tsx`
- Create: `frontend/src/components/automations/AutomationWorkspace.test.tsx`
- Create: `frontend/src/pages/automations/AutomationsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `supabase/functions/dispatch-crm-automation/index.ts`
- Create: `supabase/migrations/20260601320000_flow_builder_lite.sql`
- Create: `supabase/probes/20260601320000_flow_builder_lite.sql`

- [x] **Step 1: Write failing automation rule tests**

Test trigger eligibility:

```ts
expect(matchesTrigger(flow, { type: 'lead.stage_changed', leadId: 'lead-1' })).toBe(true)
```

Test condition evaluation:

```ts
expect(evaluateConditions([
  { field: 'source', operator: 'equals', value: 'instagram' },
], { source: 'instagram' })).toBe(true)
```

- [x] **Step 2: Add automation schema**

Add:

- `automation_flows`;
- `automation_triggers`;
- `automation_conditions`;
- `automation_actions`;
- `automation_execution_runs`;
- `automation_execution_steps`;
- `automation_templates`.

Support active/inactive, draft/published, and failed states.

- [x] **Step 3: Implement service/UI**

Internal `/automations` should show:

- list of flows;
- enabled state;
- trigger block;
- condition block;
- action block;
- execution history;
- last error;
- sector template badge.

- [x] **Step 4: Wire dispatcher**

`dispatch-crm-automation` should read published flows and execute supported
actions:

- create task;
- change stage;
- assign owner;
- send WhatsApp through existing outbound path;
- create ticket;
- update field;
- register activity.

- [x] **Step 5: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/automations/automationRules.test.ts src/services/automationService.test.ts src/components/automations/AutomationWorkspace.test.tsx
npm run type-check
deno test supabase/functions/_shared
```

Expected: PASS.

---

### Task 10: Operational Reports And MROI

**Files:**
- Create: `frontend/src/types/reports.ts`
- Create: `frontend/src/lib/reports/reportRules.ts`
- Create: `frontend/src/lib/reports/reportRules.test.ts`
- Create: `frontend/src/services/reportService.ts`
- Create: `frontend/src/services/reportService.test.ts`
- Create: `frontend/src/components/reports/ReportsWorkspace.tsx`
- Create: `frontend/src/components/reports/PortalReportsWorkspace.tsx`
- Create: `frontend/src/components/reports/ReportsWorkspace.test.tsx`
- Create: `frontend/src/pages/reports/ReportsPage.tsx`
- Create: `frontend/src/pages/client-portal/PortalReportsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `supabase/migrations/20260601330000_operational_reports.sql`
- Create: `supabase/probes/20260601330000_operational_reports.sql`

- [x] **Step 1: Write failing report rule tests**

Test CPL:

```ts
expect(calculateCpl({ spend: 1200, leads: 40 })).toBe(30)
```

Test MROI:

```ts
expect(calculateMroi({ spend: 1000, attributedRevenue: 5000 })).toBe(4)
```

Test stage conversion:

```ts
expect(calculateStageConversion({ entered: 100, advanced: 28 })).toBe(28)
```

- [x] **Step 2: Add report schema**

Add:

- `report_snapshots`;
- `report_widgets`;
- `report_metric_cache`.

Reports should aggregate from leads, campaigns, landing pages, conversations,
proposals, activities, and projects.

- [x] **Step 3: Implement service/UI**

Internal `/reports` should show:

- leads by source;
- stage conversion;
- response time;
- stalled opportunities;
- campaign spend/leads/CPL/MROI;
- landing page conversion;
- proposal sent/approved;
- owner activity.

Portal `/portal/reports` should show client-safe versions.

- [x] **Step 4: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/reports/reportRules.test.ts src/services/reportService.test.ts src/components/reports/ReportsWorkspace.test.tsx
npm run type-check
npm run build
```

Expected: PASS.

---

### Task 11: Client Portal Commercial Consolidation

**Files:**
- Modify: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`
- Modify: `frontend/src/components/navigation/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/lib/platform/navigation.test.ts`
- Test: relevant portal workspace tests from CRM, landing pages, campaigns, reports, omnichannel

- [x] **Step 1: Write failing portal navigation tests**

Ensure contracted client sees:

```ts
expect(portalItems.map(item => item.label)).toEqual(expect.arrayContaining([
  'Leads & Funil',
  'Conversas IA',
  'Landing Pages',
  'Campanhas',
  'Relatorios',
]))
```

- [x] **Step 2: Update portal dashboard**

Portal dashboard should show:

- active pipeline summary;
- latest conversations;
- landing pages pending approval;
- active campaigns and CPL;
- proposals pending/approved;
- support status;
- finance summary.

Use existing module access rules. Do not show modules not enabled in contract.

- [x] **Step 3: Verify**

Run:

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts
npm run type-check
npm run build
```

Expected: PASS.

---

### Task 12: Final Validation And Release

**Files:**
- All files changed by Tasks 0-11.
- Modify: `docs/implementation-status.md`
- Modify: `docs/commercial-mvp-priorities.md` only if scope changed during execution.
- Create: `docs/commercial-mvp-operations.md`

- [x] **Step 1: Update implementation status**

Add a section for each completed commercial MVP slice:

- CRM Cockpit;
- Sector Funnels;
- Landing Pages;
- Campaigns API-first;
- WhatsApp Provider Path;
- AI Assistant;
- Flow Builder Lite;
- Operational Reports;
- Portal Commercial View.

- [x] **Step 2: Add operations doc**

Document:

- required Supabase migrations/probes;
- provider credentials needed;
- Vercel env vars;
- OAuth redirect URLs;
- Edge Function deploy order;
- manual verification checklist;
- rollback notes for provider mutations.

- [x] **Step 3: Run full validation**

Run:

```bash
cd frontend
npm test
npm run type-check
npm run build
cd ..
deno test supabase/functions/_shared
git diff --check
```

Expected:

- all frontend tests pass;
- type-check passes;
- build passes;
- shared Edge tests pass;
- no whitespace errors.

- [x] **Step 4: Stage exact files and commit**

Use exact staging. Do not stage unrelated local files:

```bash
git status --short
git add docs/implementation-status.md docs/commercial-mvp-operations.md docs/superpowers/specs/2026-06-03-yux-hub-commercial-mvp-design.md docs/superpowers/plans/2026-06-03-yux-hub-commercial-mvp.md frontend/src supabase
git diff --cached --stat
git commit -m "feat: build yux hub commercial mvp"
```

- [x] **Step 5: Push and verify CI/deploy**

Push:

```bash
git push origin HEAD:codex/phase-8-hardening
```

Verify:

- GitHub Actions success;
- Vercel status success;
- preview route protection understood;
- authenticated browser smoke after target Supabase migrations are applied.

## Recommended Sub-Plan Split

Because this plan is large, implementation should be split into sub-plans if
quality or context size becomes a risk:

1. `crm-cockpit-and-sector-funnels`;
2. `landing-pages-and-attribution`;
3. `campaigns-api-first`;
4. `whatsapp-provider-and-ai-assistant`;
5. `flow-builder-and-operational-reports`;
6. `portal-commercial-consolidation`.

Each sub-plan must still follow the same data loop and avoid duplicating
canonical CRM, omnichannel, proposal, project, support, and finance records.
