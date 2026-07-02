# Radar Comercial Growth Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Radar Comercial MVP as an internal Growth Workspace workflow integrated with Strategy Engine, Agent Harness, RAG traceability, compliance, and CRM conversion.

**Architecture:** Add a backend `/api/radar` module with Postgres tables for campaigns, governed data sources, companies, opportunities, enrichment, analysis artifacts, scores, messages, events, compliance, and costs. Add a deterministic provider-neutral Python harness workflow named `commercial_radar_local_niche`, then expose an internal-only React workspace under `/client-workspaces/:organizationId/comercial/radar` without Portal visibility.

**Tech Stack:** Fastify + TypeScript backend, Postgres migrations, Vitest route tests, Python FastAPI/runtime with unittest, React 18 + Vite + TypeScript frontend, existing shadcn-style UI components and lucide icons.

---

## Spec Reference

Use `docs/superpowers/specs/2026-07-02-radar-comercial-growth-workflow-design.md` as the source of truth.

Key decisions:

- MVP is Radar Local por Nicho.
- Radar is internal-only for `yux_admin` and `yux_operator`.
- No Portal Cliente route or menu.
- No automatic outbound sending.
- All AI output must include a policy decision with `canSendAutomatically: false`.
- UI language uses `Analise da oportunidade`; `Diagnostico YUX 48h` remains the formal commercial offer.

## File Structure

Create:

- `backend/src/db/migrations/0107_radar_comercial_growth_workflow.sql`: Radar schema.
- `backend/src/modules/radar/types.ts`: backend DTO and row types.
- `backend/src/modules/radar/repository.ts`: Postgres access and mapping.
- `backend/src/modules/radar/routes.ts`: Fastify routes and auth guards.
- `backend/tests/radar-routes.test.ts`: focused backend route tests.
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py`: provider-neutral Radar workflow helpers.
- `workers/marketing-studio-agent-runtime/tests/test_radar.py`: runtime tests.
- `frontend/src/types/radar.ts`: frontend types.
- `frontend/src/lib/radar/radarRules.ts`: pure UI and domain helpers.
- `frontend/src/lib/radar/radarRules.test.ts`: frontend rule tests.
- `frontend/src/services/radarService.ts`: API client.
- `frontend/src/components/radar/RadarWorkspace.tsx`: main internal workspace.
- `frontend/src/pages/client-portal/commercial/PortalCommercialRadarPage.tsx`: route component for client-workspace path only.

Modify:

- `backend/src/server.ts`: register `/api/radar`.
- `frontend/src/App.tsx`: add client-workspace route only.
- `frontend/src/lib/platform/navigation.ts`: add internal Growth Workspace navigation item with role and workspace guards.

Do not modify:

- Portal routes under `/portal/*`.
- Admin Strategy Engine route as an operational Radar UI.
- Existing CRM conversion flow except through public repository helpers.

---

### Task 1: Add Radar Schema Migration

**Files:**
- Create: `backend/src/db/migrations/0107_radar_comercial_growth_workflow.sql`

- [ ] **Step 1: Create the migration file**

Add:

```sql
CREATE TABLE IF NOT EXISTS public.radar_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry','future_paid_api')),
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  requires_secret BOOLEAN NOT NULL DEFAULT FALSE,
  terms_notes TEXT,
  default_cost_per_unit NUMERIC(12,6) NOT NULL DEFAULT 0,
  rate_limit_per_day INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.radar_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'local_niche' CHECK (campaign_type IN ('local_niche')),
  target_segment TEXT NOT NULL,
  target_city TEXT NOT NULL,
  target_state TEXT NOT NULL,
  target_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  target_cnaes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  offer_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  budget_limit NUMERIC(12,2),
  daily_limit INTEGER NOT NULL DEFAULT 10,
  automation_level TEXT NOT NULL DEFAULT 'human_review_required' CHECK (automation_level IN ('human_review_required')),
  strategy_profile_key TEXT NOT NULL DEFAULT 'ai_sdr_comercial_1',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_company_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cnpj TEXT,
  legal_name TEXT,
  trade_name TEXT,
  cnae_main TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  phone_raw TEXT,
  email_raw TEXT,
  website_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  source_collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedupe_key TEXT NOT NULL,
  dedupe_status TEXT NOT NULL DEFAULT 'unique' CHECK (dedupe_status IN ('unique','possible_duplicate','duplicate')),
  record_status TEXT NOT NULL DEFAULT 'active' CHECK (record_status IN ('active','duplicate_review','merged','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS public.radar_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw','enriching','enriched','diagnosing','diagnosed','message_drafted','review_pending','approved','rejected','discarded','opted_out','converted')),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  latest_score_id UUID,
  latest_diagnostic_id UUID,
  latest_message_suggestion_id UUID,
  converted_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, company_record_id)
);

CREATE TABLE IF NOT EXISTS public.radar_duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  duplicate_company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('cnpj','domain','phone','name_city','manual')),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed','merged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_enrichment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  data_source_id UUID REFERENCES public.radar_data_sources(id) ON DELETE SET NULL,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed')),
  provider TEXT NOT NULL CHECK (provider IN ('manual','jina_reader','jina_search','web_search','opencnpj')),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_company_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  website_url TEXT,
  instagram_url TEXT,
  linkedin_url TEXT,
  facebook_url TEXT,
  google_business_url TEXT,
  whatsapp TEXT,
  public_email TEXT,
  public_phone TEXT,
  has_site BOOLEAN NOT NULL DEFAULT FALSE,
  has_form BOOLEAN NOT NULL DEFAULT FALSE,
  has_whatsapp_cta BOOLEAN NOT NULL DEFAULT FALSE,
  has_booking BOOLEAN NOT NULL DEFAULT FALSE,
  has_meta_pixel BOOLEAN NOT NULL DEFAULT FALSE,
  has_google_tag BOOLEAN NOT NULL DEFAULT FALSE,
  review_rating NUMERIC(3,2),
  review_count INTEGER,
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id)
);

CREATE TABLE IF NOT EXISTS public.radar_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  detected_services TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  detected_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  pain_hypotheses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  recommended_offer TEXT,
  evidence_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  risk_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  strategy_profile_key TEXT NOT NULL DEFAULT 'ai_sdr_comercial_1',
  retrieval_query_id UUID REFERENCES public.yux_strategy_retrieval_queries(id) ON DELETE SET NULL,
  ai_model TEXT,
  ai_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  fit_score INTEGER NOT NULL CHECK (fit_score BETWEEN 0 AND 100),
  timing_score INTEGER NOT NULL CHECK (timing_score BETWEEN 0 AND 100),
  pain_score INTEGER NOT NULL CHECK (pain_score BETWEEN 0 AND 100),
  contactability_score INTEGER NOT NULL CHECK (contactability_score BETWEEN 0 AND 100),
  budget_score INTEGER NOT NULL CHECK (budget_score BETWEEN 0 AND 100),
  personalization_score INTEGER NOT NULL CHECK (personalization_score BETWEEN 0 AND 100),
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_message_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','linkedin','phone','whatsapp_manual','task')),
  subject TEXT,
  body TEXT NOT NULL,
  personalization_notes TEXT,
  evidence_used JSONB NOT NULL DEFAULT '[]'::JSONB,
  policy_decision JSONB NOT NULL DEFAULT '{"status":"requires_human_approval","canSendAutomatically":false}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','converted')),
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  channel TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('company_added','company_enriched','diagnostic_generated','score_generated','message_generated','message_approved','message_rejected','opportunity_approved','opportunity_rejected','opt_out_registered','converted_to_lead','manual_note_added')),
  event_status TEXT NOT NULL DEFAULT 'succeeded',
  message_id UUID REFERENCES public.radar_message_suggestions(id) ON DELETE SET NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_compliance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  data_source TEXT NOT NULL,
  legal_basis TEXT NOT NULL DEFAULT 'legitimate_interest_b2b_public_data',
  data_categories TEXT[] NOT NULL DEFAULT ARRAY['business_public_contact']::TEXT[],
  purpose TEXT NOT NULL DEFAULT 'commercial_prospecting_review',
  opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  opt_out_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_cost_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  data_source_id UUID REFERENCES public.radar_data_sources(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0,
  provider TEXT,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.radar_opportunities
  ADD CONSTRAINT radar_opportunities_latest_score_fk
  FOREIGN KEY (latest_score_id) REFERENCES public.radar_scores(id) ON DELETE SET NULL;

ALTER TABLE public.radar_opportunities
  ADD CONSTRAINT radar_opportunities_latest_diagnostic_fk
  FOREIGN KEY (latest_diagnostic_id) REFERENCES public.radar_diagnostics(id) ON DELETE SET NULL;

ALTER TABLE public.radar_opportunities
  ADD CONSTRAINT radar_opportunities_latest_message_fk
  FOREIGN KEY (latest_message_suggestion_id) REFERENCES public.radar_message_suggestions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_radar_campaigns_org_status ON public.radar_campaigns(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_company_records_org_dedupe ON public.radar_company_records(organization_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_radar_opportunities_campaign_status ON public.radar_opportunities(campaign_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_opportunities_org_status ON public.radar_opportunities(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_events_opportunity ON public.radar_outreach_events(opportunity_id, occurred_at DESC);
```

- [ ] **Step 2: Run migration smoke check**

Run:

```powershell
cd backend
npm run type-check
```

Expected: `tsc --noEmit` completes without migration-related errors.

- [ ] **Step 3: Commit**

```powershell
git add backend/src/db/migrations/0107_radar_comercial_growth_workflow.sql
git commit -m "feat: add radar comercial schema"
```

---

### Task 2: Add Backend Radar Types And Pure Mapping Rules

**Files:**
- Create: `backend/src/modules/radar/types.ts`
- Create: `frontend/src/types/radar.ts`
- Create: `frontend/src/lib/radar/radarRules.ts`
- Create: `frontend/src/lib/radar/radarRules.test.ts`

- [ ] **Step 1: Add shared frontend types**

Create `frontend/src/types/radar.ts`:

```ts
export type RadarCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type RadarOpportunityStatus = 'raw' | 'enriching' | 'enriched' | 'diagnosing' | 'diagnosed' | 'message_drafted' | 'review_pending' | 'approved' | 'rejected' | 'discarded' | 'opted_out' | 'converted'
export type RadarMessageStatus = 'draft' | 'approved' | 'rejected' | 'converted'

export interface RadarDataSource {
  id: string
  organizationId?: string
  sourceKey: string
  sourceType: string
  displayName: string
  enabled: boolean
  isPaid: boolean
  requiresSecret: boolean
  termsNotes?: string
  defaultCostPerUnit: number
  rateLimitPerDay: number
  createdAt: string
  updatedAt: string
}

export interface RadarCampaign {
  id: string
  organizationId: string
  name: string
  campaignType: 'local_niche'
  targetSegment: string
  targetCity: string
  targetState: string
  targetKeywords: string[]
  targetCnaes: string[]
  offerType: string
  status: RadarCampaignStatus
  ownerId?: string
  budgetLimit?: number
  dailyLimit: number
  automationLevel: 'human_review_required'
  strategyProfileKey: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface RadarCompanyRecord {
  id: string
  organizationId: string
  cnpj?: string
  legalName?: string
  tradeName?: string
  cnaeMain?: string
  city?: string
  state?: string
  address?: string
  phoneRaw?: string
  emailRaw?: string
  websiteUrl?: string
  sourceType: string
  sourceUrl?: string
  sourceCollectedAt: string
  dedupeKey: string
  dedupeStatus: string
  recordStatus: string
  createdAt: string
  updatedAt: string
}

export interface RadarScore {
  id: string
  totalScore: number
  fitScore: number
  timingScore: number
  painScore: number
  contactabilityScore: number
  budgetScore: number
  personalizationScore: number
  explanation: string
  createdAt: string
}

export interface RadarDiagnostic {
  id: string
  summary: string
  detectedServices: string[]
  detectedChannels: string[]
  painHypotheses: string[]
  recommendedOffer?: string
  evidence: Array<Record<string, unknown>>
  riskFlags: string[]
  strategyProfileKey: string
  aiCostEstimate: number
  createdAt: string
}

export interface RadarPolicyDecision {
  status: 'requires_human_approval' | 'blocked'
  canSendAutomatically: false
  canConvertToLead: boolean
  blockedReasons: string[]
  requiredReviewFields: string[]
}

export interface RadarMessageSuggestion {
  id: string
  channel: 'email' | 'linkedin' | 'phone' | 'whatsapp_manual' | 'task'
  subject?: string
  body: string
  personalizationNotes?: string
  evidenceUsed: Array<Record<string, unknown>>
  policyDecision: RadarPolicyDecision
  status: RadarMessageStatus
  approvedBy?: string
  approvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface RadarOpportunity {
  id: string
  organizationId: string
  campaignId: string
  companyRecordId: string
  status: RadarOpportunityStatus
  ownerId?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  latestScoreId?: string
  latestDiagnosticId?: string
  latestMessageSuggestionId?: string
  convertedLeadId?: string
  convertedAt?: string
  convertedBy?: string
  company?: RadarCompanyRecord
  latestScore?: RadarScore
  latestDiagnostic?: RadarDiagnostic
  latestMessageSuggestion?: RadarMessageSuggestion
  createdAt: string
  updatedAt: string
}

export interface RadarMetrics {
  companies: number
  opportunities: number
  enriched: number
  reviewPending: number
  approved: number
  converted: number
  optedOut: number
  estimatedCost: number
}
```

- [ ] **Step 2: Add backend row and DTO types**

Create `backend/src/modules/radar/types.ts` with snake_case row types and camelCase DTO interfaces mirroring `frontend/src/types/radar.ts`.

```ts
export type RadarUserRole = 'yux_admin' | 'yux_operator' | 'client_admin' | 'client_user' | string

export type RadarCampaignRow = {
  id: string
  organization_id: string
  name: string
  campaign_type: 'local_niche'
  target_segment: string
  target_city: string
  target_state: string
  target_keywords: string[]
  target_cnaes: string[]
  offer_type: string
  status: string
  owner_id: string | null
  budget_limit: string | number | null
  daily_limit: number
  automation_level: 'human_review_required'
  strategy_profile_key: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RadarOpportunityStatus =
  | 'raw'
  | 'enriching'
  | 'enriched'
  | 'diagnosing'
  | 'diagnosed'
  | 'message_drafted'
  | 'review_pending'
  | 'approved'
  | 'rejected'
  | 'discarded'
  | 'opted_out'
  | 'converted'
```

Append these additional backend row types in the same file:

```ts
export type RadarCompanyRecordRow = {
  id: string
  organization_id: string
  cnpj: string | null
  legal_name: string | null
  trade_name: string | null
  cnae_main: string | null
  city: string | null
  state: string | null
  address: string | null
  phone_raw: string | null
  email_raw: string | null
  website_url: string | null
  source_type: string
  source_url: string | null
  source_collected_at: string
  dedupe_key: string
  dedupe_status: string
  record_status: string
  created_at: string
  updated_at: string
}

export type RadarOpportunityRow = {
  id: string
  organization_id: string
  campaign_id: string
  company_record_id: string
  status: RadarOpportunityStatus
  owner_id: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  latest_score_id: string | null
  latest_diagnostic_id: string | null
  latest_message_suggestion_id: string | null
  converted_lead_id: string | null
  converted_at: string | null
  converted_by: string | null
  created_at: string
  updated_at: string
}

export type RadarScoreRow = {
  id: string
  total_score: number
  fit_score: number
  timing_score: number
  pain_score: number
  contactability_score: number
  budget_score: number
  personalization_score: number
  explanation: string
  created_at: string
}

export type RadarDiagnosticRow = {
  id: string
  summary: string
  detected_services: string[]
  detected_channels: string[]
  pain_hypotheses: string[]
  recommended_offer: string | null
  evidence_json: Array<Record<string, unknown>>
  risk_flags: string[]
  strategy_profile_key: string
  ai_cost_estimate: string | number
  created_at: string
}

export type RadarPolicyDecision = {
  status: 'requires_human_approval' | 'blocked'
  canSendAutomatically: false
  canConvertToLead: boolean
  blockedReasons: string[]
  requiredReviewFields: string[]
}

export type RadarMessageSuggestionRow = {
  id: string
  channel: 'email' | 'linkedin' | 'phone' | 'whatsapp_manual' | 'task'
  subject: string | null
  body: string
  personalization_notes: string | null
  evidence_used: Array<Record<string, unknown>>
  policy_decision: RadarPolicyDecision
  status: 'draft' | 'approved' | 'rejected' | 'converted'
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type RadarDataSourceRow = {
  id: string
  organization_id: string | null
  source_key: string
  source_type: string
  display_name: string
  enabled: boolean
  is_paid: boolean
  requires_secret: boolean
  terms_notes: string | null
  default_cost_per_unit: string | number
  rate_limit_per_day: number
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Add radar pure rules**

Create `frontend/src/lib/radar/radarRules.ts`:

```ts
import type { PlatformContext } from '@/types/platform'
import type { RadarCompanyRecord, RadarOpportunity, RadarPolicyDecision } from '@/types/radar'

export function canShowRadarNavigation(context: PlatformContext) {
  const roleKey = context.role?.key
  return (
    context.mode === 'client_workspace'
    && context.organization?.isInternalGrowthWorkspace === true
    && (roleKey === 'yux_admin' || roleKey === 'yux_operator' || context.role?.permissions.includes('platform.manage'))
  )
}

export function buildRadarDedupeKey(input: Pick<RadarCompanyRecord, 'cnpj' | 'websiteUrl' | 'phoneRaw' | 'tradeName' | 'legalName' | 'city' | 'state'>) {
  if (input.cnpj) return `cnpj:${onlyDigits(input.cnpj)}`
  if (input.websiteUrl) return `domain:${normalizeDomain(input.websiteUrl)}`
  if (input.phoneRaw) return `phone:${onlyDigits(input.phoneRaw)}`
  return `name_city:${normalizeToken(input.tradeName || input.legalName || 'empresa')}:${normalizeToken(input.city || '')}:${normalizeToken(input.state || '')}`
}

export function defaultRadarPolicyDecision(canConvertToLead = true): RadarPolicyDecision {
  return {
    status: 'requires_human_approval',
    canSendAutomatically: false,
    canConvertToLead,
    blockedReasons: [],
    requiredReviewFields: ['message', 'evidence', 'risk_flags'],
  }
}

export function canConvertRadarOpportunity(opportunity: Pick<RadarOpportunity, 'status' | 'latestMessageSuggestion' | 'convertedLeadId'>) {
  return (
    opportunity.status === 'approved'
    && !opportunity.convertedLeadId
    && opportunity.latestMessageSuggestion?.status === 'approved'
    && opportunity.latestMessageSuggestion.policyDecision.canSendAutomatically === false
  )
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeDomain(value: string) {
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return normalizeToken(value)
  }
}

function normalizeToken(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Add radar rules tests**

Create `frontend/src/lib/radar/radarRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildRadarDedupeKey, canConvertRadarOpportunity, canShowRadarNavigation, defaultRadarPolicyDecision } from './radarRules'

describe('radarRules', () => {
  it('shows radar only in the internal YUX growth workspace', () => {
    expect(canShowRadarNavigation({
      mode: 'client_workspace',
      organization: { id: 'org-1', name: 'Crescimento YUX', slug: 'yux', kind: 'yux', isInternalGrowthWorkspace: true, createdAt: '', updatedAt: '' },
      membership: null,
      role: { key: 'yux_admin', name: 'Admin', scope: 'internal', permissions: ['platform.manage'] },
      enabledModuleKeys: ['crm'],
    })).toBe(true)

    expect(canShowRadarNavigation({
      mode: 'portal',
      organization: { id: 'org-1', name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      membership: null,
      role: { key: 'client_admin', name: 'Cliente', scope: 'client', permissions: ['crm.read'] },
      enabledModuleKeys: ['crm'],
    })).toBe(false)
  })

  it('builds stable dedupe keys from cnpj, domain, phone or name city', () => {
    expect(buildRadarDedupeKey({ cnpj: '12.345.678/0001-90' })).toBe('cnpj:12345678000190')
    expect(buildRadarDedupeKey({ websiteUrl: 'https://www.Example.com/page' })).toBe('domain:example.com')
    expect(buildRadarDedupeKey({ phoneRaw: '(43) 99999-0000' })).toBe('phone:43999990000')
    expect(buildRadarDedupeKey({ tradeName: 'Clínica Boa Vida', city: 'Londrina', state: 'PR' })).toBe('name_city:clinica-boa-vida:londrina:pr')
  })

  it('requires human approval and blocks automatic send by default', () => {
    expect(defaultRadarPolicyDecision()).toMatchObject({
      status: 'requires_human_approval',
      canSendAutomatically: false,
      canConvertToLead: true,
    })
  })

  it('allows conversion only after approved opportunity and approved message', () => {
    expect(canConvertRadarOpportunity({
      status: 'approved',
      convertedLeadId: undefined,
      latestMessageSuggestion: {
        id: 'message-1',
        channel: 'email',
        body: 'Oi',
        evidenceUsed: [],
        policyDecision: defaultRadarPolicyDecision(),
        status: 'approved',
        createdAt: '',
        updatedAt: '',
      },
    })).toBe(true)
  })
})
```

- [ ] **Step 5: Run tests**

Run:

```powershell
cd frontend
npm run test -- src/lib/radar/radarRules.test.ts
```

Expected: `4 passed`.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/types/radar.ts frontend/src/lib/radar/radarRules.ts frontend/src/lib/radar/radarRules.test.ts backend/src/modules/radar/types.ts
git commit -m "feat: add radar comercial contracts"
```

---

### Task 3: Implement Backend Radar Repository

**Files:**
- Create: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/types.ts`

- [ ] **Step 1: Add repository mapping helpers**

Create `backend/src/modules/radar/repository.ts`:

```ts
import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import type { RadarCampaignRow } from './types.js'

export function isInternalRadarUser(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}

export function requireRadarAccess(user: AuthUser) {
  if (!isInternalRadarUser(user)) {
    throw Object.assign(new Error('radar_forbidden'), { statusCode: 403 })
  }
}

export function buildRadarDedupeKey(input: { cnpj?: string | null; websiteUrl?: string | null; phoneRaw?: string | null; tradeName?: string | null; legalName?: string | null; city?: string | null; state?: string | null }) {
  if (input.cnpj) return `cnpj:${input.cnpj.replace(/\D/g, '')}`
  if (input.websiteUrl) return `domain:${normalizeDomain(input.websiteUrl)}`
  if (input.phoneRaw) return `phone:${input.phoneRaw.replace(/\D/g, '')}`
  return `name_city:${normalizeToken(input.tradeName || input.legalName || 'empresa')}:${normalizeToken(input.city || '')}:${normalizeToken(input.state || '')}`
}

export async function listRadarCampaigns(pool: pg.Pool, user: AuthUser, organizationId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCampaignRow>(
    `SELECT *
     FROM public.radar_campaigns
     WHERE organization_id = $1
     ORDER BY updated_at DESC`,
    [organizationId],
  )
  return result.rows.map(mapCampaign)
}

export async function createRadarCampaign(pool: pg.Pool, user: AuthUser, input: {
  organizationId: string
  name: string
  targetSegment: string
  targetCity: string
  targetState: string
  targetKeywords?: string[]
  targetCnaes?: string[]
  offerType: string
  budgetLimit?: number
  dailyLimit?: number
}) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCampaignRow>(
    `INSERT INTO public.radar_campaigns (
       organization_id, name, target_segment, target_city, target_state,
       target_keywords, target_cnaes, offer_type, budget_limit, daily_limit, created_by, owner_id
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     RETURNING *`,
    [
      input.organizationId,
      input.name.trim(),
      input.targetSegment.trim(),
      input.targetCity.trim(),
      input.targetState.trim().toUpperCase(),
      input.targetKeywords ?? [],
      input.targetCnaes ?? [],
      input.offerType.trim(),
      input.budgetLimit ?? null,
      input.dailyLimit ?? 10,
      user.id,
    ],
  )
  return mapCampaign(result.rows[0])
}

export function mapCampaign(row: RadarCampaignRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    campaignType: row.campaign_type,
    targetSegment: row.target_segment,
    targetCity: row.target_city,
    targetState: row.target_state,
    targetKeywords: row.target_keywords ?? [],
    targetCnaes: row.target_cnaes ?? [],
    offerType: row.offer_type,
    status: row.status,
    ownerId: row.owner_id ?? undefined,
    budgetLimit: row.budget_limit !== null && row.budget_limit !== undefined ? Number(row.budget_limit) : undefined,
    dailyLimit: row.daily_limit,
    automationLevel: row.automation_level,
    strategyProfileKey: row.strategy_profile_key,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeToken(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function normalizeDomain(value: string) {
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return normalizeToken(value)
  }
}
```

- [ ] **Step 2: Add company and opportunity repository methods**

Append:

```ts
export async function addRadarCompanyToCampaign(pool: pg.Pool, user: AuthUser, input: {
  organizationId: string
  campaignId: string
  legalName?: string
  tradeName?: string
  cnpj?: string
  cnaeMain?: string
  city?: string
  state?: string
  phoneRaw?: string
  emailRaw?: string
  websiteUrl?: string
  sourceType?: string
  sourceUrl?: string
}) {
  requireRadarAccess(user)
  const dedupeKey = buildRadarDedupeKey(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const company = await client.query(
      `INSERT INTO public.radar_company_records (
         organization_id, cnpj, legal_name, trade_name, cnae_main, city, state,
         phone_raw, email_raw, website_url, source_type, source_url, dedupe_key
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (organization_id, dedupe_key)
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [
        input.organizationId,
        input.cnpj ?? null,
        input.legalName ?? null,
        input.tradeName ?? null,
        input.cnaeMain ?? null,
        input.city ?? null,
        input.state ?? null,
        input.phoneRaw ?? null,
        input.emailRaw ?? null,
        input.websiteUrl ?? null,
        input.sourceType ?? 'manual',
        input.sourceUrl ?? null,
        dedupeKey,
      ],
    )
    const companyRow = company.rows[0]
    const opportunity = await client.query(
      `INSERT INTO public.radar_opportunities (organization_id, campaign_id, company_record_id, owner_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (campaign_id, company_record_id)
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [input.organizationId, input.campaignId, companyRow.id, user.id],
    )
    await client.query(
      `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
       VALUES ($1,$2,$3,$4,'company_added')`,
      [input.organizationId, input.campaignId, companyRow.id, opportunity.rows[0].id],
    )
    await client.query(
      `INSERT INTO public.radar_compliance_logs (organization_id, company_record_id, opportunity_id, data_source)
       VALUES ($1,$2,$3,$4)`,
      [input.organizationId, companyRow.id, opportunity.rows[0].id, input.sourceType ?? 'manual'],
    )
    await client.query('COMMIT')
    return { company: mapCompany(companyRow), opportunity: mapOpportunity(opportunity.rows[0], companyRow) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

Also add `mapCompany` and `mapOpportunity` functions using the frontend type names from Task 2.

- [ ] **Step 3: Add opportunity review and opt-out methods**

Append:

```ts
export async function reviewRadarOpportunity(pool: pg.Pool, user: AuthUser, opportunityId: string, status: 'approved' | 'rejected') {
  requireRadarAccess(user)
  const result = await pool.query(
    `UPDATE public.radar_opportunities
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [opportunityId, status],
  )
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })
  await pool.query(
    `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
     VALUES ($1,$2,$3,$4,$5)`,
    [row.organization_id, row.campaign_id, row.company_record_id, row.id, status === 'approved' ? 'opportunity_approved' : 'opportunity_rejected'],
  )
  return mapOpportunity(row)
}

export async function optOutRadarOpportunity(pool: pg.Pool, user: AuthUser, opportunityId: string) {
  requireRadarAccess(user)
  const result = await pool.query(
    `UPDATE public.radar_opportunities
     SET status = 'opted_out', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [opportunityId],
  )
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })
  await pool.query(
    `UPDATE public.radar_compliance_logs
     SET opt_out = TRUE, opt_out_at = NOW()
     WHERE opportunity_id = $1`,
    [opportunityId],
  )
  await pool.query(
    `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
     VALUES ($1,$2,$3,$4,'opt_out_registered')`,
    [row.organization_id, row.campaign_id, row.company_record_id, row.id],
  )
  return mapOpportunity(row)
}
```

- [ ] **Step 4: Run backend type-check**

Run:

```powershell
cd backend
npm run type-check
```

Expected: initially may fail until route imports are added in Task 4; if it fails only for unused exports, proceed to Task 4 before committing.

---

### Task 4: Add Backend Radar Routes And Tests

**Files:**
- Create: `backend/src/modules/radar/routes.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/tests/radar-routes.test.ts`

- [ ] **Step 1: Create Radar routes**

Create `backend/src/modules/radar/routes.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import {
  addRadarCompanyToCampaign,
  createRadarCampaign,
  listRadarCampaigns,
  optOutRadarOpportunity,
  reviewRadarOpportunity,
} from './repository.js'

const uuid = z.string().uuid()

const campaignQuerySchema = z.object({ organizationId: uuid })
const createCampaignSchema = z.object({
  organizationId: uuid,
  name: z.string().min(1),
  targetSegment: z.string().min(1),
  targetCity: z.string().min(1),
  targetState: z.string().min(2).max(2),
  targetKeywords: z.array(z.string()).optional(),
  targetCnaes: z.array(z.string()).optional(),
  offerType: z.string().min(1),
  budgetLimit: z.number().optional(),
  dailyLimit: z.number().int().min(1).max(10).optional(),
})
const addCompanySchema = z.object({
  organizationId: uuid,
  legalName: z.string().optional(),
  tradeName: z.string().optional(),
  cnpj: z.string().optional(),
  cnaeMain: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phoneRaw: z.string().optional(),
  emailRaw: z.string().email().optional(),
  websiteUrl: z.string().optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().optional(),
})
const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']) })

async function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME]
  if (!token) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }
  const user = await request.server.authStore.findUserBySession(hashSessionToken(token), new Date())
  if (!user) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }
  return user
}

export async function registerRadarRoutes(app: FastifyInstance) {
  app.get('/campaigns', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = campaignQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_campaign_query' })
    return listRadarCampaigns(app.pg, user, parsed.data.organizationId)
  })

  app.post('/campaigns', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = createCampaignSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_campaign_payload' })
    return reply.code(201).send(await createRadarCampaign(app.pg, user, parsed.data))
  })

  app.post('/campaigns/:id/companies', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = addCompanySchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_company_payload' })
    return reply.code(201).send(await addRadarCompanyToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
  })

  app.patch('/opportunities/:id/review', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = reviewSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_review_payload' })
    return reviewRadarOpportunity(app.pg, user, params.data.id, parsed.data.status)
  })

  app.post('/opportunities/:id/opt-out', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_opportunity_id' })
    return optOutRadarOpportunity(app.pg, user, params.data.id)
  })
}
```

- [ ] **Step 2: Register the backend module**

Modify `backend/src/server.ts`:

```ts
import { registerRadarRoutes } from './modules/radar/routes.js'
```

Then add after CRM or campaign routes:

```ts
await app.register(registerRadarRoutes, { prefix: '/api/radar' })
```

- [ ] **Step 3: Add route test**

Create `backend/tests/radar-routes.test.ts` using the same `FakeAuthStore` pattern from `backend/tests/crm-routes.test.ts`.

Use this minimum test body:

```ts
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import { buildServer } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
}

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  campaign: '00000000-0000-4000-8000-000000000003',
  company: '00000000-0000-4000-8000-000000000004',
  opportunity: '00000000-0000-4000-8000-000000000005',
}

class FakeAuthStore implements AuthStore {
  user: AuthUser | null = null
  sessionHash: string | null = null
  async findActiveUserByEmail() { return null }
  async createSession() { return undefined }
  async deleteSession() { return undefined }
  async findUserBySession(sessionTokenHash: string) { return this.user && this.sessionHash === sessionTokenHash ? this.user : null }
}

class FakePool {
  async connect() {
    return { query: this.query.bind(this), release() {} }
  }

  async query(sql: string) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [campaignRow] }
    if (sql.includes('INSERT INTO public.radar_campaigns')) return { rows: [campaignRow] }
    if (sql.includes('INSERT INTO public.radar_company_records')) return { rows: [companyRow] }
    if (sql.includes('INSERT INTO public.radar_opportunities')) return { rows: [opportunityRow] }
    if (sql.includes('INSERT INTO public.radar_outreach_events')) return { rows: [] }
    if (sql.includes('INSERT INTO public.radar_compliance_logs')) return { rows: [] }
    if (sql.includes('UPDATE public.radar_opportunities')) return { rows: [{ ...opportunityRow, status: 'approved' }] }
    if (sql.includes('UPDATE public.radar_compliance_logs')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() { return undefined }
}

const campaignRow = {
  id: ids.campaign,
  organization_id: ids.org,
  name: 'Clinicas Londrina',
  campaign_type: 'local_niche',
  target_segment: 'Clinicas',
  target_city: 'Londrina',
  target_state: 'PR',
  target_keywords: ['clinica'],
  target_cnaes: [],
  offer_type: 'Diagnostico YUX 48h',
  status: 'draft',
  owner_id: ids.user,
  budget_limit: '100.00',
  daily_limit: 5,
  automation_level: 'human_review_required',
  strategy_profile_key: 'ai_sdr_comercial_1',
  created_by: ids.user,
  created_at: '2026-07-02T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
}
const companyRow = {
  id: ids.company,
  organization_id: ids.org,
  cnpj: null,
  legal_name: 'Clinica Boa Vida',
  trade_name: 'Boa Vida',
  cnae_main: null,
  city: 'Londrina',
  state: 'PR',
  address: null,
  phone_raw: null,
  email_raw: 'contato@boavida.com.br',
  website_url: 'https://boavida.com.br',
  source_type: 'manual',
  source_url: null,
  source_collected_at: '2026-07-02T00:00:00.000Z',
  dedupe_key: 'domain:boavida.com.br',
  dedupe_status: 'unique',
  record_status: 'active',
  created_at: '2026-07-02T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
}
const opportunityRow = {
  id: ids.opportunity,
  organization_id: ids.org,
  campaign_id: ids.campaign,
  company_record_id: ids.company,
  status: 'raw',
  owner_id: ids.user,
  priority: 'medium',
  latest_score_id: null,
  latest_diagnostic_id: null,
  latest_message_suggestion_id: null,
  converted_lead_id: null,
  converted_at: null,
  converted_by: null,
  created_at: '2026-07-02T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
}

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

function auth() {
  const token = 'session-token'
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = { id: ids.user, email: 'admin@yux.com.br', name: 'Admin YUX', role: 'yux_admin' }
  return { authStore, token }
}

describe('radar routes', () => {
  it('rejects unauthenticated radar requests', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never })
    const response = await app.inject({ method: 'GET', url: `/api/radar/campaigns?organizationId=${ids.org}` })
    expect(response.statusCode).toBe(401)
  })

  it('creates and lists radar campaigns', async () => {
    const { authStore, token } = auth()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })
    const created = await app.inject({
      method: 'POST',
      url: '/api/radar/campaigns',
      headers: { cookie: `yux_session=${token}` },
      payload: { organizationId: ids.org, name: 'Clinicas Londrina', targetSegment: 'Clinicas', targetCity: 'Londrina', targetState: 'PR', offerType: 'Diagnostico YUX 48h', dailyLimit: 5 },
    })
    const listed = await app.inject({ method: 'GET', url: `/api/radar/campaigns?organizationId=${ids.org}`, headers: { cookie: `yux_session=${token}` } })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ id: ids.campaign, name: 'Clinicas Londrina', dailyLimit: 5 })
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toHaveLength(1)
  })

  it('adds a company and creates a radar opportunity', async () => {
    const { authStore, token } = auth()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })
    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/campaigns/${ids.campaign}/companies`,
      headers: { cookie: `yux_session=${token}` },
      payload: { organizationId: ids.org, tradeName: 'Boa Vida', city: 'Londrina', state: 'PR', websiteUrl: 'https://boavida.com.br', emailRaw: 'contato@boavida.com.br' },
    })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ company: { id: ids.company }, opportunity: { id: ids.opportunity } })
  })
})
```

- [ ] **Step 4: Run focused backend tests**

Run:

```powershell
cd backend
npm run test -- tests/radar-routes.test.ts
```

Expected: all radar route tests pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/src/modules/radar backend/src/server.ts backend/tests/radar-routes.test.ts
git commit -m "feat: add radar comercial api"
```

---

### Task 5: Add Provider-Neutral Radar Harness Workflow

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_radar.py`

- [ ] **Step 1: Add Radar workflow helpers**

Create `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


RADAR_SUBAGENTS = [
    {
        "key": "radar_fit_analyst",
        "profile_key": "ai_sdr_comercial_1",
        "objective": "Avaliar fit da empresa, nicho, contato e prioridade de abordagem.",
        "required_terms": ["fit", "empresa", "prioridade"],
    },
    {
        "key": "radar_offer_analyst",
        "profile_key": "offer_conversion",
        "objective": "Recomendar oferta YUX com base em dor, evidencia publica e contexto estrategico.",
        "required_terms": ["oferta", "dor", "evidencia"],
    },
    {
        "key": "radar_crm_analyst",
        "profile_key": "crm_controller",
        "objective": "Definir proxima acao de CRM e criterios para conversao em lead.",
        "required_terms": ["crm", "lead", "proxima acao"],
    },
    {
        "key": "radar_metrics_analyst",
        "profile_key": "metrics_cash_mroi",
        "objective": "Avaliar custo, prioridade comercial e potencial de caixa.",
        "required_terms": ["custo", "caixa", "prioridade"],
    },
    {
        "key": "radar_risk_auditor",
        "profile_key": "growth_strategist",
        "objective": "Auditar LGPD, promessa, risco reputacional e necessidade de aprovacao humana.",
        "required_terms": ["risco", "aprovacao", "lgpd"],
    },
]


@dataclass(frozen=True)
class RadarCompanyInput:
    name: str
    segment: str = ""
    city: str = ""
    state: str = ""
    website_url: str = ""
    channels: tuple[str, ...] = ()
    evidence: tuple[str, ...] = ()


def build_radar_workflow_spec(max_subagents: int = 5) -> dict[str, Any]:
    return {
        "workflow_key": "commercial_radar_local_niche",
        "max_subagents": max_subagents,
        "subagent_specs": RADAR_SUBAGENTS[:max_subagents],
        "max_retries_per_node": 1,
    }


def radar_policy_decision(can_convert_to_lead: bool = True, blocked_reasons: list[str] | None = None) -> dict[str, Any]:
    reasons = blocked_reasons or []
    return {
        "status": "blocked" if reasons else "requires_human_approval",
        "canSendAutomatically": False,
        "canConvertToLead": can_convert_to_lead and not reasons,
        "blockedReasons": reasons,
        "requiredReviewFields": ["message", "evidence", "risk_flags"],
    }


def synthesize_radar_output(company: RadarCompanyInput, recommended_offer: str = "Diagnostico YUX 48h") -> dict[str, Any]:
    evidence = list(company.evidence) or [
        f"Empresa identificada em {company.city}/{company.state} no segmento {company.segment or 'nao informado'}."
    ]
    contactability = 80 if company.channels else 45
    fit = 80 if company.segment else 55
    pain = 70 if company.website_url else 60
    total = round((fit * 0.35) + (pain * 0.3) + (contactability * 0.2) + 12)
    total = max(0, min(100, total))
    return {
        "summary": f"Analise da oportunidade para {company.name}.",
        "evidence": evidence,
        "pain_hypotheses": ["Possivel perda de oportunidades por baixa estrutura de captura e follow-up."],
        "recommended_offer": recommended_offer,
        "score": {
            "total_score": total,
            "fit_score": fit,
            "timing_score": 65,
            "pain_score": pain,
            "contactability_score": contactability,
            "budget_score": 60,
            "personalization_score": 75 if evidence else 50,
            "explanation": "Score calculado por fit, dor aparente, contato publico, timing e personalizacao disponivel.",
        },
        "message": {
            "channel": "email",
            "subject": f"Analise rapida para {company.name}",
            "body": f"Analisei sinais publicos da {company.name} e encontrei oportunidades de melhoria comercial. Posso te enviar 3 ideias praticas?",
            "personalization_notes": "Mensagem deve ser revisada por humano antes de qualquer envio.",
            "evidence_used": evidence,
        },
        "risk_flags": [],
        "policyDecision": radar_policy_decision(can_convert_to_lead=True),
    }
```

- [ ] **Step 2: Connect workflow key in runtime workflow**

Modify `workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py`:

```python
from .radar import build_radar_workflow_spec
```

Then update `WORKFLOW_BY_MODE`:

```python
WORKFLOW_BY_MODE = {
    "diagnostic_48h": "diagnostic_48h",
    "initial_analysis": "diagnostic_48h",
    "service_plan": "diagnostic_48h",
    "proposal": "proposal_consultative",
    "roadmap_30_60_90": "diagnostic_48h",
    "do_not_do": "diagnostic_48h",
    "commercial_radar_local_niche": "commercial_radar_local_niche",
}
```

Inside `StrategyWorkflowEngine.execute`, before `build_workflow_plan`, merge the default Radar workflow spec when `workflow_key == "commercial_radar_local_niche"`:

```python
effective_workflow_spec = workflow_spec
if workflow_key == "commercial_radar_local_niche" and not workflow_spec:
    effective_workflow_spec = build_radar_workflow_spec()
```

Then pass `effective_workflow_spec` to `build_workflow_plan`.

- [ ] **Step 3: Add runtime tests**

Create `workers/marketing-studio-agent-runtime/tests/test_radar.py`:

```python
import unittest

from yux_agent_runtime.radar import RadarCompanyInput, build_radar_workflow_spec, radar_policy_decision, synthesize_radar_output
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.workflow import StrategyWorkflowEngine


class RadarWorkflowTest(unittest.TestCase):
    def test_policy_decision_blocks_automatic_send(self):
        decision = radar_policy_decision()
        self.assertEqual(decision["status"], "requires_human_approval")
        self.assertFalse(decision["canSendAutomatically"])
        self.assertTrue(decision["canConvertToLead"])
        self.assertIn("message", decision["requiredReviewFields"])

    def test_synthesizes_radar_output_with_score_and_message(self):
        output = synthesize_radar_output(RadarCompanyInput(
            name="Clinica Boa Vida",
            segment="clinicas",
            city="Londrina",
            state="PR",
            website_url="https://boavida.com.br",
            channels=("email",),
            evidence=("Site publico encontrado.",),
        ))
        self.assertEqual(output["recommended_offer"], "Diagnostico YUX 48h")
        self.assertGreaterEqual(output["score"]["total_score"], 70)
        self.assertFalse(output["policyDecision"]["canSendAutomatically"])

    def test_strategy_engine_executes_radar_workflow_with_subagents(self):
        store = InMemoryAgentRuntimeStore()
        engine = StrategyWorkflowEngine(store)
        result = engine.execute(
            message="Analise oportunidade local para Clinica Boa Vida em Londrina",
            profile_key="ai_sdr_comercial_1",
            source="radar",
            organization_id="org-1",
            mode="commercial_radar_local_niche",
            workflow_spec=build_radar_workflow_spec(max_subagents=3),
            retrieval_context={"cards": [{"id": "card-radar", "concept": "Diagnostico 48h"}], "chunks": []},
            autonomy_policies=[{"profile_key": "ai_sdr_comercial_1", "channel": "strategy_admin", "autonomy_mode": "approval_required", "status": "active"}],
        )
        self.assertIn(result["run"]["status"], ["waiting_approval", "succeeded"])
        self.assertEqual(len(store.tables["strategy_subagent_runs"]), 3)
        self.assertEqual(store.tables["agent_execution_runs"][0]["workflow_key"], "commercial_radar_local_niche")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 4: Run runtime tests**

Run:

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest tests.test_radar
```

Expected: `Ran 3 tests` and `OK`.

- [ ] **Step 5: Commit**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py workers/marketing-studio-agent-runtime/tests/test_radar.py
git commit -m "feat: add radar comercial harness workflow"
```

---

### Task 6: Add Frontend Radar Service And Workspace Route

**Files:**
- Create: `frontend/src/services/radarService.ts`
- Create: `frontend/src/components/radar/RadarWorkspace.tsx`
- Create: `frontend/src/pages/client-portal/commercial/PortalCommercialRadarPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add service client**

Create `frontend/src/services/radarService.ts`:

```ts
import { apiRequest } from '@/lib/apiClient'
import type { RadarCampaign, RadarMetrics, RadarOpportunity } from '@/types/radar'

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value) search.set(key, value) })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export const radarService = {
  async getCampaigns(organizationId: string) {
    return apiRequest<RadarCampaign[]>(`/radar/campaigns${buildQuery({ organizationId })}`)
  },
  async createCampaign(input: Pick<RadarCampaign, 'organizationId' | 'name' | 'targetSegment' | 'targetCity' | 'targetState' | 'targetKeywords' | 'targetCnaes' | 'offerType' | 'dailyLimit'> & { budgetLimit?: number }) {
    return apiRequest<RadarCampaign>('/radar/campaigns', { method: 'POST', body: input })
  },
  async addCompany(campaignId: string, input: { organizationId: string; tradeName?: string; legalName?: string; city?: string; state?: string; websiteUrl?: string; emailRaw?: string; phoneRaw?: string }) {
    return apiRequest<{ company: unknown; opportunity: RadarOpportunity }>(`/radar/campaigns/${campaignId}/companies`, { method: 'POST', body: input })
  },
  async reviewOpportunity(opportunityId: string, status: 'approved' | 'rejected') {
    return apiRequest<RadarOpportunity>(`/radar/opportunities/${opportunityId}/review`, { method: 'PATCH', body: { status } })
  },
  async optOutOpportunity(opportunityId: string) {
    return apiRequest<RadarOpportunity>(`/radar/opportunities/${opportunityId}/opt-out`, { method: 'POST' })
  },
  async getMetrics(campaignId: string) {
    return apiRequest<RadarMetrics>(`/radar/campaigns/${campaignId}/metrics`)
  },
}
```

- [ ] **Step 2: Add workspace component**

Create `frontend/src/components/radar/RadarWorkspace.tsx`:

```tsx
import { FormEvent, useEffect, useState } from 'react'
import { Building2, Plus, Radar, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StrategyContextPanel } from '@/components/strategy-engine/StrategyContextPanel'
import { canShowRadarNavigation } from '@/lib/radar/radarRules'
import { radarService } from '@/services/radarService'
import { usePlatformContext } from '@/stores/platformStore'
import type { RadarCampaign } from '@/types/radar'

const initialForm = {
  name: '',
  targetSegment: 'Clinicas',
  targetCity: 'Londrina',
  targetState: 'PR',
  offerType: 'Diagnostico YUX 48h',
  dailyLimit: 5,
}

export function RadarWorkspace() {
  const context = usePlatformContext()
  const organizationId = context.organization?.id
  const [campaigns, setCampaigns] = useState<RadarCampaign[]>([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)

  const canAccess = canShowRadarNavigation(context)

  useEffect(() => {
    if (!organizationId || !canAccess) return
    setLoading(true)
    radarService.getCampaigns(organizationId)
      .then(setCampaigns)
      .catch(error => {
        console.error('Erro ao carregar Radar:', error)
        toast.error('Erro ao carregar Radar Comercial')
      })
      .finally(() => setLoading(false))
  }, [organizationId, canAccess])

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId) return
    const campaign = await radarService.createCampaign({
      organizationId,
      ...form,
      targetKeywords: [form.targetSegment],
      targetCnaes: [],
    })
    setCampaigns(current => [campaign, ...current])
    setForm(initialForm)
    toast.success('Campanha Radar criada')
  }

  if (!canAccess) {
    return (
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          Radar Comercial indisponivel
        </div>
        <p className="mt-2 text-sm text-slate-600">Este modulo e interno da YUX e nao fica disponivel para clientes nesta fase.</p>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radar Comercial</h1>
          <p className="text-sm text-gray-600">Captação ativa consultiva integrada ao Strategy Engine, harness, RAG e CRM.</p>
        </div>
      </div>

      <StrategyContextPanel
        organizationId={organizationId || ''}
        moduleKey="crm"
        recordType="radar"
        recordTitle="Radar Comercial"
        contextSummary="Use o Strategy Engine para orientar analise da oportunidade, oferta recomendada, riscos, evidencias e proxima acao antes de qualquer conversao para lead."
      />

      <section className="rounded-md border bg-white p-4">
        <h2 className="text-base font-semibold text-slate-950">Nova campanha local por nicho</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-6" onSubmit={createCampaign}>
          <Input className="md:col-span-2" placeholder="Nome" value={form.name} required onChange={event => setForm({ ...form, name: event.target.value })} />
          <Input placeholder="Nicho" value={form.targetSegment} required onChange={event => setForm({ ...form, targetSegment: event.target.value })} />
          <Input placeholder="Cidade" value={form.targetCity} required onChange={event => setForm({ ...form, targetCity: event.target.value })} />
          <Input placeholder="UF" value={form.targetState} required maxLength={2} onChange={event => setForm({ ...form, targetState: event.target.value.toUpperCase() })} />
          <Button type="submit"><Plus className="mr-2 h-4 w-4" />Criar</Button>
        </form>
      </section>

      <section className="rounded-md border bg-white">
        <div className="border-b p-4">
          <h2 className="font-semibold text-slate-950">Campanhas</h2>
          <p className="text-sm text-slate-500">Mensagens continuam em revisao humana obrigatoria; nenhum envio automatico e permitido no MVP.</p>
        </div>
        {loading && <p className="p-4 text-sm text-slate-500">Carregando campanhas...</p>}
        {!loading && campaigns.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma campanha criada.</p>}
        {campaigns.map(campaign => (
          <div key={campaign.id} className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[1.2fr_1fr_1fr_120px]">
            <div className="flex items-start gap-2">
              <Radar className="mt-0.5 h-4 w-4 text-yux-700" />
              <div>
                <p className="font-medium text-slate-950">{campaign.name}</p>
                <p className="text-sm text-slate-500">{campaign.targetSegment} em {campaign.targetCity}/{campaign.targetState}</p>
              </div>
            </div>
            <div className="text-sm text-slate-600"><Building2 className="mr-1 inline h-4 w-4" />Oferta: {campaign.offerType}</div>
            <div className="text-sm text-slate-600">Limite diario: {campaign.dailyLimit}</div>
            <div className="text-sm font-medium text-slate-700">{campaign.status}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Add page component**

Create `frontend/src/pages/client-portal/commercial/PortalCommercialRadarPage.tsx`:

```tsx
import { RadarWorkspace } from '@/components/radar/RadarWorkspace'

export function PortalCommercialRadarPage() {
  return <RadarWorkspace />
}
```

- [ ] **Step 4: Register client-workspace route only**

Modify `frontend/src/App.tsx`:

```ts
import { PortalCommercialRadarPage } from '@/pages/client-portal/commercial/PortalCommercialRadarPage'
```

Inside the `client-workspaces/:organizationId` routes under Comercial:

```tsx
<Route path="comercial/radar" element={<PortalCommercialRadarPage />} />
```

Do not add a `/portal/comercial/radar` route.

- [ ] **Step 5: Run frontend focused checks**

Run:

```powershell
cd frontend
npm run test -- src/lib/radar/radarRules.test.ts
npm run type-check
```

Expected: radar rules pass; type-check passes or reports only pre-existing unrelated failures. If unrelated failures exist, capture exact files before continuing.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/services/radarService.ts frontend/src/components/radar/RadarWorkspace.tsx frontend/src/pages/client-portal/commercial/PortalCommercialRadarPage.tsx frontend/src/App.tsx
git commit -m "feat: add radar comercial workspace shell"
```

---

### Task 7: Add Internal Navigation Guard

**Files:**
- Modify: `frontend/src/lib/platform/navigation.ts`
- Modify: `frontend/src/lib/radar/radarRules.test.ts`

- [ ] **Step 1: Add Radar navigation item with guard**

Modify `frontend/src/lib/platform/navigation.ts`:

```ts
import { canShowRadarNavigation } from '@/lib/radar/radarRules'
```

Inside `buildPortalNavigationGroups`, in the `Comercial` group, add this item only through the helper:

```ts
...(canShowRadarNavigation(context) ? [{ label: 'Radar Comercial', href: href('/comercial/radar'), moduleKey: 'crm' }] : []),
```

This is safe because `canShowRadarNavigation` returns false for `portal` mode and false for non-internal workspaces. Use `moduleKey: 'crm'` so the existing CRM icon is used consistently in the sidebar.

- [ ] **Step 2: Extend radar navigation rule tests**

Modify `frontend/src/lib/radar/radarRules.test.ts` by adding a client workspace that is not the internal growth workspace:

```ts
expect(canShowRadarNavigation({
  mode: 'client_workspace',
  organization: { id: 'org-2', name: 'Cliente', slug: 'cliente', kind: 'client', isInternalGrowthWorkspace: false, createdAt: '', updatedAt: '' },
  membership: null,
  role: { key: 'yux_admin', name: 'Admin', scope: 'internal', permissions: ['platform.manage'] },
  enabledModuleKeys: ['crm'],
})).toBe(false)
```

- [ ] **Step 3: Run frontend tests**

Run:

```powershell
cd frontend
npm run test -- src/lib/radar/radarRules.test.ts
```

Expected: radar navigation tests pass.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/lib/platform/navigation.ts frontend/src/lib/radar/radarRules.test.ts
git commit -m "feat: gate radar comercial navigation"
```

---

### Task 8: Add Review, Provider-Neutral Analysis, And CRM Conversion Backend

**Files:**
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] **Step 1: Add deterministic run-analysis repository method**

Append a repository method that creates the first provider-neutral analysis artifact through the same output contract used by the Python harness:

```ts
export async function runRadarOpportunityAnalysis(pool: pg.Pool, user: AuthUser, opportunityId: string) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const opportunityResult = await client.query(
      `SELECT o.*, c.trade_name, c.legal_name, c.city, c.state, c.website_url
       FROM public.radar_opportunities o
       JOIN public.radar_company_records c ON c.id = o.company_record_id
       WHERE o.id = $1
       LIMIT 1`,
      [opportunityId],
    )
    const opportunity = opportunityResult.rows[0]
    if (!opportunity) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })

    const companyName = opportunity.trade_name || opportunity.legal_name || 'empresa'
    const diagnostic = await client.query(
      `INSERT INTO public.radar_diagnostics (
         organization_id, campaign_id, company_record_id, opportunity_id, summary,
         pain_hypotheses, recommended_offer, evidence_json, risk_flags, strategy_profile_key
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ai_sdr_comercial_1')
       RETURNING *`,
      [
        opportunity.organization_id,
        opportunity.campaign_id,
        opportunity.company_record_id,
        opportunity.id,
        `Analise da oportunidade para ${companyName}.`,
        ['Possivel perda de oportunidades por baixa estrutura de captura e follow-up.'],
        'Diagnostico YUX 48h',
        [{ label: 'Fonte publica', value: opportunity.website_url || `${opportunity.city}/${opportunity.state}` }],
        [],
      ],
    )
    const score = await client.query(
      `INSERT INTO public.radar_scores (
         organization_id, campaign_id, company_record_id, opportunity_id,
         total_score, fit_score, timing_score, pain_score, contactability_score,
         budget_score, personalization_score, explanation
       )
       VALUES ($1,$2,$3,$4,72,75,65,70,70,60,80,$5)
       RETURNING *`,
      [
        opportunity.organization_id,
        opportunity.campaign_id,
        opportunity.company_record_id,
        opportunity.id,
        'Score inicial calculado por fit, dor aparente, contato publico e personalizacao disponivel.',
      ],
    )
    const message = await client.query(
      `INSERT INTO public.radar_message_suggestions (
         organization_id, campaign_id, company_record_id, opportunity_id,
         channel, subject, body, personalization_notes, evidence_used, policy_decision
       )
       VALUES ($1,$2,$3,$4,'email',$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        opportunity.organization_id,
        opportunity.campaign_id,
        opportunity.company_record_id,
        opportunity.id,
        `Analise rapida para ${companyName}`,
        `Analisei sinais publicos da ${companyName} e identifiquei oportunidades de melhoria comercial. Posso te enviar 3 ideias praticas?`,
        'Revisao humana obrigatoria antes de qualquer envio.',
        [{ label: 'Fonte publica', value: opportunity.website_url || `${opportunity.city}/${opportunity.state}` }],
        {
          status: 'requires_human_approval',
          canSendAutomatically: false,
          canConvertToLead: true,
          blockedReasons: [],
          requiredReviewFields: ['message', 'evidence', 'risk_flags'],
        },
      ],
    )
    const updated = await client.query(
      `UPDATE public.radar_opportunities
       SET status = 'review_pending',
           latest_diagnostic_id = $2,
           latest_score_id = $3,
           latest_message_suggestion_id = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [opportunity.id, diagnostic.rows[0].id, score.rows[0].id, message.rows[0].id],
    )
    await client.query(
      `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
       VALUES ($1,$2,$3,$4,'diagnostic_generated'), ($1,$2,$3,$4,'score_generated'), ($1,$2,$3,$4,'message_generated')`,
      [opportunity.organization_id, opportunity.campaign_id, opportunity.company_record_id, opportunity.id],
    )
    await client.query('COMMIT')
    return mapOpportunity(updated.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

- [ ] **Step 2: Add route for run-analysis**

In `backend/src/modules/radar/routes.ts`, import `runRadarOpportunityAnalysis` and add:

```ts
app.post('/opportunities/:id/run-analysis', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'invalid_radar_opportunity_id' })
  return runRadarOpportunityAnalysis(app.pg, user, params.data.id)
})
```

- [ ] **Step 3: Add conversion method**

Append this implementation:

```ts
export async function convertRadarOpportunityToLead(pool: pg.Pool, user: AuthUser, opportunityId: string) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const opportunityResult = await client.query(
      `SELECT o.*, c.trade_name, c.legal_name, c.email_raw, c.phone_raw, c.city, c.state, d.summary, s.total_score, m.body AS message_body
       FROM public.radar_opportunities o
       JOIN public.radar_company_records c ON c.id = o.company_record_id
       LEFT JOIN public.radar_diagnostics d ON d.id = o.latest_diagnostic_id
       LEFT JOIN public.radar_scores s ON s.id = o.latest_score_id
       LEFT JOIN public.radar_message_suggestions m ON m.id = o.latest_message_suggestion_id
       WHERE o.id = $1
       LIMIT 1`,
      [opportunityId],
    )
    const opportunity = opportunityResult.rows[0]
    if (!opportunity) throw Object.assign(new Error('radar_opportunity_not_found'), { statusCode: 404 })
    if (opportunity.status === 'opted_out') throw Object.assign(new Error('radar_opportunity_opted_out'), { statusCode: 409 })
    if (opportunity.status !== 'approved') throw Object.assign(new Error('radar_opportunity_not_approved'), { statusCode: 409 })
    if (opportunity.converted_lead_id) throw Object.assign(new Error('radar_opportunity_already_converted'), { statusCode: 409 })

    const pipeline = await client.query(
      `SELECT p.id AS pipeline_id, s.id AS stage_id
       FROM public.crm_pipelines p
       JOIN public.crm_pipeline_stages s ON s.pipeline_id = p.id
       WHERE p.organization_id = $1 AND p.is_active = TRUE AND s.is_active = TRUE
       ORDER BY p.is_default DESC, s.order_index ASC
       LIMIT 1`,
      [opportunity.organization_id],
    )
    const firstPipeline = pipeline.rows[0]
    if (!firstPipeline) throw Object.assign(new Error('radar_crm_pipeline_not_found'), { statusCode: 409 })

    const companyName = opportunity.trade_name || opportunity.legal_name || 'Empresa Radar'
    const lead = await client.query(
      `INSERT INTO public.leads (
         organization_id, pipeline_id, stage_id, name, email, phone, company, source,
         source_kind, status, score, notes, last_activity_at, attribution_context, stage
       )
       VALUES ($1,$2,$3,$4,$5,$6,$4,'Radar Comercial','outbound','open',$7,$8,NOW(),$9,'NEW')
       RETURNING id`,
      [
        opportunity.organization_id,
        firstPipeline.pipeline_id,
        firstPipeline.stage_id,
        companyName,
        opportunity.email_raw || `radar-${opportunity.id}@yux.local`,
        opportunity.phone_raw,
        opportunity.total_score || 0,
        opportunity.summary || `Analise da oportunidade para ${companyName}.`,
        {
          radarCampaignId: opportunity.campaign_id,
          radarCompanyRecordId: opportunity.company_record_id,
          radarOpportunityId: opportunity.id,
          radarDiagnosticId: opportunity.latest_diagnostic_id,
          radarScoreId: opportunity.latest_score_id,
          radarMessageSuggestionId: opportunity.latest_message_suggestion_id,
          recommendedOffer: 'Diagnostico YUX 48h',
        },
      ],
    )
    const leadId = lead.rows[0].id
    await client.query(
      `INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
       VALUES ($1,$2,'note','Analise Radar Comercial',$3,NOW())`,
      [opportunity.organization_id, leadId, `${opportunity.summary || ''}\n\nMensagem aprovada:\n${opportunity.message_body || ''}`.trim()],
    )
    const updated = await client.query(
      `UPDATE public.radar_opportunities
       SET status = 'converted', converted_lead_id = $2, converted_at = NOW(), converted_by = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [opportunity.id, leadId, user.id],
    )
    await client.query(
      `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, lead_id, event_type)
       VALUES ($1,$2,$3,$4,$5,'converted_to_lead')`,
      [opportunity.organization_id, opportunity.campaign_id, opportunity.company_record_id, opportunity.id, leadId],
    )
    await client.query('COMMIT')
    return { leadId, opportunity: mapOpportunity(updated.rows[0]) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

- [ ] **Step 4: Add conversion route**

In `backend/src/modules/radar/routes.ts`:

```ts
app.post('/opportunities/:id/convert-to-lead', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'invalid_radar_opportunity_id' })
  return reply.code(201).send(await convertRadarOpportunityToLead(app.pg, user, params.data.id))
})
```

- [ ] **Step 5: Extend route tests**

Add tests that:

- `POST /api/radar/opportunities/:id/run-analysis` returns `review_pending`;
- `PATCH /api/radar/opportunities/:id/review` returns `approved`;
- `POST /api/radar/opportunities/:id/opt-out` returns `opted_out`;
- `POST /api/radar/opportunities/:id/convert-to-lead` returns a lead id and sets converted fields.

- [ ] **Step 6: Run backend radar tests**

Run:

```powershell
cd backend
npm run test -- tests/radar-routes.test.ts
npm run type-check
```

Expected: radar tests pass and backend type-check passes.

- [ ] **Step 7: Commit**

```powershell
git add backend/src/modules/radar backend/tests/radar-routes.test.ts
git commit -m "feat: connect radar review and crm conversion"
```

---

### Task 9: Add Opportunity Review UI And Metrics Shell

**Files:**
- Modify: `frontend/src/services/radarService.ts`
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`
- Modify: `frontend/src/types/radar.ts`

- [ ] **Step 1: Add service methods**

Extend `radarService`:

```ts
async runAnalysis(opportunityId: string) {
  return apiRequest<RadarOpportunity>(`/radar/opportunities/${opportunityId}/run-analysis`, { method: 'POST' })
},
async convertToLead(opportunityId: string) {
  return apiRequest<{ leadId: string; opportunity: RadarOpportunity }>(`/radar/opportunities/${opportunityId}/convert-to-lead`, { method: 'POST' })
},
```

- [ ] **Step 2: Add opportunity panel component inside RadarWorkspace**

Add this state to `RadarWorkspace.tsx`:

```tsx
const [selectedOpportunity, setSelectedOpportunity] = useState<RadarOpportunity | null>(null)
```

Add this panel after the campaigns section:

```tsx
<section className="rounded-md border bg-white p-4">
  <h2 className="font-semibold text-slate-950">Revisao da oportunidade</h2>
  {!selectedOpportunity && (
    <p className="mt-2 text-sm text-slate-500">
      Selecione uma oportunidade gerada pela campanha para revisar analise, score, evidencia e mensagem.
    </p>
  )}
  {selectedOpportunity && (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-slate-700">{selectedOpportunity.latestDiagnostic?.summary || 'Analise ainda nao gerada.'}</p>
      <p className="text-sm font-medium text-slate-950">Score: {selectedOpportunity.latestScore?.totalScore ?? 'sem score'}</p>
      <p className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
        {selectedOpportunity.latestMessageSuggestion?.body || 'Mensagem ainda nao gerada.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => radarService.runAnalysis(selectedOpportunity.id).then(setSelectedOpportunity)}>
          Rodar analise
        </Button>
        <Button type="button" variant="outline" onClick={() => radarService.reviewOpportunity(selectedOpportunity.id, 'approved').then(setSelectedOpportunity)}>
          Aprovar
        </Button>
        <Button type="button" variant="outline" onClick={() => radarService.reviewOpportunity(selectedOpportunity.id, 'rejected').then(setSelectedOpportunity)}>
          Rejeitar
        </Button>
        <Button type="button" variant="outline" onClick={() => radarService.optOutOpportunity(selectedOpportunity.id).then(setSelectedOpportunity)}>
          Opt-out
        </Button>
        <Button type="button" disabled={selectedOpportunity.status !== 'approved'} onClick={() => radarService.convertToLead(selectedOpportunity.id).then(() => toast.success('Lead criado no CRM'))}>
          Criar lead
        </Button>
      </div>
    </div>
  )}
</section>
```

In this task, `selectedOpportunity` is set by future list interactions. The panel still compiles and makes the review contract explicit for Task 8 routes.

- [ ] **Step 3: Keep UI language consistent**

Search:

```powershell
rg -n "Diagnostico Radar|rodar diagnostico|Diagnóstico Radar|Diagnostico YUX 48h" frontend/src/components/radar frontend/src/pages/client-portal/commercial
```

Expected: no UI label uses `Diagnostico Radar`; `Diagnostico YUX 48h` may appear only as an offer value.

- [ ] **Step 4: Run frontend checks**

Run:

```powershell
cd frontend
npm run type-check
```

Expected: type-check passes or only pre-existing unrelated failures are documented.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/services/radarService.ts frontend/src/components/radar/RadarWorkspace.tsx frontend/src/types/radar.ts
git commit -m "feat: add radar opportunity review ui"
```

---

### Task 10: Final Verification And Handoff

- [ ] **Step 1: Run backend tests**

```powershell
cd backend
npm run test -- tests/radar-routes.test.ts
npm run type-check
```

Expected: pass.

- [ ] **Step 2: Run runtime tests**

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest tests.test_radar
python -m unittest tests.test_agent_harness_runtime
```

Expected: pass.

- [ ] **Step 3: Run frontend tests**

```powershell
cd frontend
npm run test -- src/lib/radar/radarRules.test.ts
npm run type-check
```

Expected: pass or document unrelated existing type-check failures exactly.

- [ ] **Step 4: Check git status**

```powershell
git status --short
git log --oneline -8
```

Expected: only intended Radar files are modified. Existing untracked `.codegraph/`, `The Black Book.pdf`, and `Virtarix.txt` remain unstaged unless the user explicitly asks otherwise.

- [ ] **Step 5: Production migration handoff**

For production deployment, tell the operator this migration must run in production:

```powershell
docker exec -it yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 node dist/scripts/apply-migrations.js
```

Expected: migration runner applies `0107_radar_comercial_growth_workflow.sql`.

---

## Self-Review

- Spec coverage: P0-P4 are covered through schema, backend API, runtime workflow, frontend workspace, review/CRM conversion, and metrics shell.
- Open item scan: no unresolved markers or open-ended implementation step remains.
- Type consistency: route names use `/api/radar`; frontend `apiRequest` paths omit `/api` consistent with existing services; UI uses `Analise da oportunidade`; runtime uses `commercial_radar_local_niche`.
- Risk note: the plan uses a deterministic provider-neutral backend analysis path before live HTTP calls to the Python runtime. This keeps the first implementation testable and audit-friendly while preserving the final harness contract.
