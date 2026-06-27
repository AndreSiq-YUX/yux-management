# YUX Marketing Studio Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first executable Marketing Studio slice: module registration, multitenant settings, content pipeline, editorial calendar, approvals, credit ledger, typed service, and internal/portal overview surfaces.

**Architecture:** Treat Marketing Studio as a native YUX Hub module with key `marketing_studio`, not as a generic agent builder. Reuse existing canonical modules for CRM, omnichannel, campaigns, landing pages, reports, and shared knowledge; add new marketing-specific tables only where the current schema has no equivalent. Keep agent execution as a later Python/LangGraph worker plan, while this foundation stores the contracts, work items, statuses, approvals, usage, and UI shell that those workers will consume.

**Tech Stack:** Supabase Postgres/RLS/Storage, Supabase Edge Functions for lightweight authenticated commands, React 18, TypeScript, Vite, Vitest, Tailwind CSS, shadcn-style UI, lucide-react. Python/LangGraph is planned for a later runtime slice, not this foundation.

---

## Scope Decision

The source specification in `docs/yux-marketing-studio-agentes.md` covers at least ten independent implementation slices. This plan intentionally covers Fase 0 and Fase 1 only:

- remote/local Supabase drift preflight;
- module registry, permissions, contract gating;
- settings by organization/client/contract;
- marketing agents/templates metadata, without live LangGraph execution;
- marketing ideas;
- content items and versions;
- editorial calendar items;
- content reviews and approval linkage;
- AI usage ledger and credit wallet;
- internal and portal overview UI.

Separate follow-up plans should cover:

- Fase 2: organic content workspace and calendar deep UX;
- Fase 3: brand knowledge, tone of voice, embeddings, and RAG;
- Fase 4: Python worker, LangGraph runtime, and YUX Agent Harness;
- Fase 5: Radar, Jina Reader/Search, curated sources, and idea generation;
- Fase 6: writing, review, grounding, and quality gates;
- Fase 7: WordPress controlled publishing;
- Fase 8: campaign creatives and paid media agent flow;
- Fase 9: performance analysis and learning loop;
- Fase 10: social publishing and advanced integrations.

## Current-State Constraints

- Remote project: `portal-yux` / `uuowkncimiydpbxqpkej`, active.
- Remote migrations now include the reconciled commercial baseline through `20260605160400_remove_second_cleanup_marker_from_history`, including landing pages, campaigns, reports, CRM ideal slices, automation graph/materials, admin provider defaults, and Meta channel connectors.
- Remote table inspection on 2026-06-05 did not find `marketing_*`, `content_items`, `editorial_calendar_items`, `ai_usage_ledger`, or `ai_credit_wallets`.
- Existing remote tables include shared `knowledge_sources`, `knowledge_entries`, `knowledge_publications`, `approval_requests`, `approval_decisions`, `ai_message_runs`, `channel_connections`, `conversations`, `landing_pages`, `ad_provider_connections`, `campaigns`, `campaign_creatives`, `report_snapshots`, `report_widgets`, and `report_metric_cache`.
- Repo-wide validation was repaired after the original plan. Treat `npm run type-check` as an expected passing gate for this foundation slice, not as an optional signal.
- Because `landing_pages` and the API-first campaign tables exist remotely, Marketing Studio content can use real nullable foreign keys to `public.campaigns` and `public.landing_pages` in the first migration.

## File Structure

- Create: `frontend/src/types/marketingStudio.ts`
  - Domain types for marketing settings, operation modes, agents, ideas, content, calendar, reviews, credits, and usage.
- Create: `frontend/src/lib/marketing-studio/marketingStudioRules.ts`
  - Pure rules for status transitions, approval requirements, credit calculation, content visibility, and portal sanitization.
- Create: `frontend/src/lib/marketing-studio/marketingStudioRules.test.ts`
  - Focused Vitest coverage for the pure rules.
- Create with Supabase CLI: the migration file returned by `supabase migration new marketing_studio_foundation`
  - Marketing Studio tables, permissions, RLS, grants, indexes, triggers, and module seed.
- Create: a probe file in `supabase/probes/` using the same timestamp prefix as the generated migration
  - SQL probes for RLS, contract access, module gating, credit debits, and portal-safe fields.
- Create: `frontend/src/services/marketingStudioService.ts`
  - Typed Supabase service, mappers, reads, and mutations.
- Create: `frontend/src/services/marketingStudioService.test.ts`
  - Mapper and payload tests.
- Create: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
  - Internal overview and operational tabs.
- Create: `frontend/src/components/marketing-studio/PortalMarketingStudioWorkspace.tsx`
  - Simplified client portal surface.
- Create: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.test.tsx`
  - Internal workspace rendering and action tests.
- Create: `frontend/src/components/marketing-studio/PortalMarketingStudioWorkspace.test.tsx`
  - Portal visibility and sanitization tests.
- Create: `frontend/src/pages/marketing-studio/MarketingStudioPage.tsx`
  - Internal route loader.
- Create: `frontend/src/pages/client-portal/PortalMarketingStudioPage.tsx`
  - Portal route loader.
- Modify: `frontend/src/types/platform.ts`
  - Add `marketing_studio.read`, `marketing_studio.write`, `marketing_studio.configure`, `marketing_studio.supervise`.
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`
  - Add module key `marketing_studio`.
- Modify: `frontend/src/lib/platform/navigation.ts`
  - Add internal and portal navigation entries.
- Modify: `frontend/src/lib/platform/navigation.test.ts`
  - Add module visibility tests.
- Modify: `frontend/src/App.tsx`
  - Add `/marketing-studio` and `/portal/marketing-studio` routes.
- Modify if needed: `docs/implementation-status.md`
  - Add implementation status note after the foundation slice lands.

---

### Task 0: Remote and Local Preflight

**Files:**
- Read: `supabase/migrations/*.sql`
- Read: `docs/implementation-status.md`
- Read: `docs/yux-marketing-studio-agentes.md`
- Read: `frontend/src/lib/platform/moduleRegistry.ts`
- Read: `frontend/src/lib/platform/navigation.ts`

- [ ] **Step 1: Confirm working tree and recent commits**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected: only intentional untracked/modified files are present. If `docs/yux-marketing-studio-agentes.md` remains untracked, leave it untracked unless the user asks to commit it.

- [ ] **Step 2: Confirm remote Supabase state**

Use Supabase MCP against project `uuowkncimiydpbxqpkej`:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
```

Expected: record whether `landing_pages`, `ad_provider_connections`, `report_snapshots`, `marketing_studio_settings`, `content_items`, and `ai_credit_wallets` exist.

- [ ] **Step 3: Confirm reconciled commercial baseline**

Run:

```powershell
Get-ChildItem supabase\migrations | Sort-Object Name | Select-Object Name
```

Expected: local migration filenames include the reconciled `20260605...` commercial baseline, especially `20260605154759_landing_pages.sql`, `20260605154949_operational_reports.sql`, `20260605155123_campaigns_ads_api_core.sql`, and `20260605160400_remove_second_cleanup_marker_from_history.sql`. Remote migration history should contain the same versions before Marketing Studio is applied.

- [ ] **Step 4: Verify required dependency tables**

Run this SQL against the target project:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'landing_pages',
    'campaigns',
    'campaign_creatives',
    'report_snapshots',
    'report_widgets',
    'report_metric_cache'
  )
order by table_name;
```

Expected: all six rows are present. If any row is missing, stop and reconcile the commercial baseline before creating the Marketing Studio migration.

---

### Task 1: Marketing Studio Domain Types and Pure Rules

**Files:**
- Create: `frontend/src/types/marketingStudio.ts`
- Create: `frontend/src/lib/marketing-studio/marketingStudioRules.ts`
- Create: `frontend/src/lib/marketing-studio/marketingStudioRules.test.ts`

- [ ] **Step 1: Write failing pure-rule tests**

Create `frontend/src/lib/marketing-studio/marketingStudioRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  canTransitionContentStatus,
  calculateCreditsForAction,
  requiresHumanApproval,
  sanitizeMarketingContentForPortal,
  selectAllowedAgentTools,
  shouldBlockCreditDebit,
} from './marketingStudioRules'
import type { MarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

const settings: MarketingStudioSettings = {
  id: 'settings-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  operationMode: 'managed_by_yux',
  monthlyCreditLimit: 500,
  currentCreditBalance: 120,
  approvalPolicy: {
    publishSocial: true,
    publishWordPress: true,
    paidCampaignDraft: true,
    premiumImage: true,
    regulatedContent: true,
  },
  allowedChannels: ['linkedin', 'instagram', 'blog', 'newsletter'],
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const content: MarketingContentItem = {
  id: 'content-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  title: 'Post sobre funil',
  contentType: 'social_post',
  channel: 'linkedin',
  status: 'draft',
  brief: 'Explicar funil comercial para PMEs',
  body: 'Texto interno',
  cta: 'Fale com a YUX',
  createdByAgentId: 'agent-1',
  internalNotes: 'Margem e custo interno',
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

describe('marketingStudioRules', () => {
  it('requires human approval for publish and sensitive actions', () => {
    expect(requiresHumanApproval({ action: 'publish_wordpress', settings })).toBe(true)
    expect(requiresHumanApproval({ action: 'generate_short_caption', settings })).toBe(false)
    expect(requiresHumanApproval({ action: 'regulated_claim', settings })).toBe(true)
  })

  it('allows explicit content workflow transitions only', () => {
    expect(canTransitionContentStatus('draft', 'in_review')).toBe(true)
    expect(canTransitionContentStatus('in_review', 'approved')).toBe(true)
    expect(canTransitionContentStatus('approved', 'scheduled')).toBe(true)
    expect(canTransitionContentStatus('draft', 'published')).toBe(false)
    expect(canTransitionContentStatus('rejected', 'published')).toBe(false)
  })

  it('calculates credits by action and premium multiplier', () => {
    expect(calculateCreditsForAction({ action: 'classify_idea' })).toBe(1)
    expect(calculateCreditsForAction({ action: 'generate_blog_article' })).toBe(30)
    expect(calculateCreditsForAction({ action: 'generate_image', premium: true })).toBe(60)
  })

  it('blocks debit when balance or monthly limit is exceeded', () => {
    expect(shouldBlockCreditDebit({ balance: 4, monthlyUsed: 100, monthlyLimit: 500, debit: 5 })).toBe(true)
    expect(shouldBlockCreditDebit({ balance: 20, monthlyUsed: 499, monthlyLimit: 500, debit: 2 })).toBe(true)
    expect(shouldBlockCreditDebit({ balance: 20, monthlyUsed: 100, monthlyLimit: 500, debit: 5 })).toBe(false)
  })

  it('limits agent tools by agent type and operation mode', () => {
    expect(selectAllowedAgentTools({ agentType: 'content_radar', operationMode: 'managed_by_yux' })).toEqual([
      'jina_reader',
      'jina_search',
      'curated_sources',
    ])
    expect(selectAllowedAgentTools({ agentType: 'controlled_publisher', operationMode: 'assisted_client' })).toEqual([
      'create_task',
      'create_wordpress_draft',
    ])
  })

  it('removes internal fields from portal content', () => {
    expect(sanitizeMarketingContentForPortal(content)).toEqual({
      id: 'content-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: 'Post sobre funil',
      contentType: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      brief: 'Explicar funil comercial para PMEs',
      body: 'Texto interno',
      cta: 'Fale com a YUX',
      createdByAgentId: 'agent-1',
      createdAt: '2026-06-05T12:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    })
  })
})
```

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```powershell
cd frontend
npm test -- src/lib/marketing-studio/marketingStudioRules.test.ts
```

Expected: fail because the type and rule modules do not exist.

- [ ] **Step 3: Add domain types**

Create `frontend/src/types/marketingStudio.ts`:

```ts
export type MarketingOperationMode = 'managed_by_yux' | 'assisted_client' | 'advanced_partner'
export type MarketingAgentType =
  | 'content_radar'
  | 'strategic_curator'
  | 'content_strategist'
  | 'multichannel_writer'
  | 'brand_quality_reviewer'
  | 'campaign_strategist'
  | 'visual_creative_generator'
  | 'editorial_calendar_manager'
  | 'controlled_publisher'
  | 'performance_analyst'

export type MarketingToolKey =
  | 'curated_sources'
  | 'jina_reader'
  | 'jina_search'
  | 'jina_grounding'
  | 'tavily_search'
  | 'serper_search'
  | 'firecrawl'
  | 'youtube_data'
  | 'rag_search'
  | 'create_task'
  | 'create_wordpress_draft'
  | 'publish_wordpress'
  | 'campaign_draft'
  | 'image_generation'

export type MarketingChannel =
  | 'linkedin'
  | 'instagram'
  | 'blog'
  | 'newsletter'
  | 'email'
  | 'ad'
  | 'video_script'
  | 'carousel'
  | 'whatsapp_broadcast'

export type MarketingContentType =
  | 'social_post'
  | 'blog_article'
  | 'newsletter'
  | 'email'
  | 'ad_copy'
  | 'video_script'
  | 'carousel_text'
  | 'creative_brief'

export type MarketingContentStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'archived'

export type MarketingIdeaStatus = 'captured' | 'curated' | 'approved' | 'rejected' | 'converted'
export type MarketingUsageAction =
  | 'classify_idea'
  | 'summarize_source'
  | 'read_url'
  | 'simple_search'
  | 'generate_short_caption'
  | 'generate_social_post'
  | 'generate_carousel'
  | 'generate_variations'
  | 'generate_blog_article'
  | 'deep_research'
  | 'grounding_short'
  | 'grounding_article'
  | 'generate_image'
  | 'monthly_performance_analysis'

export interface MarketingApprovalPolicy {
  publishSocial: boolean
  publishWordPress: boolean
  paidCampaignDraft: boolean
  premiumImage: boolean
  regulatedContent: boolean
}

export interface MarketingStudioSettings {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  operationMode: MarketingOperationMode
  monthlyCreditLimit: number
  currentCreditBalance: number
  approvalPolicy: MarketingApprovalPolicy
  allowedChannels: MarketingChannel[]
  toneOfVoice?: string
  persona?: string
  visualPreferences?: string
  forbiddenTopics?: string[]
  priorityTopics?: string[]
  createdAt: string
  updatedAt: string
}

export interface MarketingAgent {
  id: string
  organizationId: string
  clientId?: string
  contractId?: string
  name: string
  agentType: MarketingAgentType
  description: string
  status: 'active' | 'paused' | 'archived'
  defaultModel?: string
  fallbackModel?: string
  allowedTools: MarketingToolKey[]
  requiresHumanApproval: boolean
  maxCostPerRun?: number
  maxRunsPerDay?: number
  createdAt: string
  updatedAt: string
}

export interface MarketingIdea {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  title: string
  summary: string
  status: MarketingIdeaStatus
  sourceType: 'manual' | 'radar' | 'crm' | 'omnichannel' | 'campaign' | 'report'
  sourceUrl?: string
  sourceReferenceId?: string
  priority: 'low' | 'medium' | 'high'
  opportunityScore: number
  suggestedChannel?: MarketingChannel
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

export interface MarketingContentItem {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  title: string
  contentType: MarketingContentType
  channel: MarketingChannel
  status: MarketingContentStatus
  brief?: string
  body?: string
  cta?: string
  campaignId?: string
  landingPageId?: string
  sourceIdeaId?: string
  createdByAgentId?: string
  approvedBy?: string
  scheduledAt?: string
  publishedAt?: string
  publishedUrl?: string
  internalNotes?: string
  createdAt: string
  updatedAt: string
}

export type PortalMarketingContentItem = Omit<MarketingContentItem, 'internalNotes'> & {
  internalNotes?: never
}

export interface MarketingUsageLedgerEntry {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  userId?: string
  agentId?: string
  workflowRunId?: string
  action: MarketingUsageAction
  provider?: string
  model?: string
  inputTokens: number
  outputTokens: number
  rawCostEstimate: number
  creditsCharged: number
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  createdAt: string
}
```

- [ ] **Step 4: Implement pure rules**

Create `frontend/src/lib/marketing-studio/marketingStudioRules.ts`:

```ts
import type {
  MarketingAgentType,
  MarketingContentItem,
  MarketingContentStatus,
  MarketingOperationMode,
  MarketingStudioSettings,
  MarketingToolKey,
  MarketingUsageAction,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'

const transitionMap: Record<MarketingContentStatus, MarketingContentStatus[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['changes_requested', 'approved', 'rejected'],
  changes_requested: ['draft', 'in_review', 'archived'],
  approved: ['scheduled', 'published', 'archived'],
  scheduled: ['published', 'approved', 'archived'],
  published: ['archived'],
  rejected: ['draft', 'archived'],
  archived: [],
}

const creditByAction: Record<MarketingUsageAction, number> = {
  classify_idea: 1,
  summarize_source: 2,
  read_url: 2,
  simple_search: 8,
  generate_short_caption: 3,
  generate_social_post: 5,
  generate_carousel: 10,
  generate_variations: 16,
  generate_blog_article: 30,
  deep_research: 35,
  grounding_short: 10,
  grounding_article: 30,
  generate_image: 25,
  monthly_performance_analysis: 50,
}

const baseToolsByAgent: Record<MarketingAgentType, MarketingToolKey[]> = {
  content_radar: ['jina_reader', 'jina_search', 'curated_sources'],
  strategic_curator: ['curated_sources', 'rag_search'],
  content_strategist: ['curated_sources', 'rag_search'],
  multichannel_writer: ['rag_search'],
  brand_quality_reviewer: ['rag_search', 'jina_grounding'],
  campaign_strategist: ['campaign_draft', 'rag_search'],
  visual_creative_generator: ['image_generation', 'rag_search'],
  editorial_calendar_manager: ['create_task'],
  controlled_publisher: ['create_task', 'create_wordpress_draft'],
  performance_analyst: ['rag_search'],
}

export function requiresHumanApproval(input: {
  action: 'publish_social' | 'publish_wordpress' | 'paid_campaign_draft' | 'premium_image' | 'regulated_claim' | 'generate_short_caption'
  settings: MarketingStudioSettings
}) {
  if (input.action === 'publish_social') return input.settings.approvalPolicy.publishSocial
  if (input.action === 'publish_wordpress') return input.settings.approvalPolicy.publishWordPress
  if (input.action === 'paid_campaign_draft') return input.settings.approvalPolicy.paidCampaignDraft
  if (input.action === 'premium_image') return input.settings.approvalPolicy.premiumImage
  if (input.action === 'regulated_claim') return input.settings.approvalPolicy.regulatedContent
  return false
}

export function canTransitionContentStatus(from: MarketingContentStatus, to: MarketingContentStatus) {
  return transitionMap[from].includes(to)
}

export function calculateCreditsForAction(input: { action: MarketingUsageAction; premium?: boolean }) {
  const baseCredits = creditByAction[input.action]
  return input.action === 'generate_image' && input.premium ? Math.max(baseCredits, 60) : baseCredits
}

export function shouldBlockCreditDebit(input: { balance: number; monthlyUsed: number; monthlyLimit: number; debit: number }) {
  return input.balance < input.debit || input.monthlyUsed + input.debit > input.monthlyLimit
}

export function selectAllowedAgentTools(input: { agentType: MarketingAgentType; operationMode: MarketingOperationMode }) {
  const tools = baseToolsByAgent[input.agentType]
  if (input.operationMode === 'advanced_partner') return tools
  if (input.operationMode === 'assisted_client') return tools.filter(tool => tool !== 'publish_wordpress')
  return tools.filter(tool => tool !== 'publish_wordpress' && tool !== 'campaign_draft')
}

export function sanitizeMarketingContentForPortal(content: MarketingContentItem): PortalMarketingContentItem {
  const { internalNotes: _internalNotes, ...portalContent } = content
  return portalContent
}
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
cd frontend
npm test -- src/lib/marketing-studio/marketingStudioRules.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add frontend/src/types/marketingStudio.ts frontend/src/lib/marketing-studio
git commit -m "feat: add marketing studio domain rules"
```

---

### Task 2: Supabase Foundation Schema, RLS, Permissions, and Probes

**Files:**
- Create with CLI: the migration file returned by `supabase migration new marketing_studio_foundation`
- Create: a probe file in `supabase/probes/` using the same timestamp prefix as the generated migration
- Modify: `frontend/src/types/platform.ts`
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/lib/platform/navigation.test.ts`

- [ ] **Step 1: Check current Supabase CLI and docs**

Run:

```powershell
supabase --version
supabase migration new --help
supabase db push --help
```

Fetch `https://supabase.com/changelog.md` and scan breaking-change entries relevant to RLS, Data API grants, and Edge Function deployment.

Expected: record CLI version and no relevant breaking change requiring a schema strategy change.

- [ ] **Step 2: Generate migration**

Run:

```powershell
supabase migration new marketing_studio_foundation
```

Expected: Supabase CLI creates `supabase/migrations/<timestamp>_marketing_studio_foundation.sql`.

- [ ] **Step 3: Add schema to generated migration**

Use the generated file. Include these public tables:

```sql
create table public.marketing_studio_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  operation_mode text not null default 'managed_by_yux'
    check (operation_mode in ('managed_by_yux', 'assisted_client', 'advanced_partner')),
  monthly_credit_limit integer not null default 0 check (monthly_credit_limit >= 0),
  current_credit_balance integer not null default 0 check (current_credit_balance >= 0),
  approval_policy jsonb not null default jsonb_build_object(
    'publishSocial', true,
    'publishWordPress', true,
    'paidCampaignDraft', true,
    'premiumImage', true,
    'regulatedContent', true
  ) check (jsonb_typeof(approval_policy) = 'object'),
  allowed_channels text[] not null default array['linkedin','instagram','blog','newsletter']::text[],
  tone_of_voice text,
  persona text,
  visual_preferences text,
  forbidden_topics text[] not null default '{}'::text[],
  priority_topics text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id)
);

create table public.marketing_agent_templates (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null unique,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  default_tools text[] not null default '{}'::text[],
  requires_human_approval boolean not null default true,
  default_model text,
  fallback_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  template_id uuid references public.marketing_agent_templates(id) on delete set null,
  name text not null check (btrim(name) <> ''),
  agent_type text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  base_prompt text,
  default_model text,
  fallback_model text,
  allowed_tools text[] not null default '{}'::text[],
  requires_human_approval boolean not null default true,
  max_cost_per_run numeric(12,4),
  max_runs_per_day integer,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  source_type text not null check (source_type in ('rss','blog','news','youtube','competitor','crm','omnichannel','campaign','manual')),
  name text not null check (btrim(name) <> ''),
  source_url text,
  status text not null default 'active' check (status in ('active','paused','failed','archived')),
  last_read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  source_id uuid references public.marketing_sources(id) on delete set null,
  source_reference_id uuid,
  title text not null check (btrim(title) <> ''),
  summary text not null default '',
  status text not null default 'captured' check (status in ('captured','curated','approved','rejected','converted')),
  source_type text not null default 'manual' check (source_type in ('manual','radar','crm','omnichannel','campaign','report')),
  source_url text,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  suggested_channel text,
  rejection_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  content_type text not null check (content_type in ('social_post','blog_article','newsletter','email','ad_copy','video_script','carousel_text','creative_brief')),
  channel text not null,
  status text not null default 'draft' check (status in ('draft','in_review','changes_requested','approved','scheduled','published','rejected','archived')),
  brief text,
  body text,
  cta text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  landing_page_id uuid references public.landing_pages(id) on delete set null,
  source_idea_id uuid references public.marketing_ideas(id) on delete set null,
  created_by_agent_id uuid references public.marketing_agents(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  scheduled_at timestamptz,
  published_at timestamptz,
  published_url text,
  internal_notes text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null check (btrim(title) <> ''),
  body text,
  change_summary text,
  created_by uuid references public.users(id) on delete set null,
  created_by_agent_id uuid references public.marketing_agents(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_item_id, version_number)
);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  reviewer_id uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested','rejected')),
  quality_score integer check (quality_score between 0 and 100),
  comments text,
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.editorial_calendar_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  channel text not null,
  status text not null default 'planned' check (status in ('planned','ready','scheduled','published','missed','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  responsible_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_credit_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  monthly_limit integer not null default 0 check (monthly_limit >= 0),
  current_balance integer not null default 0 check (current_balance >= 0),
  monthly_used integer not null default 0 check (monthly_used >= 0),
  reset_day integer not null default 1 check (reset_day between 1 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id)
);

create table public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  wallet_id uuid references public.ai_credit_wallets(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  agent_id uuid references public.marketing_agents(id) on delete set null,
  workflow_run_id uuid,
  action text not null,
  provider text,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  tool_name text,
  raw_cost_estimate numeric(12,6) not null default 0 check (raw_cost_estimate >= 0),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
```

Add indexes, update triggers, and seed `marketing_agent_templates` for the ten agent types from the source spec.

- [ ] **Step 4: Add private helpers, RLS, grants, and module seed**

Add private helpers:

```sql
create or replace function private.can_read_marketing_studio_contract(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_internal_user()
    or exists (
      select 1
      from public.contracts c
      join public.contract_modules cm
        on cm.contract_id = c.id
       and cm.module_key = 'marketing_studio'
       and cm.enabled = true
      where c.id = target_contract_id
        and c.status = 'active'
        and private.can_access_client(c.client_id)
    );
$$;

create or replace function private.can_manage_marketing_studio_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_internal_user()
    and exists (
      select 1
      from public.organizations o
      where o.id = target_organization_id
    );
$$;
```

Apply RLS:

```sql
alter table public.marketing_studio_settings enable row level security;
alter table public.marketing_agent_templates enable row level security;
alter table public.marketing_agents enable row level security;
alter table public.marketing_sources enable row level security;
alter table public.marketing_ideas enable row level security;
alter table public.content_items enable row level security;
alter table public.content_versions enable row level security;
alter table public.content_reviews enable row level security;
alter table public.editorial_calendar_items enable row level security;
alter table public.ai_credit_wallets enable row level security;
alter table public.ai_usage_ledger enable row level security;
```

Policy pattern:

```sql
create policy "Internal users manage marketing content" on public.content_items
  for all using (private.can_manage_marketing_studio_organization(organization_id))
  with check (private.can_manage_marketing_studio_organization(organization_id));

create policy "Portal users read contracted marketing content" on public.content_items
  for select using (private.can_read_marketing_studio_contract(contract_id));
```

Repeat this pattern for settings, agents, sources, ideas, versions, reviews, calendar, wallets, and ledger. For `marketing_agent_templates`, allow authenticated read and internal manage.

Seed permissions and module:

```sql
insert into public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
values (
  'marketing_studio',
  'Marketing Studio',
  false,
  '/marketing-studio',
  '/portal/marketing-studio',
  array['marketing_studio.read']::text[]
)
on conflict (key) do update
set name = excluded.name,
    internal_route = excluded.internal_route,
    portal_route = excluded.portal_route,
    required_permissions = excluded.required_permissions,
    updated_at = now();

insert into public.role_permissions (role_key, permission_key)
values
  ('yux_admin', 'marketing_studio.read'),
  ('yux_admin', 'marketing_studio.write'),
  ('yux_admin', 'marketing_studio.configure'),
  ('yux_admin', 'marketing_studio.supervise'),
  ('yux_manager', 'marketing_studio.read'),
  ('yux_manager', 'marketing_studio.write'),
  ('yux_manager', 'marketing_studio.configure'),
  ('yux_manager', 'marketing_studio.supervise'),
  ('yux_member', 'marketing_studio.read'),
  ('yux_member', 'marketing_studio.write'),
  ('client_admin', 'marketing_studio.read'),
  ('client_admin', 'marketing_studio.write'),
  ('client_admin', 'marketing_studio.configure'),
  ('client_member', 'marketing_studio.read')
on conflict (role_key, permission_key) do nothing;
```

- [ ] **Step 5: Add SQL probes**

Create the matching probe file in `supabase/probes/` with the same timestamp prefix as the generated migration:

```sql
do $$
begin
  if not exists (
    select 1 from public.platform_modules where key = 'marketing_studio'
  ) then
    raise exception 'marketing_studio module missing';
  end if;

  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'marketing_studio_settings',
        'marketing_agents',
        'marketing_sources',
        'marketing_ideas',
        'content_items',
        'content_versions',
        'content_reviews',
        'editorial_calendar_items',
        'ai_credit_wallets',
        'ai_usage_ledger'
      )
      and rowsecurity = false
  ) then
    raise exception 'marketing studio tables without RLS';
  end if;

  if not exists (
    select 1
    from public.role_permissions
    where role_key = 'client_admin'
      and permission_key = 'marketing_studio.read'
  ) then
    raise exception 'client_admin marketing_studio.read permission missing';
  end if;
end $$;
```

- [ ] **Step 6: Update frontend platform metadata tests**

Extend `frontend/src/lib/platform/navigation.test.ts` with:

```ts
it('routes Marketing Studio internally and in the contracted portal', () => {
  const internalItems = buildNavigation({
    ...internalContext,
    role: {
      key: 'yux_manager',
      name: 'YUX Manager',
      scope: 'internal',
      permissions: ['marketing_studio.read'],
    },
    enabledModuleKeys: ['marketing_studio'],
  })
  const portalItems = buildNavigation({
    ...internalContext,
    mode: 'portal',
    role: {
      key: 'client_admin',
      name: 'Client Admin',
      scope: 'client',
      permissions: ['marketing_studio.read'],
    },
    enabledModuleKeys: ['marketing_studio'],
  })

  expect(internalItems.find(item => item.moduleKey === 'marketing_studio')).toEqual({
    label: 'Marketing Studio',
    href: '/marketing-studio',
    moduleKey: 'marketing_studio',
  })
  expect(portalItems.find(item => item.moduleKey === 'marketing_studio')).toEqual({
    label: 'Marketing Studio',
    href: '/portal/marketing-studio',
    moduleKey: 'marketing_studio',
  })
})
```

- [ ] **Step 7: Implement platform metadata**

Update `frontend/src/types/platform.ts`:

```ts
  | 'marketing_studio.read'
  | 'marketing_studio.write'
  | 'marketing_studio.configure'
  | 'marketing_studio.supervise'
```

Update `frontend/src/lib/platform/moduleRegistry.ts`:

```ts
  {
    key: 'marketing_studio',
    name: 'Marketing Studio',
    base: false,
    internalRoute: '/marketing-studio',
    portalRoute: '/portal/marketing-studio',
    requiredPermissions: ['marketing_studio.read'],
  },
```

Update `frontend/src/lib/platform/navigation.ts` by adding the item to the `Comercial` group after `Conversas IA`:

```ts
{ label: 'Marketing Studio', href: '/marketing-studio', moduleKey: 'marketing_studio' },
```

- [ ] **Step 8: Run focused checks**

Run:

```powershell
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/lib/marketing-studio/marketingStudioRules.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

Run:

```powershell
git add supabase/migrations supabase/probes frontend/src/types/platform.ts frontend/src/lib/platform/moduleRegistry.ts frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts
git commit -m "feat: add marketing studio foundation schema"
```

---

### Task 3: Typed Marketing Studio Service

**Files:**
- Create: `frontend/src/services/marketingStudioService.ts`
- Create: `frontend/src/services/marketingStudioService.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `frontend/src/services/marketingStudioService.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildContentInsertPayload,
  buildIdeaInsertPayload,
  buildUsageLedgerPayload,
  mapMarketingContent,
  mapMarketingSettings,
} from './marketingStudioService'

describe('marketingStudioService mapping helpers', () => {
  it('maps settings rows to camelCase domain objects', () => {
    expect(mapMarketingSettings({
      id: 'settings-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      operation_mode: 'managed_by_yux',
      monthly_credit_limit: 500,
      current_credit_balance: 120,
      approval_policy: { publishSocial: true },
      allowed_channels: ['linkedin'],
      tone_of_voice: 'consultivo',
      persona: null,
      visual_preferences: null,
      forbidden_topics: ['promessa garantida'],
      priority_topics: ['ia para pmes'],
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'settings-1',
      organizationId: 'org-1',
      operationMode: 'managed_by_yux',
      monthlyCreditLimit: 500,
      currentCreditBalance: 120,
      allowedChannels: ['linkedin'],
      toneOfVoice: 'consultivo',
    })
  })

  it('builds idea insert payload with trimmed fields', () => {
    expect(buildIdeaInsertPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: '  Topico  ',
      summary: '  Resumo  ',
      sourceType: 'manual',
      priority: 'high',
      opportunityScore: 80,
    })).toMatchObject({
      organization_id: 'org-1',
      title: 'Topico',
      summary: 'Resumo',
      source_type: 'manual',
      priority: 'high',
      opportunity_score: 80,
    })
  })

  it('maps content and strips internal notes only through portal rules', () => {
    const mapped = mapMarketingContent({
      id: 'content-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      title: 'Post',
      content_type: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      brief: null,
      body: 'Body',
      cta: null,
      campaign_id: null,
      landing_page_id: null,
      source_idea_id: null,
      created_by_agent_id: null,
      approved_by: null,
      scheduled_at: null,
      published_at: null,
      published_url: null,
      internal_notes: 'Custo interno',
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })

    expect(mapped.internalNotes).toBe('Custo interno')
  })

  it('builds usage ledger payload with numeric defaults', () => {
    expect(buildUsageLedgerPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      action: 'generate_social_post',
      creditsCharged: 5,
    })).toMatchObject({
      organization_id: 'org-1',
      action: 'generate_social_post',
      input_tokens: 0,
      output_tokens: 0,
      raw_cost_estimate: 0,
      credits_charged: 5,
      status: 'pending',
    })
  })
})
```

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```powershell
cd frontend
npm test -- src/services/marketingStudioService.test.ts
```

Expected: fail because the service does not exist.

- [ ] **Step 3: Implement service mappers and payload builders**

Create `frontend/src/services/marketingStudioService.ts` with exported helper functions and service methods:

```ts
import { supabase } from '@/lib/supabase'
import { sanitizeMarketingContentForPortal } from '@/lib/marketing-studio/marketingStudioRules'
import type {
  MarketingContentItem,
  MarketingIdea,
  MarketingStudioSettings,
  MarketingUsageLedgerEntry,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'

export function mapMarketingSettings(row: any): MarketingStudioSettings {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    operationMode: row.operation_mode,
    monthlyCreditLimit: Number(row.monthly_credit_limit || 0),
    currentCreditBalance: Number(row.current_credit_balance || 0),
    approvalPolicy: row.approval_policy || {},
    allowedChannels: row.allowed_channels || [],
    toneOfVoice: row.tone_of_voice || undefined,
    persona: row.persona || undefined,
    visualPreferences: row.visual_preferences || undefined,
    forbiddenTopics: row.forbidden_topics || [],
    priorityTopics: row.priority_topics || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingContent(row: any): MarketingContentItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    title: row.title,
    contentType: row.content_type,
    channel: row.channel,
    status: row.status,
    brief: row.brief || undefined,
    body: row.body || undefined,
    cta: row.cta || undefined,
    campaignId: row.campaign_id || undefined,
    landingPageId: row.landing_page_id || undefined,
    sourceIdeaId: row.source_idea_id || undefined,
    createdByAgentId: row.created_by_agent_id || undefined,
    approvedBy: row.approved_by || undefined,
    scheduledAt: row.scheduled_at || undefined,
    publishedAt: row.published_at || undefined,
    publishedUrl: row.published_url || undefined,
    internalNotes: row.internal_notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildIdeaInsertPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  summary: string
  sourceType: MarketingIdea['sourceType']
  priority?: MarketingIdea['priority']
  opportunityScore?: number
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    source_type: input.sourceType,
    priority: input.priority || 'medium',
    opportunity_score: input.opportunityScore || 0,
  }
}

export function buildContentInsertPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  contentType: MarketingContentItem['contentType']
  channel: MarketingContentItem['channel']
  brief?: string
  body?: string
  cta?: string
  sourceIdeaId?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    title: input.title.trim(),
    content_type: input.contentType,
    channel: input.channel,
    brief: input.brief?.trim() || null,
    body: input.body?.trim() || null,
    cta: input.cta?.trim() || null,
    source_idea_id: input.sourceIdeaId || null,
  }
}

export function buildUsageLedgerPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  action: MarketingUsageLedgerEntry['action']
  creditsCharged: number
  userId?: string
  agentId?: string
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  rawCostEstimate?: number
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    user_id: input.userId || null,
    agent_id: input.agentId || null,
    action: input.action,
    provider: input.provider || null,
    model: input.model || null,
    input_tokens: input.inputTokens || 0,
    output_tokens: input.outputTokens || 0,
    raw_cost_estimate: input.rawCostEstimate || 0,
    credits_charged: input.creditsCharged,
    status: 'pending',
  }
}

const CONTENT_SELECT = '*'

export const marketingStudioService = {
  async getSettings(contractId: string) {
    const { data, error } = await supabase.from('marketing_studio_settings').select('*').eq('contract_id', contractId).maybeSingle()
    if (error) throw error
    return data ? mapMarketingSettings(data) : null
  },

  async getContents(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('content_items').select(CONTENT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingContent)
  },

  async getPortalContents(contractId: string): Promise<PortalMarketingContentItem[]> {
    const contents = await marketingStudioService.getContents({ contractId })
    return contents.map(sanitizeMarketingContentForPortal)
  },

  async createIdea(input: Parameters<typeof buildIdeaInsertPayload>[0]) {
    const { data, error } = await supabase.from('marketing_ideas').insert(buildIdeaInsertPayload(input)).select().single()
    if (error) throw error
    return data
  },

  async createContent(input: Parameters<typeof buildContentInsertPayload>[0]) {
    const { data, error } = await supabase.from('content_items').insert(buildContentInsertPayload(input)).select(CONTENT_SELECT).single()
    if (error) throw error
    return mapMarketingContent(data)
  },

  async updateContentStatus(id: string, status: MarketingContentItem['status']) {
    const { data, error } = await supabase.from('content_items').update({ status }).eq('id', id).select(CONTENT_SELECT).single()
    if (error) throw error
    return mapMarketingContent(data)
  },
}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
cd frontend
npm test -- src/services/marketingStudioService.test.ts src/lib/marketing-studio/marketingStudioRules.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/services/marketingStudioService.ts frontend/src/services/marketingStudioService.test.ts
git commit -m "feat: add marketing studio service"
```

---

### Task 4: Internal and Portal Marketing Studio Surfaces

**Files:**
- Create: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
- Create: `frontend/src/components/marketing-studio/PortalMarketingStudioWorkspace.tsx`
- Create: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.test.tsx`
- Create: `frontend/src/components/marketing-studio/PortalMarketingStudioWorkspace.test.tsx`
- Create: `frontend/src/pages/marketing-studio/MarketingStudioPage.tsx`
- Create: `frontend/src/pages/client-portal/PortalMarketingStudioPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing workspace tests**

Create internal tests that verify:

- overview metrics for contents in production, pending approvals, ideas, scheduled posts, and credit balance;
- tabs for `Visao geral`, `Conteudo`, `Calendario`, `Aprovacoes`, `Ideias`, `Agentes`, `Creditos`;
- internal-only operational text such as agent status and credit usage is visible internally.

Create portal tests that verify:

- portal shows calendar, approval queue, content list, campaign/creative summaries, reports link, and credits;
- portal does not render internal notes, raw model/provider fields, token counts, or protected error text.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
cd frontend
npm test -- src/components/marketing-studio/MarketingStudioWorkspace.test.tsx src/components/marketing-studio/PortalMarketingStudioWorkspace.test.tsx
```

Expected: fail because the components do not exist.

- [ ] **Step 3: Implement internal workspace**

Create a dense operational layout using existing UI components:

```tsx
import type { MarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

interface MarketingStudioWorkspaceProps {
  contents: MarketingContentItem[]
  settings: MarketingStudioSettings | null
  onRefresh: () => void
}

export function MarketingStudioWorkspace({ contents, settings, onRefresh }: MarketingStudioWorkspaceProps) {
  const pendingApprovals = contents.filter(content => content.status === 'in_review').length
  const scheduled = contents.filter(content => content.status === 'scheduled').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
          <p className="text-sm text-slate-600">Operacao multicliente de conteudo, calendario, aprovacoes e creditos.</p>
        </div>
        <button type="button" onClick={onRefresh} className="rounded-md border px-3 py-2 text-sm">
          Atualizar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Conteudos" value={contents.length} />
        <Metric label="Aprovacoes" value={pendingApprovals} />
        <Metric label="Agendados" value={scheduled} />
        <Metric label="Creditos" value={settings?.currentCreditBalance ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-base font-semibold text-slate-950">Conteudo em producao</h2>
          <div className="mt-3 divide-y rounded-md border">
            {contents.map(content => (
              <article key={content.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-950">{content.title}</h3>
                    <p className="text-xs text-slate-500">{content.channel} / {content.contentType}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{content.status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-950">Operacao</h2>
          <div className="mt-3 rounded-md border p-3 text-sm text-slate-700">
            <p>Modo: {settings?.operationMode ?? 'sem configuracao'}</p>
            <p>Limite mensal: {settings?.monthlyCreditLimit ?? 0}</p>
            <p>Canais: {settings?.allowedChannels.join(', ') || 'nao configurado'}</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}
```

- [ ] **Step 4: Implement portal workspace**

Create a simplified portal surface that accepts portal-safe content:

```tsx
import type { PortalMarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

interface PortalMarketingStudioWorkspaceProps {
  contents: PortalMarketingContentItem[]
  settings: MarketingStudioSettings | null
}

export function PortalMarketingStudioWorkspace({ contents, settings }: PortalMarketingStudioWorkspaceProps) {
  const pending = contents.filter(content => content.status === 'in_review').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
        <p className="text-sm text-slate-600">Calendario, conteudos e aprovacoes do seu contrato.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-white p-3">
          <p className="text-xs text-slate-500">Aguardando aprovacao</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{pending}</p>
        </div>
        <div className="rounded-md border bg-white p-3">
          <p className="text-xs text-slate-500">Conteudos</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{contents.length}</p>
        </div>
        <div className="rounded-md border bg-white p-3">
          <p className="text-xs text-slate-500">Creditos</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{settings?.currentCreditBalance ?? 0}</p>
        </div>
      </div>

      <section>
        <h2 className="text-base font-semibold text-slate-950">Conteudos</h2>
        <div className="mt-3 divide-y rounded-md border">
          {contents.map(content => (
            <article key={content.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-950">{content.title}</h3>
                  <p className="text-xs text-slate-500">{content.channel}</p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{content.status}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Implement route pages**

Create `frontend/src/pages/marketing-studio/MarketingStudioPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MarketingStudioWorkspace } from '@/components/marketing-studio/MarketingStudioWorkspace'
import { marketingStudioService } from '@/services/marketingStudioService'
import { platformService } from '@/services/platformService'
import type { MarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

export function MarketingStudioPage() {
  const [contents, setContents] = useState<MarketingContentItem[]>([])
  const [settings, setSettings] = useState<MarketingStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const contracts = await platformService.getContracts()
      const defaultContract = contracts[0]
      const loadedContents = await marketingStudioService.getContents()
      setContents(loadedContents)
      setSettings(defaultContract ? await marketingStudioService.getSettings(defaultContract.id) : null)
    } catch (error) {
      console.error('Erro ao carregar Marketing Studio:', error)
      toast.error('Erro ao carregar Marketing Studio')
      setContents([])
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>

  return <MarketingStudioWorkspace contents={contents} settings={settings} onRefresh={load} />
}
```

Create `frontend/src/pages/client-portal/PortalMarketingStudioPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalMarketingStudioWorkspace } from '@/components/marketing-studio/PortalMarketingStudioWorkspace'
import { marketingStudioService } from '@/services/marketingStudioService'
import { usePlatformStore } from '@/stores/platformStore'
import type { MarketingStudioSettings, PortalMarketingContentItem } from '@/types/marketingStudio'

export function PortalMarketingStudioPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const [contents, setContents] = useState<PortalMarketingContentItem[]>([])
  const [settings, setSettings] = useState<MarketingStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeContract) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [loadedContents, loadedSettings] = await Promise.all([
        marketingStudioService.getPortalContents(activeContract.id),
        marketingStudioService.getSettings(activeContract.id),
      ])
      setContents(loadedContents)
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Erro ao carregar Marketing Studio do portal:', error)
      toast.error('Erro ao carregar Marketing Studio')
      setContents([])
      setSettings(null)
    } finally {
      setLoading(false)
    }
  }, [activeContract])

  useEffect(() => {
    load()
  }, [load])

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  if (loading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>

  return <PortalMarketingStudioWorkspace contents={contents} settings={settings} />
}
```

- [ ] **Step 6: Wire routes**

Update `frontend/src/App.tsx` imports:

```ts
import { MarketingStudioPage } from '@/pages/marketing-studio/MarketingStudioPage'
import { PortalMarketingStudioPage } from '@/pages/client-portal/PortalMarketingStudioPage'
```

Add internal route:

```tsx
<Route path="marketing-studio" element={<MarketingStudioPage />} />
```

Add portal route:

```tsx
<Route path="portal/marketing-studio" element={<PortalMarketingStudioPage />} />
```

- [ ] **Step 7: Run focused frontend tests**

Run:

```powershell
cd frontend
npm test -- src/components/marketing-studio/MarketingStudioWorkspace.test.tsx src/components/marketing-studio/PortalMarketingStudioWorkspace.test.tsx src/lib/platform/navigation.test.ts src/services/marketingStudioService.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add frontend/src/App.tsx frontend/src/pages/marketing-studio frontend/src/pages/client-portal/PortalMarketingStudioPage.tsx frontend/src/components/marketing-studio
git commit -m "feat: add marketing studio workspaces"
```

---

### Task 5: Remote Application and Operational Verification

**Files:**
- Update only if needed: the generated `marketing_studio_foundation` migration file
- Update only if needed: the matching `marketing_studio_foundation` probe file
- Modify: `docs/implementation-status.md`

- [ ] **Step 1: Review migration against current remote dependencies**

Before applying, verify that the target remote still has landing pages/campaigns/reports tables from the reconciled commercial baseline.

Expected: the Marketing Studio migration can safely use nullable foreign keys to `public.campaigns` and `public.landing_pages`. If either table is missing, stop and reconcile the baseline first.

- [ ] **Step 2: Apply migration remotely**

Use Supabase MCP `apply_migration` or CLI `supabase db push` against `portal-yux`.

Expected: remote migration history contains `marketing_studio_foundation`.

- [ ] **Step 3: Run probes**

Run the SQL probe through Supabase MCP or:

```powershell
.\scripts\run-supabase-probes.ps1
```

Expected: the new Marketing Studio probe passes when `SUPABASE_DB_URL` is already set in the shell from a secure local source. The reconciled commercial baseline should also allow the existing commercial probes to run without missing-table failures.

- [ ] **Step 4: Run focused verification**

Run:

```powershell
cd frontend
npm test -- src/lib/marketing-studio/marketingStudioRules.test.ts src/services/marketingStudioService.test.ts src/components/marketing-studio/MarketingStudioWorkspace.test.tsx src/components/marketing-studio/PortalMarketingStudioWorkspace.test.tsx src/lib/platform/navigation.test.ts
npm run type-check
```

Expected: focused tests and repo-wide type checking pass. If type-check fails, treat it as a blocking regression unless the error is proven unrelated by file and commit history.

- [ ] **Step 5: Browser smoke**

Start frontend:

```powershell
cd frontend
npm run dev
```

Open:

- `http://localhost:5173/marketing-studio`
- `http://localhost:5173/portal/marketing-studio`

Expected:

- internal route loads without console errors;
- portal route loads for a client context when `marketing_studio` is enabled;
- module is hidden when the contract module is disabled;
- no internal notes, raw model, token, provider, cost margin, or protected error is shown in portal.

- [ ] **Step 6: Update implementation status**

Add a row to `docs/implementation-status.md`:

```md
| Marketing Studio foundation | Implemented in repo | `/marketing-studio`, `/portal/marketing-studio` | generated `marketing_studio_foundation` migration, `marketingStudioService`, Marketing Studio workspaces | Covers module shell, settings, content, calendar, approvals, credits, and usage ledger. LangGraph worker/Radar/WordPress publishing remain follow-up plans. |
```

- [ ] **Step 7: Commit verification/status docs**

Run:

```powershell
git add docs/implementation-status.md
git commit -m "docs: track marketing studio foundation status"
```

---

## Follow-Up Plan Queue

After this foundation passes focused tests and remote probes, create these separate plans:

1. `docs/superpowers/plans/YYYY-MM-DD-yux-marketing-studio-organic-calendar.md`
   - Organic content list, editor, versions, comments, approvals, kanban/calendar, and portal approval workflow.
2. `docs/superpowers/plans/YYYY-MM-DD-yux-marketing-studio-knowledge-rag.md`
   - Brand/tone/persona documents, pgvector setup, embeddings, semantic search, and published-only RAG.
3. `docs/superpowers/plans/YYYY-MM-DD-yux-agent-harness-langgraph.md`
   - Python worker, LangGraph runtime, model routing, tool permissions, cost controls, quality gates, and structured run logs.
4. `docs/superpowers/plans/YYYY-MM-DD-yux-marketing-radar-jina.md`
   - Curated sources, Jina Reader/Search, cache, source item ingestion, idea generation, and curator workflow.
5. `docs/superpowers/plans/YYYY-MM-DD-yux-marketing-writer-reviewer.md`
   - Briefing, writer, reviewer, grounding-on-demand, quality score, revisions, and approval queue.
6. `docs/superpowers/plans/YYYY-MM-DD-yux-marketing-wordpress-publishing.md`
   - WordPress REST connection, draft creation, update, approval-bound publication, and publishing logs.
7. `docs/superpowers/plans/YYYY-MM-DD-yux-marketing-campaign-creatives.md`
   - Paid creative suggestions, campaign draft linkage, landing page linkage, approvals, and creative assets.
8. `docs/superpowers/plans/YYYY-MM-DD-yux-marketing-performance-learning.md`
   - Monthly analysis, campaign/content performance, recommendations, and feedback into Radar.

## Acceptance Criteria

- Marketing Studio appears as a contract-gated module in internal and portal navigation.
- Remote database has RLS-protected foundation tables and role permissions.
- A YUX internal user can manage settings, ideas, content, calendar items, reviews, wallets, and ledger records.
- A contracted client can read only their own portal-safe Marketing Studio data.
- Portal surfaces never expose internal notes, raw provider details, token counts, protected errors, or internal cost details.
- Focused domain, service, navigation, and workspace tests pass.
- Remote probes pass for Marketing Studio-specific schema and permissions.
- LangGraph and external tool execution are explicitly not required for this foundation slice.
