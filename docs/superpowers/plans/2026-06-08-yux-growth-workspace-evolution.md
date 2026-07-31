# YUX Growth Workspace Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve YUX Hub from module-based screens into a guided growth workspace built around Registro 360, Campanha 360, sector onboarding, brand intelligence, templates, guided automations and executive results.

**Architecture:** Reuse the existing CRM, Marketing Studio, campaigns, landing pages, automations, reports, client workspace and blueprint foundations. Add orchestration layers, view models and focused UI shells that connect existing modules instead of rebuilding them. Persist only cross-module primitives that do not already exist: campaign plans, onboarding checklist progress, smart segments and record association/activity summaries.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Supabase Postgres/RLS, existing service layer under `frontend/src/services`, domain rules under `frontend/src/lib`, and Vitest/React Testing Library.

---

## Deployment Strategy

Implement in seven independent phases. Each phase must ship a working, testable slice and keep the app usable at `http://127.0.0.1:3000`.

1. Registro 360 foundation.
2. Unified activity timeline and associations.
3. Campanha 360 guided campaign plans.
4. Sector onboarding tied to Modelos Setoriais.
5. Central da Marca and knowledge readiness.
6. Smart segments, guided automations and template library.
7. Ads/MROI executive cockpit, QA and docs.

Do not start with a broad rewrite. The current product already has CRM cockpit, Lead 360, campaigns, Marketing Studio, automations, landing pages, reports, portal journeys and client workspaces. The first objective is to make these areas feel connected and commercially guided.

## File Structure

### New Shared Growth Workspace Files

- Create: `frontend/src/types/growthWorkspace.ts`
  - Types for `Record360`, `Record360Tab`, `RecordAssociation`, `UnifiedActivity`, `CampaignPlan`, `CampaignPlanStep`, `GrowthOnboardingChecklist`, `SmartSegment`, `GrowthTemplate`.
- Create: `frontend/src/lib/growth-workspace/record360Rules.ts`
  - Pure rules for tab availability, next action priority, missing data, association summaries and quick-action visibility.
- Create: `frontend/src/lib/growth-workspace/campaignPlanRules.ts`
  - Pure rules for campaign objective templates, checklist generation, progress, blocked steps and recommended next actions.
- Create: `frontend/src/lib/growth-workspace/onboardingRules.ts`
  - Pure rules for sector onboarding checklists derived from blueprints.
- Create: `frontend/src/lib/growth-workspace/templateRules.ts`
  - Pure rules for filtering templates by sector, objective, channel and module.
- Create: `frontend/src/services/growthWorkspaceService.ts`
  - Supabase service methods for record summaries, campaign plans, onboarding progress and smart segments.

### Database Migrations

- Create: `supabase/migrations/20260608130000_growth_workspace_foundation.sql`
  - Tables: `growth_campaign_plans`, `growth_campaign_plan_steps`, `growth_onboarding_checklists`, `growth_onboarding_steps`, `growth_smart_segments`.
  - RLS: internal users can manage all; portal users can read/write rows for their active organization/contract according to existing membership and contract policies.
- Create: `supabase/probes/20260608130000_growth_workspace_foundation.sql`
  - Probe basic insert/select/update/delete with one internal user context and one portal-safe contract context.

### Registro 360 UI

- Modify: `frontend/src/components/crm/Lead360Panel.tsx`
  - Convert current Lead 360 into the first `Record360Layout` consumer.
- Create: `frontend/src/components/growth-workspace/Record360Layout.tsx`
  - Three-column layout: identity/actions, central tabs, associations.
- Create: `frontend/src/components/growth-workspace/RecordIdentityPanel.tsx`
  - Left column with key properties and quick actions.
- Create: `frontend/src/components/growth-workspace/RecordTabs.tsx`
  - Tabs: `Resumo`, `Sobre`, `Atividades`, `Conversas`, `Propostas & Receita`, `Inteligencia`.
- Create: `frontend/src/components/growth-workspace/RecordAssociationsPanel.tsx`
  - Right column with company, contacts, opportunities, campaigns, tickets, documents, contracts and invoices.
- Create: `frontend/src/components/growth-workspace/RecordQuickActions.tsx`
  - Actions: note, WhatsApp, email, call, task, meeting, proposal.
- Create: `frontend/src/components/growth-workspace/RecordIntelligencePanel.tsx`
  - Summary, sentiment, risk, objection, next best action, missing data and sources.

### Campanha 360 UI

- Modify: `frontend/src/components/campaigns/CampaignsWorkspace.tsx`
  - Add entry point for guided campaign creation and campaign plan detail.
- Create: `frontend/src/components/growth-workspace/CampaignPlanWizard.tsx`
  - Objective-first wizard.
- Create: `frontend/src/components/growth-workspace/CampaignPlanDetail.tsx`
  - Checklist of assets: segment, landing page, form, creative, post, ad, message, automation, approval, report.
- Create: `frontend/src/components/growth-workspace/CampaignPlanStepCard.tsx`
  - Step status, linked asset, owner, due date and action button.
- Create: `frontend/src/pages/client-portal/marketing/PortalCampaignPlanPage.tsx`
  - Portal/client-workspace route for campaign plan detail.

### Sector Onboarding And Brand

- Modify: `frontend/src/pages/platform/ClientConversionsPage.tsx`
  - After lead-to-client conversion, optionally create onboarding checklist from selected Modelo Setorial.
- Modify: `frontend/src/pages/platform/BlueprintsPage.tsx`
  - Show generated onboarding checklist preview for each sector model.
- Modify: `frontend/src/pages/client-portal/company/PortalBrandVoicePage.tsx`
  - Evolve into `Central da Marca` with readiness score and data source status.
- Modify: `frontend/src/pages/client-portal/company/PortalKnowledgeBasePage.tsx`
  - Surface knowledge coverage needed by Marketing Studio, Agente IA and campaigns.
- Create: `frontend/src/components/growth-workspace/SectorOnboardingChecklist.tsx`
  - Checklist visible in portal and client workspace.
- Create: `frontend/src/components/growth-workspace/BrandReadinessPanel.tsx`
  - Logo, colors, voice, products, promises, restrictions, site crawl and source freshness.

### Templates, Segments, Automations And Reports

- Create: `frontend/src/components/growth-workspace/GrowthTemplateLibrary.tsx`
  - Templates by sector and objective across campaigns, landing pages, posts, ads, WhatsApp, emails, segments, reports and automations.
- Create: `frontend/src/components/growth-workspace/SmartSegmentBuilder.tsx`
  - Filters, estimated size, saved segment, actions.
- Modify: `frontend/src/components/automations/AutomationWorkspace.tsx`
  - Add objective-first entry before technical builder.
- Modify: `frontend/src/components/reports/ReportsWorkspace.tsx`
  - Add campaign/record/sector report presets and AI insight summaries.
- Modify: `frontend/src/components/campaigns/CampaignMetricsPanel.tsx`
  - Add executive ad cockpit metrics: spend, leads, CPL, proposals, clients, MROI, sync health.

## Phase 0: Stabilize Release Gates

**Files:**
- Inspect: `frontend/src/components/automations/AutomationWorkspace.tsx`
- Inspect: `frontend/src/components/automations/AutomationNodeEditor.tsx`
- Inspect: `frontend/src/components/automations/NodeConfigSidebar.tsx`
- Inspect: `frontend/src/lib/platform/navigation.test.ts`
- Modify only if needed: files with current type-check failures or encoding defects.

- [ ] Step 1: Run the current frontend gates.

Run:

```powershell
cd frontend
npm run type-check
npx vitest run src/lib/platform/navigation.test.ts
npm run build
```

Expected:

- Type-check passes before starting the evolution.
- Navigation tests pass.
- Build passes with only known Browserslist/chunk warnings.

- [ ] Step 2: If type-check fails in automations, fix the type errors before feature work.

Expected:

- No new Growth Workspace work starts while shared automation surfaces fail type-check.

- [ ] Step 3: Browser smoke the current routes.

Routes:

- `/leads`
- `/campaigns`
- `/automations`
- `/marketing-studio`
- `/portal`
- `/client-workspaces`

Expected:

- Each route renders authenticated UI.
- No permanent loading states.
- Console has no application errors unrelated to missing provider credentials.

## Phase 1: Registro 360 Foundation

**Files:**
- Create: `frontend/src/types/growthWorkspace.ts`
- Create: `frontend/src/lib/growth-workspace/record360Rules.ts`
- Create: `frontend/src/lib/growth-workspace/record360Rules.test.ts`
- Create: `frontend/src/components/growth-workspace/Record360Layout.tsx`
- Create: `frontend/src/components/growth-workspace/RecordIdentityPanel.tsx`
- Create: `frontend/src/components/growth-workspace/RecordTabs.tsx`
- Create: `frontend/src/components/growth-workspace/RecordQuickActions.tsx`
- Create: `frontend/src/components/growth-workspace/RecordAssociationsPanel.tsx`
- Create: `frontend/src/components/growth-workspace/RecordIntelligencePanel.tsx`
- Modify: `frontend/src/components/crm/Lead360Panel.tsx`
- Modify: `frontend/src/components/crm/CrmWorkspace.tsx`
- Test: `frontend/src/components/crm/CrmWorkspace.test.tsx`

- [ ] Step 1: Add failing tests for record tab availability and next-action ordering.

Run:

```powershell
cd frontend
npx vitest run src/lib/growth-workspace/record360Rules.test.ts
```

Expected:

- Tests fail because `record360Rules.ts` does not exist yet.

- [ ] Step 2: Implement `growthWorkspace.ts` and `record360Rules.ts`.

Minimum rule coverage:

- `buildRecord360Tabs(record)` returns `Resumo`, `Sobre`, `Atividades`, `Conversas`, `Propostas & Receita`, `Inteligencia`.
- `summarizeMissingRecordData(record)` returns missing email, phone, owner, company, source or next action.
- `pickNextBestAction(record)` prioritizes overdue task, open proposal, recent unanswered conversation, missing owner, then AI suggestion.
- `summarizeAssociations(record)` counts associated companies, contacts, opportunities, campaigns, tickets, documents, contracts and invoices.

- [ ] Step 3: Add the `Record360Layout` component.

Layout requirements:

- Three columns on desktop.
- Left column stays compact and action-focused.
- Center column owns tabs.
- Right column owns associations.
- On mobile, columns stack as identity, tabs, associations.

- [ ] Step 4: Replace the internal shell of `Lead360Panel.tsx` with `Record360Layout`.

Keep existing CRM behavior:

- lead detail still opens from list/Kanban;
- existing task, timeline, proposal and AI panels remain reachable;
- no route changes in this phase.

- [ ] Step 5: Run focused tests.

Run:

```powershell
cd frontend
npx vitest run src/lib/growth-workspace/record360Rules.test.ts src/components/crm/CrmWorkspace.test.tsx
npm run type-check
```

Expected:

- New rule tests pass.
- CRM workspace tests pass.
- Type-check passes.

- [ ] Step 6: Browser QA.

Route:

- `/leads`

Expected:

- Opening a lead shows Registro 360 layout.
- Quick actions are visible.
- Tabs are visible.
- Associations column is visible.
- No console errors.

## Phase 2: Unified Activity Timeline And Associations

**Files:**
- Modify: `frontend/src/services/crmService.ts`
- Modify: `frontend/src/services/crmConversationService.ts`
- Modify: `frontend/src/services/crmClosingService.ts`
- Modify: `frontend/src/services/campaignService.ts`
- Create: `frontend/src/services/growthWorkspaceService.ts`
- Create: `frontend/src/services/growthWorkspaceService.test.ts`
- Modify: `frontend/src/components/crm/LeadTimeline.tsx`
- Modify: `frontend/src/components/growth-workspace/RecordAssociationsPanel.tsx`

- [ ] Step 1: Add service tests for unified activity mapping.

Expected mapped activity kinds:

- note;
- task;
- call;
- meeting;
- email;
- whatsapp;
- stage_change;
- proposal;
- campaign;
- automation;
- invoice;
- support_ticket.

- [ ] Step 2: Implement `growthWorkspaceService.getRecordActivities(recordType, recordId)`.

Rules:

- Return normalized `UnifiedActivity[]`.
- Sort by due date for pending tasks and by occurred date for completed events.
- Preserve source object IDs for drill-in links.
- Do not expose internal-only fields in portal mode.

- [ ] Step 3: Implement `growthWorkspaceService.getRecordAssociations(recordType, recordId)`.

Associations:

- company;
- contacts;
- opportunities;
- campaigns;
- proposals;
- contracts;
- invoices;
- support tickets;
- documents;
- automations.

- [ ] Step 4: Update `LeadTimeline.tsx`.

UI requirements:

- Filters: all, notes, messages, tasks, meetings, proposals, automations.
- Groups: overdue, future, recent.
- Empty state explains what activity will appear.

- [ ] Step 5: Update `RecordAssociationsPanel.tsx`.

UI requirements:

- Show counts.
- Show latest associated item.
- Provide `Adicionar` where the existing module supports creation.
- Link to existing route when available.

- [ ] Step 6: Test and browser QA.

Run:

```powershell
cd frontend
npx vitest run src/services/growthWorkspaceService.test.ts src/components/crm/CrmWorkspace.test.tsx
npm run type-check
```

Browser route:

- `/leads`

Expected:

- Timeline includes mixed activity types.
- Associations panel renders without data-load errors.

## Phase 3: Campanha 360 Guided Campaign Plans

**Files:**
- Create: `supabase/migrations/20260608130000_growth_workspace_foundation.sql`
- Create: `supabase/probes/20260608130000_growth_workspace_foundation.sql`
- Create: `frontend/src/lib/growth-workspace/campaignPlanRules.ts`
- Create: `frontend/src/lib/growth-workspace/campaignPlanRules.test.ts`
- Modify: `frontend/src/types/growthWorkspace.ts`
- Modify: `frontend/src/services/growthWorkspaceService.ts`
- Modify: `frontend/src/components/campaigns/CampaignsWorkspace.tsx`
- Create: `frontend/src/components/growth-workspace/CampaignPlanWizard.tsx`
- Create: `frontend/src/components/growth-workspace/CampaignPlanDetail.tsx`
- Create: `frontend/src/components/growth-workspace/CampaignPlanStepCard.tsx`
- Modify: `frontend/src/pages/campaigns/CampaignsPage.tsx`
- Create: `frontend/src/pages/client-portal/marketing/PortalCampaignPlanPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Test: `frontend/src/components/campaigns/CampaignsWorkspace.test.tsx`

- [ ] Step 1: Write `campaignPlanRules.test.ts`.

Campaign objectives:

- `lead_generation`;
- `whatsapp_capture`;
- `offer_promotion`;
- `reactivation`;
- `appointment_booking`;
- `service_launch`;
- `remarketing`.

Expected step template for `lead_generation`:

- segment;
- landing_page;
- form;
- creative;
- ad;
- organic_post;
- whatsapp_or_email_followup;
- automation;
- approval;
- report.

- [ ] Step 2: Add the database migration.

Minimum tables:

- `growth_campaign_plans`
  - `id`, `organization_id`, `contract_id`, `name`, `objective`, `status`, `owner_id`, `source_blueprint_id`, `created_at`, `updated_at`.
- `growth_campaign_plan_steps`
  - `id`, `plan_id`, `step_key`, `label`, `module_key`, `status`, `linked_entity_type`, `linked_entity_id`, `owner_id`, `due_at`, `sort_order`, `created_at`, `updated_at`.
- `growth_smart_segments`
  - `id`, `organization_id`, `contract_id`, `name`, `description`, `filters`, `estimated_size`, `status`, `created_at`, `updated_at`.

- [ ] Step 3: Implement campaign plan rules.

Rules:

- Objective creates deterministic steps.
- Progress = completed steps / total steps.
- Blocked steps are steps with required previous incomplete steps.
- Recommended next action is first blocked/unstarted step in sort order.

- [ ] Step 4: Implement service methods.

Methods:

- `listCampaignPlans({ organizationId, contractId })`;
- `createCampaignPlan(input)`;
- `getCampaignPlan(planId)`;
- `updateCampaignPlanStep(stepId, patch)`;
- `linkCampaignPlanStep(stepId, entityType, entityId)`.

- [ ] Step 5: Add `CampaignPlanWizard`.

UI requirements:

- Ask for campaign objective first.
- Ask for sector/blueprint when available.
- Ask for campaign name and target segment.
- Show generated checklist before saving.

- [ ] Step 6: Add `CampaignPlanDetail`.

UI requirements:

- Header with objective, status, progress and next action.
- Checklist cards with step status.
- Each step has one primary action.
- Linked assets are visible.
- Missing assets are explicit.

- [ ] Step 7: Wire into internal and portal/client workspace routes.

Routes:

- internal: `/campaigns`
- portal/workspace: `/portal/marketing/campanhas`
- detail route: `/portal/marketing/campanhas/:planId`
- workspace detail route: `/client-workspaces/:organizationId/marketing/campanhas/:planId`

- [ ] Step 8: Test and browser QA.

Run:

```powershell
cd frontend
npx vitest run src/lib/growth-workspace/campaignPlanRules.test.ts src/components/campaigns/CampaignsWorkspace.test.tsx
npm run type-check
npm run build
```

Expected:

- Creating a plan produces checklist.
- Campaign detail renders in internal and portal contexts.

## Phase 4: Sector Onboarding Connected To Modelos Setoriais

**Files:**
- Create: `frontend/src/lib/growth-workspace/onboardingRules.ts`
- Create: `frontend/src/lib/growth-workspace/onboardingRules.test.ts`
- Modify: `frontend/src/types/growthWorkspace.ts`
- Modify: `frontend/src/types/platform.ts`
- Modify: `frontend/src/services/platformService.ts`
- Modify: `frontend/src/services/growthWorkspaceService.ts`
- Modify: `frontend/src/pages/platform/BlueprintsPage.tsx`
- Modify: `frontend/src/pages/platform/ClientConversionsPage.tsx`
- Create: `frontend/src/components/growth-workspace/SectorOnboardingChecklist.tsx`
- Modify: `frontend/src/pages/client-portal/PortalDashboardPage.tsx`
- Modify: `frontend/src/pages/client-workspaces/ClientWorkspaceLayout.tsx`

- [ ] Step 1: Add onboarding rule tests.

Blueprint checklist outputs:

- clinics;
- real estate;
- car dealership;
- auto repair;
- agency;
- consulting;
- generic fallback.

- [ ] Step 2: Extend migration tables if Phase 3 migration did not include onboarding.

Tables:

- `growth_onboarding_checklists`;
- `growth_onboarding_steps`.

Fields:

- `organization_id`;
- `contract_id`;
- `source_blueprint_id`;
- `status`;
- `step_key`;
- `label`;
- `module_key`;
- `status`;
- `estimated_minutes`;
- `assigned_to`;
- `completed_at`.

- [ ] Step 3: Implement `buildOnboardingChecklistFromBlueprint(blueprint)`.

Checklist categories:

- company setup;
- brand and knowledge;
- channels;
- CRM/funnel;
- campaign plan;
- automation;
- reports.

- [ ] Step 4: Create onboarding when a blueprint is applied.

Touchpoints:

- `/contracts` when applying Modelo Setorial.
- `/client-conversions` when converting a lead and applying Modelo Setorial.
- `/blueprints` when applying directly to a contract.

- [ ] Step 5: Show checklist in portal dashboard and client workspace.

UI requirements:

- Shows percent complete.
- Shows next three pending steps.
- Each step links to a real route.
- User can mark low-risk manual steps complete.
- Admin can skip step with reason.

- [ ] Step 6: Test and browser QA.

Run:

```powershell
cd frontend
npx vitest run src/lib/growth-workspace/onboardingRules.test.ts src/lib/platform/blueprintApplicationRules.test.ts
npm run type-check
```

Browser routes:

- `/blueprints`
- `/client-conversions`
- `/portal`
- `/client-workspaces/:organizationId`

Expected:

- Blueprint application can generate checklist.
- Portal dashboard shows onboarding without hiding normal next actions.

## Phase 5: Central Da Marca And Knowledge Readiness

**Files:**
- Modify: `frontend/src/pages/client-portal/company/PortalBrandVoicePage.tsx`
- Modify: `frontend/src/pages/client-portal/company/PortalKnowledgeBasePage.tsx`
- Modify: `frontend/src/hooks/usePortalMarketingContext.ts`
- Modify: `frontend/src/lib/marketing-studio/marketingStudioRules.ts`
- Modify: `frontend/src/lib/marketing-studio/marketingStudioRules.test.ts`
- Create: `frontend/src/components/growth-workspace/BrandReadinessPanel.tsx`
- Create: `frontend/src/components/growth-workspace/KnowledgeReadinessPanel.tsx`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
- Modify: `frontend/src/components/marketing-studio/PortalMarketingStudioWorkspace.tsx`

- [ ] Step 1: Add readiness rule tests.

Brand readiness inputs:

- logo present;
- colors present;
- tone of voice present;
- products/services present;
- forbidden words/topics present;
- promises/restrictions present;
- site source indexed;
- social source connected or manually skipped.

- [ ] Step 2: Extend `marketingStudioRules.ts`.

Functions:

- `summarizeBrandReadiness(profile, knowledgeDocuments)`;
- `listBrandReadinessGaps(profile, knowledgeDocuments)`;
- `canGenerateCampaignWithBrandContext(profile, knowledgeDocuments)`.

- [ ] Step 3: Upgrade `PortalBrandVoicePage.tsx` to `Central da Marca`.

Sections:

- identity kit;
- voice and tone;
- products and services;
- promises and restrictions;
- reference sources;
- site/social/document status;
- AI summary of brand.

- [ ] Step 4: Add source readiness to knowledge page.

Requirements:

- Show which modules consume each knowledge source.
- Show missing sources for Agente IA, Marketing Studio, campaigns and landing pages.
- Show last indexed date.

- [ ] Step 5: Surface brand readiness inside Marketing Studio.

Expected:

- Marketing Studio warns when brand readiness is incomplete.
- Campaign draft creation explains which brand data is missing.

- [ ] Step 6: Test and browser QA.

Run:

```powershell
cd frontend
npx vitest run src/lib/marketing-studio/marketingStudioRules.test.ts src/components/marketing-studio/MarketingStudioWorkspace.test.tsx src/components/marketing-studio/PortalMarketingStudioWorkspace.test.tsx
npm run type-check
```

Browser routes:

- `/portal/empresa/marca`
- `/portal/empresa/conhecimento`
- `/portal/marketing/studio`

Expected:

- Central da Marca renders.
- Readiness cards are visible.
- No leaked internal compliance fields in portal.

## Phase 6: Smart Segments, Guided Automations And Template Library

**Files:**
- Create: `frontend/src/lib/growth-workspace/templateRules.ts`
- Create: `frontend/src/lib/growth-workspace/templateRules.test.ts`
- Create: `frontend/src/components/growth-workspace/GrowthTemplateLibrary.tsx`
- Create: `frontend/src/components/growth-workspace/SmartSegmentBuilder.tsx`
- Modify: `frontend/src/components/crm/LeadAdvancedFilters.tsx`
- Modify: `frontend/src/components/automations/AutomationWorkspace.tsx`
- Modify: `frontend/src/components/automations/AutomationGuidedBuilder.tsx`
- Modify: `frontend/src/lib/automations/sectorTemplateCatalog.ts`
- Modify: `frontend/src/lib/automations/automationCatalog.ts`
- Modify: `frontend/src/components/campaigns/CampaignsWorkspace.tsx`
- Modify: `frontend/src/pages/client-portal/commercial/PortalCommercialLeadsPage.tsx`

- [ ] Step 1: Add template rule tests.

Template dimensions:

- sector;
- objective;
- module;
- channel;
- required modules;
- portal visibility.

- [ ] Step 2: Implement template library rules.

Templates:

- campaign;
- landing page;
- post;
- paid ad;
- WhatsApp message;
- email;
- smart segment;
- automation;
- report.

- [ ] Step 3: Add `SmartSegmentBuilder`.

UI requirements:

- Filters for source, stage, status, owner, last activity, campaign, score, proposal status.
- Estimated size.
- Save segment.
- Actions: create task, start automation, create campaign, export.

- [ ] Step 4: Add objective-first automation entry.

Question:

- `O que voce quer automatizar?`

Options:

- responder lead novo;
- follow-up de proposta;
- reativar cliente;
- confirmar agendamento;
- lembrar atendimento;
- criar tarefa para vendedor;
- avisar campanha com CPL alto;
- pedir aprovacao de criativo.

- [ ] Step 5: Connect templates to campaign plan steps.

Expected:

- A campaign plan step can open template library prefiltered by sector/objective.
- Selecting a template creates or links the proper asset when the service already supports it.

- [ ] Step 6: Test and browser QA.

Run:

```powershell
cd frontend
npx vitest run src/lib/growth-workspace/templateRules.test.ts src/lib/automations/intelligentAutomationRules.test.ts src/components/automations/AutomationWorkspace.test.tsx
npm run type-check
```

Browser routes:

- `/automations`
- `/campaigns`
- `/portal/comercial/leads`

Expected:

- User can start automations by objective.
- Smart segment builder opens from CRM/campaign context.
- Template library filters by sector/objective.

## Phase 7: Ads/MROI Executive Cockpit, Reports And Launch QA

**Files:**
- Modify: `frontend/src/components/campaigns/CampaignMetricsPanel.tsx`
- Modify: `frontend/src/components/campaigns/CampaignCreativePanel.tsx`
- Modify: `frontend/src/components/reports/ReportsWorkspace.tsx`
- Modify: `frontend/src/components/reports/PortalReportsWorkspace.tsx`
- Modify: `frontend/src/lib/reports/reportRules.ts`
- Modify: `frontend/src/lib/reports/reportRules.test.ts`
- Modify: `frontend/src/services/reportService.ts`
- Modify: `frontend/src/services/campaignService.ts`
- Modify: `docs/implementation-status.md`
- Modify: `docs/mapa-paginas-e-funcionalidades.md`

- [ ] Step 1: Add report rule tests for executive campaign metrics.

Metrics:

- spend;
- impressions;
- clicks;
- leads;
- CPL;
- opportunities;
- proposals;
- clients;
- revenue;
- MROI;
- sync status;
- AI recommendation.

- [ ] Step 2: Upgrade campaign metrics panel.

UI requirements:

- Executive summary cards.
- Provider sync health.
- Attribution model label.
- Recommendation panel.
- Link to campaign plan and report.

- [ ] Step 3: Add report presets.

Presets:

- Campaign performance;
- Lead source ROI;
- Landing page conversion;
- WhatsApp follow-up;
- Automation impact;
- Sector onboarding progress;
- Brand/knowledge readiness.

- [ ] Step 4: Add AI insight summary to reports.

Requirements:

- Explain top improvement opportunity.
- Explain what changed in the period.
- Explain data gaps.
- Never claim causation when attribution data is missing.

- [ ] Step 5: Update docs.

Docs:

- `docs/implementation-status.md`
- `docs/mapa-paginas-e-funcionalidades.md`

Must include:

- Registro 360;
- Campanha 360;
- onboarding by sector;
- Central da Marca;
- template library;
- smart segments;
- guided automations;
- executive ads/MROI cockpit.

- [ ] Step 6: Full validation.

Run:

```powershell
cd frontend
npm run type-check
npm test -- --runInBand
npm run build
```

Browser QA routes:

- `/leads`
- `/campaigns`
- `/automations`
- `/marketing-studio`
- `/reports`
- `/portal`
- `/portal/empresa/marca`
- `/portal/marketing/campanhas`
- `/portal/relatorios`
- `/client-workspaces`
- `/client-workspaces/:organizationId/marketing/campanhas`

Expected:

- No broken routes.
- No console errors.
- Portal links remain inside `/portal`.
- Client workspace links remain inside `/client-workspaces/:organizationId`.
- Internal admin links do not leak to portal users.

## Release Criteria

The evolution is considered ready for demo when:

- Registro 360 opens from CRM and shows actions, tabs, associations and intelligence.
- Campanha 360 can be created from an objective and shows a checklist of assets.
- Applying a Modelo Setorial can generate an onboarding checklist.
- Central da Marca shows readiness and missing context.
- Smart segments can be saved and used as a campaign/automation input.
- Automations can start from an objective, not only from a technical canvas.
- Ads/campaign cockpit shows spend, leads, CPL, clients and MROI.
- Portal and client workspace render the same business journey without route leakage.
- `npm run type-check`, focused tests, full tests and build pass.
- Browser QA passes on local authenticated admin and client users.

## Suggested Execution Order

Use subagent-driven development one phase at a time. Commit after each phase:

1. `feat: add record 360 foundation`
2. `feat: unify record activity and associations`
3. `feat: add guided campaign plans`
4. `feat: add sector onboarding checklists`
5. `feat: add brand readiness center`
6. `feat: add smart segments and guided templates`
7. `feat: add executive campaign reporting`

Do not merge phases if one phase fails validation. Fix the failing phase before continuing.
