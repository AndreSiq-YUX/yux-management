# YUX Intelligent Automations + SMTP2GO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build native YUX intelligent automations, commercial sequences, sector templates and a shared SMTP2GO email delivery layer.

**Architecture:** Extend the existing Flow Builder Lite instead of replacing it. Keep automation rules pure and testable, execute all actions through server-side adapters, and route every system email through a single SMTP2GO-aware delivery layer with limits, suppressions and webhooks.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Recharts, Supabase Postgres, RLS, Edge Functions, SMTP2GO API/webhooks, existing CRM/omnichannel/proposals/finance/support services.

---

## File Structure

### Phase A - Native Automation Foundation

- Create: `frontend/src/types/intelligentAutomation.ts`
- Create: `frontend/src/lib/automations/automationCatalog.ts`
- Create: `frontend/src/lib/automations/intelligentAutomationRules.ts`
- Create: `frontend/src/lib/automations/intelligentAutomationRules.test.ts`
- Modify: `frontend/src/types/automation.ts`
- Modify: `frontend/src/lib/automations/automationRules.ts`
- Modify: `frontend/src/services/automationService.ts`
- Modify: `frontend/src/components/automations/AutomationWorkspace.tsx`
- Create: `supabase/migrations/20260604050000_intelligent_automations_foundation.sql`
- Create: `supabase/probes/20260604050000_intelligent_automations_foundation.sql`

### Phase B - Commercial Sequences

- Create: `frontend/src/types/automationSequence.ts`
- Create: `frontend/src/lib/automations/sequenceRules.ts`
- Create: `frontend/src/lib/automations/sequenceRules.test.ts`
- Create: `frontend/src/services/automationSequenceService.ts`
- Create: `frontend/src/services/automationSequenceService.test.ts`
- Create: `frontend/src/components/automations/SequencesWorkspace.tsx`
- Modify: `frontend/src/components/automations/AutomationWorkspace.tsx`
- Create: `supabase/migrations/20260604060000_automation_sequences.sql`
- Create: `supabase/probes/20260604060000_automation_sequences.sql`

### Phase C - SMTP2GO Email Hub

- Create: `frontend/src/types/emailDelivery.ts`
- Create: `frontend/src/lib/email/emailDeliveryRules.ts`
- Create: `frontend/src/lib/email/emailDeliveryRules.test.ts`
- Create: `frontend/src/services/emailDeliveryService.ts`
- Create: `frontend/src/services/emailDeliveryService.test.ts`
- Create: `frontend/src/components/automations/EmailSettingsPanel.tsx`
- Create: `supabase/migrations/20260604070000_smtp2go_email_hub.sql`
- Create: `supabase/probes/20260604070000_smtp2go_email_hub.sql`
- Create: `supabase/functions/send-email/index.ts`
- Create: `supabase/functions/send-email/deno.json`
- Create: `supabase/functions/smtp2go-webhook/index.ts`
- Create: `supabase/functions/smtp2go-webhook/deno.json`

### Phase D - Sector Templates

- Create: `frontend/src/types/automationTemplate.ts`
- Create: `frontend/src/lib/automations/templateRules.ts`
- Create: `frontend/src/lib/automations/templateRules.test.ts`
- Create: `frontend/src/services/automationTemplateService.ts`
- Create: `frontend/src/components/automations/AutomationTemplatesWorkspace.tsx`
- Create: `supabase/migrations/20260604080000_automation_sector_templates.sql`
- Create: `supabase/probes/20260604080000_automation_sector_templates.sql`

### Phase E - AI Automation Blocks

- Create: `frontend/src/types/automationAi.ts`
- Create: `frontend/src/lib/automations/automationAiRules.ts`
- Create: `frontend/src/lib/automations/automationAiRules.test.ts`
- Create: `frontend/src/services/automationAiService.ts`
- Create: `frontend/src/components/automations/AiAutomationBlockPanel.tsx`
- Modify: `supabase/functions/process-ai-message/index.ts`
- Create: `supabase/functions/run-automation-ai-step/index.ts`
- Create: `supabase/functions/run-automation-ai-step/deno.json`
- Create: `supabase/migrations/20260604090000_automation_ai_blocks.sql`
- Create: `supabase/probes/20260604090000_automation_ai_blocks.sql`

### Phase F - Advanced Builder And Governance

- Create: `frontend/src/components/automations/AutomationGuidedBuilder.tsx`
- Create: `frontend/src/components/automations/AutomationTechnicalBuilder.tsx`
- Create: `frontend/src/components/automations/AutomationExecutionsWorkspace.tsx`
- Create: `frontend/src/components/automations/AutomationSimulationPanel.tsx`
- Create: `frontend/src/components/automations/AutomationGovernancePanel.tsx`
- Modify: `frontend/src/pages/automations/AutomationsPage.tsx`
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Create: `supabase/functions/simulate-automation/index.ts`
- Create: `supabase/functions/simulate-automation/deno.json`
- Create: `supabase/migrations/20260604100000_automation_governance.sql`
- Create: `supabase/probes/20260604100000_automation_governance.sql`

---

## Task 0: Remove Obsolete External Automation Phase Documents

**Files:**
- Delete: `docs/superpowers/specs/2026-06-04-yux-crm-marketing-automation-mautic-design.md`
- Delete: `docs/superpowers/plans/2026-06-04-yux-crm-marketing-automation-mautic.md`

- [x] **Step 1: Delete obsolete external automation docs**

Use `apply_patch`:

```diff
*** Delete File: docs/superpowers/specs/2026-06-04-yux-crm-marketing-automation-mautic-design.md
*** Delete File: docs/superpowers/plans/2026-06-04-yux-crm-marketing-automation-mautic.md
```

- [x] **Step 2: Verify obsolete document paths are gone**

Run:

```bash
rg -n "2026-06-04-yux-crm-marketing-automation-mautic" docs/superpowers
```

Expected: no references outside this completed removal task.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-04-yux-crm-marketing-automation-mautic-design.md docs/superpowers/plans/2026-06-04-yux-crm-marketing-automation-mautic.md
git commit -m "docs: remove mautic automation phase"
```

---

## Task 1: Native Automation Domain Catalog

**Files:**
- Create: `frontend/src/types/intelligentAutomation.ts`
- Create: `frontend/src/lib/automations/automationCatalog.ts`
- Create: `frontend/src/lib/automations/intelligentAutomationRules.ts`
- Test: `frontend/src/lib/automations/intelligentAutomationRules.test.ts`
- Modify: `frontend/src/types/automation.ts`

- [x] **Step 1: Write failing domain tests**

Create `frontend/src/lib/automations/intelligentAutomationRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  canPublishAutomation,
  estimateAutomationRisk,
  normalizeAutomationTrigger,
  sanitizeAutomationRunPayload,
  validateAutomationAction,
} from './intelligentAutomationRules'

describe('intelligentAutomationRules', () => {
  it('normalizes known triggers into module-scoped events', () => {
    expect(normalizeAutomationTrigger('lead.created')).toMatchObject({ module: 'crm', key: 'lead.created' })
    expect(normalizeAutomationTrigger('invoice.overdue')).toMatchObject({ module: 'finance', key: 'invoice.overdue' })
  })

  it('blocks unsafe email actions without consent policy', () => {
    expect(validateAutomationAction({
      actionType: 'send_email',
      payload: { emailKind: 'marketing', templateId: 'template-1' },
    })).toEqual({ ok: false, reason: 'marketing_email_requires_consent_policy' })
  })

  it('requires human review for high-risk AI actions', () => {
    expect(estimateAutomationRisk([
      { actionType: 'ai_generate_proposal', orderIndex: 1, payload: { sendAutomatically: true } },
    ])).toMatchObject({ level: 'high', requiresHumanApproval: true })
  })

  it('allows publishing complete low-risk automations', () => {
    expect(canPublishAutomation({
      status: 'draft',
      triggers: [{ triggerType: 'lead.created', config: {} }],
      conditions: [{ field: 'lead.emailOptIn', operator: 'equals', value: true }],
      actions: [{ actionType: 'create_task', orderIndex: 1, payload: { title: 'Ligar' } }],
    })).toEqual({ ok: true })
  })

  it('redacts secrets and tokens from run payloads', () => {
    expect(sanitizeAutomationRunPayload({ token: 'abc', nested: { apiSecret: 'xyz', value: 1 } })).toEqual({
      token: '[redacted]',
      nested: { apiSecret: '[redacted]', value: 1 },
    })
  })
})
```

- [x] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- src/lib/automations/intelligentAutomationRules.test.ts
```

Expected: FAIL because `intelligentAutomationRules.ts` does not exist.

Execution note: the focused failing run was skipped because the test, domain
types and implementation were applied in the same checkpoint. Final focused
test and type-check passed.

- [x] **Step 3: Add types**

Create `frontend/src/types/intelligentAutomation.ts`:

```ts
export type AutomationModule =
  | 'crm'
  | 'omnichannel'
  | 'landing_pages'
  | 'proposals'
  | 'projects'
  | 'finance'
  | 'campaigns'
  | 'reports'
  | 'support'

export type AutomationKind = 'flow' | 'sequence'
export type AutomationBuilderMode = 'guided' | 'technical'
export type AutomationRiskLevel = 'low' | 'medium' | 'high'
export type AutomationPublishStatus = 'draft' | 'active' | 'paused' | 'error' | 'archived'

export interface AutomationCatalogTrigger {
  key: string
  module: AutomationModule
  label: string
  payloadSchema: Record<string, string>
}

export interface AutomationValidationResult {
  ok: boolean
  reason?: string
}

export interface AutomationRiskAssessment {
  level: AutomationRiskLevel
  requiresHumanApproval: boolean
  reasons: string[]
}

export interface IntelligentAutomationAction {
  actionType: string
  orderIndex: number
  payload: Record<string, unknown>
}
```

- [x] **Step 4: Add trigger catalog**

Create `frontend/src/lib/automations/automationCatalog.ts`:

```ts
import type { AutomationCatalogTrigger } from '@/types/intelligentAutomation'

export const automationTriggerCatalog: AutomationCatalogTrigger[] = [
  { key: 'lead.created', module: 'crm', label: 'Lead criado', payloadSchema: { leadId: 'string', source: 'string' } },
  { key: 'lead.stage_changed', module: 'crm', label: 'Lead mudou de etapa', payloadSchema: { leadId: 'string', stageId: 'string' } },
  { key: 'conversation.unanswered', module: 'omnichannel', label: 'Conversa sem resposta', payloadSchema: { conversationId: 'string', minutes: 'number' } },
  { key: 'landing_page.form_submitted', module: 'landing_pages', label: 'Formulario enviado', payloadSchema: { landingPageId: 'string', leadId: 'string' } },
  { key: 'proposal.approved', module: 'proposals', label: 'Proposta aprovada', payloadSchema: { proposalId: 'string', leadId: 'string' } },
  { key: 'project.phase_delayed', module: 'projects', label: 'Fase atrasada', payloadSchema: { projectId: 'string', phaseId: 'string' } },
  { key: 'invoice.overdue', module: 'finance', label: 'Fatura vencida', payloadSchema: { invoiceId: 'string', daysOverdue: 'number' } },
  { key: 'campaign.cpl_above_threshold', module: 'campaigns', label: 'CPL acima do limite', payloadSchema: { campaignId: 'string', cpl: 'number' } },
  { key: 'report.anomaly_detected', module: 'reports', label: 'Anomalia detectada', payloadSchema: { reportId: 'string', metricKey: 'string' } },
  { key: 'ticket.overdue', module: 'support', label: 'Ticket atrasado', payloadSchema: { ticketId: 'string', slaHours: 'number' } },
]
```

- [x] **Step 5: Implement rules**

Create `frontend/src/lib/automations/intelligentAutomationRules.ts`:

```ts
import { automationTriggerCatalog } from './automationCatalog'
import type {
  AutomationRiskAssessment,
  AutomationValidationResult,
  IntelligentAutomationAction,
} from '@/types/intelligentAutomation'

export function normalizeAutomationTrigger(triggerType: string) {
  return automationTriggerCatalog.find(trigger => trigger.key === triggerType) || {
    key: triggerType,
    module: 'crm' as const,
    label: triggerType,
    payloadSchema: {},
  }
}

export function validateAutomationAction(action: Pick<IntelligentAutomationAction, 'actionType' | 'payload'>): AutomationValidationResult {
  if (action.actionType === 'send_email' && action.payload.emailKind === 'marketing' && !action.payload.consentPolicy) {
    return { ok: false, reason: 'marketing_email_requires_consent_policy' }
  }
  if (action.actionType === 'send_whatsapp' && !action.payload.body && !action.payload.templateId) {
    return { ok: false, reason: 'whatsapp_message_requires_body_or_template' }
  }
  if (action.actionType.startsWith('ai_') && action.payload.sendAutomatically === true) {
    return { ok: false, reason: 'ai_automatic_send_requires_human_approval' }
  }
  return { ok: true }
}

export function estimateAutomationRisk(actions: Array<Pick<IntelligentAutomationAction, 'actionType' | 'payload'>>): AutomationRiskAssessment {
  const reasons: string[] = []
  if (actions.some(action => action.actionType.startsWith('ai_') && action.payload.sendAutomatically === true)) {
    reasons.push('automatic_ai_action')
  }
  if (actions.some(action => ['send_email', 'send_whatsapp', 'convert_proposal'].includes(action.actionType))) {
    reasons.push('external_or_commercial_action')
  }
  const level = reasons.includes('automatic_ai_action') ? 'high' : reasons.length ? 'medium' : 'low'
  return { level, requiresHumanApproval: level === 'high', reasons }
}

export function canPublishAutomation(input: {
  status: string
  triggers: unknown[]
  conditions: unknown[]
  actions: Array<Pick<IntelligentAutomationAction, 'actionType' | 'payload'>>
}): AutomationValidationResult {
  if (!input.triggers.length) return { ok: false, reason: 'automation_requires_trigger' }
  if (!input.actions.length) return { ok: false, reason: 'automation_requires_action' }
  const invalidAction = input.actions.map(validateAutomationAction).find(result => !result.ok)
  if (invalidAction) return invalidAction
  return { ok: true }
}

export function sanitizeAutomationRunPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAutomationRunPayload)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const normalizedKey = key.toLowerCase()
    const sanitizedValue = normalizedKey.includes('token') || normalizedKey.includes('secret') || normalizedKey.includes('password')
      ? '[redacted]'
      : sanitizeAutomationRunPayload(entry)
    return [key, sanitizedValue]
  }))
}
```

- [x] **Step 6: Run tests**

Run:

```bash
npm test -- src/lib/automations/intelligentAutomationRules.test.ts
npm run type-check
```

Expected: tests and type-check pass.

- [x] **Step 7: Commit**

```bash
git add frontend/src/types/intelligentAutomation.ts frontend/src/lib/automations/automationCatalog.ts frontend/src/lib/automations/intelligentAutomationRules.ts frontend/src/lib/automations/intelligentAutomationRules.test.ts
git commit -m "feat: add intelligent automation rules"
```

---

## Task 2: Automation Foundation Schema And Service

**Files:**
- Create: `supabase/migrations/20260604050000_intelligent_automations_foundation.sql`
- Create: `supabase/probes/20260604050000_intelligent_automations_foundation.sql`
- Modify: `frontend/src/services/automationService.ts`
- Modify: `frontend/src/services/automationService.test.ts`

- [x] **Step 1: Create migration through Supabase CLI**

Run:

```bash
supabase migration new intelligent_automations_foundation
```

Rename the generated file to:

```text
supabase/migrations/20260604050000_intelligent_automations_foundation.sql
```

- [x] **Step 2: Add schema extensions**

Add to `supabase/migrations/20260604050000_intelligent_automations_foundation.sql`:

```sql
ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS automation_kind TEXT NOT NULL DEFAULT 'flow' CHECK (automation_kind IN ('flow', 'sequence')),
  ADD COLUMN IF NOT EXISTS builder_mode TEXT NOT NULL DEFAULT 'guided' CHECK (builder_mode IN ('guided', 'technical')),
  ADD COLUMN IF NOT EXISTS published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  ADD COLUMN IF NOT EXISTS active_version_id UUID,
  ADD COLUMN IF NOT EXISTS daily_run_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_run_limit >= 0),
  ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high'));

CREATE TABLE IF NOT EXISTS public.automation_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, version_number)
);

ALTER TABLE public.automation_flows
  ADD CONSTRAINT automation_flows_active_version_fkey
  FOREIGN KEY (active_version_id) REFERENCES public.automation_flow_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.automation_simulation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.automation_flows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  sample_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sample_payload) = 'object'),
  matched BOOLEAN NOT NULL DEFAULT false,
  condition_results JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(condition_results) = 'array'),
  planned_actions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(planned_actions) = 'array'),
  blocked_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  estimated_ai_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (estimated_ai_cost >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_flow_versions_flow ON public.automation_flow_versions(flow_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_automation_simulation_runs_flow ON public.automation_simulation_runs(flow_id, created_at DESC);

ALTER TABLE public.automation_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_simulation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_flow_versions_read" ON public.automation_flow_versions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'read'))
  );

CREATE POLICY "automation_flow_versions_manage" ON public.automation_flow_versions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  );

CREATE POLICY "automation_simulation_runs_access" ON public.automation_simulation_runs
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_flow_versions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_simulation_runs TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [x] **Step 3: Add probe**

Create `supabase/probes/20260604050000_intelligent_automations_foundation.sql`:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_flows' AND column_name = 'automation_kind'
  ) THEN
    RAISE EXCEPTION 'automation_flows.automation_kind missing';
  END IF;

  IF to_regclass('public.automation_flow_versions') IS NULL THEN
    RAISE EXCEPTION 'automation_flow_versions missing';
  END IF;

  IF to_regclass('public.automation_simulation_runs') IS NULL THEN
    RAISE EXCEPTION 'automation_simulation_runs missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.automation_flow_versions', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select automation_flow_versions';
  END IF;
END $$;
```

- [x] **Step 4: Add service payload test**

In `frontend/src/services/automationService.test.ts`, add:

```ts
import { buildFlowVersionPayload } from './automationService'

it('builds published flow version snapshots', () => {
  expect(buildFlowVersionPayload({
    flowId: 'flow-1',
    versionNumber: 1,
    snapshot: { triggers: [], conditions: [], actions: [] },
    status: 'published',
  })).toEqual({
    flow_id: 'flow-1',
    version_number: 1,
    snapshot: { triggers: [], conditions: [], actions: [] },
    status: 'published',
    published_at: expect.any(String),
  })
})
```

- [x] **Step 5: Add service builder**

In `frontend/src/services/automationService.ts`, add:

```ts
export const buildFlowVersionPayload = (input: {
  flowId: string
  versionNumber: number
  snapshot: Record<string, unknown>
  status?: 'draft' | 'published' | 'archived'
}) => ({
  flow_id: input.flowId,
  version_number: input.versionNumber,
  snapshot: input.snapshot,
  status: input.status || 'draft',
  published_at: input.status === 'published' ? new Date().toISOString() : null,
})
```

- [x] **Step 6: Validate**

Run:

```bash
npm test -- src/services/automationService.test.ts
npm run type-check
supabase db reset --debug
```

Expected frontend: pass. If Docker is unavailable, record the Supabase reset blocker exactly in the final notes.

Execution note: `npm test -- src/services/automationService.test.ts` and
`npm run type-check` passed. `supabase db reset --debug` was blocked by Docker:
`open //./pipe/docker_engine: O sistema não pode encontrar o arquivo especificado.`

- [x] **Step 7: Commit**

```bash
git add frontend/src/services/automationService.ts frontend/src/services/automationService.test.ts supabase/migrations/20260604050000_intelligent_automations_foundation.sql supabase/probes/20260604050000_intelligent_automations_foundation.sql
git commit -m "feat: add intelligent automation foundation"
```

---

## Task 3: SMTP2GO Email Delivery Rules And Schema

**Files:**
- Create: `frontend/src/types/emailDelivery.ts`
- Create: `frontend/src/lib/email/emailDeliveryRules.ts`
- Test: `frontend/src/lib/email/emailDeliveryRules.test.ts`
- Create: `supabase/migrations/20260604070000_smtp2go_email_hub.sql`
- Create: `supabase/probes/20260604070000_smtp2go_email_hub.sql`

- [ ] **Step 1: Write failing email rule tests**

Create `frontend/src/lib/email/emailDeliveryRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  canSendEmail,
  calculateRemainingDailyEmailQuota,
  isSmtp2goWebhookRetryable,
  sanitizeEmailForPortal,
} from './emailDeliveryRules'

describe('emailDeliveryRules', () => {
  it('blocks marketing email without opt-in', () => {
    expect(canSendEmail({
      emailKind: 'marketing',
      recipientOptIn: false,
      suppressed: false,
      dailyLimit: 100,
      sentToday: 0,
    })).toEqual({ ok: false, reason: 'recipient_not_opted_in' })
  })

  it('allows transactional email when quota is available', () => {
    expect(canSendEmail({
      emailKind: 'transactional',
      recipientOptIn: false,
      suppressed: false,
      dailyLimit: 100,
      sentToday: 99,
    })).toEqual({ ok: true })
  })

  it('blocks suppressed recipients and exhausted quota', () => {
    expect(canSendEmail({ emailKind: 'transactional', suppressed: true, dailyLimit: 10, sentToday: 0 })).toEqual({ ok: false, reason: 'recipient_suppressed' })
    expect(canSendEmail({ emailKind: 'transactional', suppressed: false, dailyLimit: 10, sentToday: 10 })).toEqual({ ok: false, reason: 'daily_quota_exhausted' })
  })

  it('calculates remaining daily quota', () => {
    expect(calculateRemainingDailyEmailQuota({ dailyLimit: 100, sentToday: 30 })).toBe(70)
  })

  it('treats rejects and unsubscribes as non-retryable webhook outcomes', () => {
    expect(isSmtp2goWebhookRetryable('reject')).toBe(false)
    expect(isSmtp2goWebhookRetryable('unsubscribe')).toBe(false)
    expect(isSmtp2goWebhookRetryable('temporary_failure')).toBe(true)
  })

  it('redacts provider references from portal email data', () => {
    expect(sanitizeEmailForPortal({ providerMessageId: 'smtp2go-1', tokenReference: 'secret', subject: 'Fatura' })).toEqual({ subject: 'Fatura' })
  })
})
```

- [ ] **Step 2: Create email types**

Create `frontend/src/types/emailDelivery.ts`:

```ts
export type EmailKind = 'transactional' | 'marketing' | 'operational'
export type EmailSendStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'rejected' | 'suppressed'
export type EmailSuppressionReason = 'bounce' | 'spam' | 'unsubscribe' | 'manual' | 'provider_reject'
export type Smtp2goWebhookEventType = 'processed' | 'delivered' | 'open' | 'click' | 'bounce' | 'spam' | 'unsubscribe' | 'resubscribe' | 'reject' | 'temporary_failure'

export interface EmailSendEligibilityInput {
  emailKind: EmailKind
  recipientOptIn?: boolean
  suppressed: boolean
  dailyLimit: number
  sentToday: number
}

export interface EmailSendEligibility {
  ok: boolean
  reason?: 'recipient_not_opted_in' | 'recipient_suppressed' | 'daily_quota_exhausted'
}
```

- [ ] **Step 3: Implement rules**

Create `frontend/src/lib/email/emailDeliveryRules.ts`:

```ts
import type { EmailSendEligibility, EmailSendEligibilityInput, Smtp2goWebhookEventType } from '@/types/emailDelivery'

export function canSendEmail(input: EmailSendEligibilityInput): EmailSendEligibility {
  if (input.suppressed) return { ok: false, reason: 'recipient_suppressed' }
  if (input.sentToday >= input.dailyLimit) return { ok: false, reason: 'daily_quota_exhausted' }
  if (input.emailKind === 'marketing' && !input.recipientOptIn) return { ok: false, reason: 'recipient_not_opted_in' }
  return { ok: true }
}

export function calculateRemainingDailyEmailQuota(input: { dailyLimit: number; sentToday: number }) {
  return Math.max(0, input.dailyLimit - input.sentToday)
}

export function isSmtp2goWebhookRetryable(eventType: Smtp2goWebhookEventType | string) {
  return eventType === 'temporary_failure'
}

export function sanitizeEmailForPortal<T extends Record<string, unknown>>(input: T) {
  const { providerMessageId: _providerMessageId, tokenReference: _tokenReference, ...safe } = input
  return safe
}
```

- [ ] **Step 4: Add SMTP2GO schema**

Create migration `supabase/migrations/20260604070000_smtp2go_email_hub.sql` with:

```sql
CREATE TABLE IF NOT EXISTS public.email_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'smtp2go' CHECK (provider IN ('smtp2go')),
  status TEXT NOT NULL DEFAULT 'needs_setup' CHECK (status IN ('connected', 'stale', 'needs_setup', 'failed')),
  token_reference TEXT,
  default_from_email TEXT,
  default_from_name TEXT,
  daily_send_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_send_limit >= 0),
  last_verified_at TIMESTAMPTZ,
  protected_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.smtp2go_subaccounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.email_provider_connections(id) ON DELETE CASCADE,
  smtp2go_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  monthly_quota INTEGER NOT NULL DEFAULT 0 CHECK (monthly_quota >= 0),
  daily_send_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_send_limit >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, smtp2go_account_id)
);

CREATE TABLE IF NOT EXISTS public.email_send_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.email_provider_connections(id) ON DELETE SET NULL,
  subaccount_id UUID REFERENCES public.smtp2go_subaccounts(id) ON DELETE SET NULL,
  email_kind TEXT NOT NULL CHECK (email_kind IN ('transactional', 'marketing', 'operational')),
  module_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'rejected', 'suppressed')),
  provider_message_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  protected_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_send_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.email_send_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_payload) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_suppression_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'spam', 'unsubscribe', 'manual', 'provider_reject')),
  source TEXT NOT NULL DEFAULT 'smtp2go',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subaccount_id UUID REFERENCES public.smtp2go_subaccounts(id) ON DELETE SET NULL,
  period_date DATE NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  UNIQUE (organization_id, subaccount_id, period_date)
);

ALTER TABLE public.email_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smtp2go_subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_usage_counters ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_provider_connections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smtp2go_subaccounts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_suppression_entries TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_usage_counters TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 5: Add probe**

Create `supabase/probes/20260604070000_smtp2go_email_hub.sql`:

```sql
DO $$
BEGIN
  IF to_regclass('public.email_provider_connections') IS NULL THEN
    RAISE EXCEPTION 'email_provider_connections missing';
  END IF;
  IF to_regclass('public.smtp2go_subaccounts') IS NULL THEN
    RAISE EXCEPTION 'smtp2go_subaccounts missing';
  END IF;
  IF to_regclass('public.email_send_requests') IS NULL THEN
    RAISE EXCEPTION 'email_send_requests missing';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.email_send_requests', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select email_send_requests';
  END IF;
END $$;
```

- [ ] **Step 6: Validate**

Run:

```bash
npm test -- src/lib/email/emailDeliveryRules.test.ts
npm run type-check
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/emailDelivery.ts frontend/src/lib/email/emailDeliveryRules.ts frontend/src/lib/email/emailDeliveryRules.test.ts supabase/migrations/20260604070000_smtp2go_email_hub.sql supabase/probes/20260604070000_smtp2go_email_hub.sql
git commit -m "feat: add smtp2go email delivery foundation"
```

---

## Task 4: SMTP2GO Edge Functions

**Files:**
- Create: `supabase/functions/send-email/index.ts`
- Create: `supabase/functions/send-email/deno.json`
- Create: `supabase/functions/smtp2go-webhook/index.ts`
- Create: `supabase/functions/smtp2go-webhook/deno.json`

- [ ] **Step 1: Add send-email function**

Create `supabase/functions/send-email/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const body = await req.json()
  const requestId = body.requestId
  if (!requestId) return json({ error: 'requestId is required' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: request, error } = await admin
    .from('email_send_requests')
    .select('*, email_provider_connections(*), smtp2go_subaccounts(*)')
    .eq('id', requestId)
    .single()
  if (error || !request) return json({ error: 'email request not found' }, 404)
  if (request.status === 'sent' || request.status === 'delivered') return json({ success: true, duplicate: true })

  const apiKey = Deno.env.get(request.email_provider_connections?.token_reference || 'SMTP2GO_API_KEY')
  if (!apiKey) return markFailed(admin, requestId, 'SMTP2GO API key not configured')

  await admin.from('email_send_requests').update({ status: 'sending', protected_error: null }).eq('id', requestId)

  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      sender: request.email_provider_connections?.default_from_email,
      to: [request.recipient_email],
      subject: request.subject,
      html_body: request.body_html || undefined,
      text_body: request.body_text || undefined,
      custom_headers: [{ header: 'X-YUX-Email-Request-ID', value: request.id }],
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) return markFailed(admin, requestId, `SMTP2GO returned ${response.status}`)

  await admin.from('email_send_requests').update({
    status: 'sent',
    provider_message_id: result?.data?.email_id || result?.data?.email_ids?.[0] || null,
  }).eq('id', requestId)
  await admin.from('email_send_events').insert({ request_id: requestId, event_type: 'sent', provider_payload: result })
  return json({ success: true })
})

async function markFailed(admin: any, requestId: string, error: string) {
  await admin.from('email_send_requests').update({ status: 'failed', protected_error: error }).eq('id', requestId)
  return json({ error }, 500)
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 2: Add webhook function**

Create `supabase/functions/smtp2go-webhook/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

Deno.serve(async req => {
  const payload = await req.json()
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const events = Array.isArray(payload.events) ? payload.events : [payload]

  for (const event of events) {
    const requestId = event.headers?.['X-YUX-Email-Request-ID'] || event.custom_headers?.['X-YUX-Email-Request-ID']
    if (!requestId) continue
    await admin.from('email_send_events').insert({
      request_id: requestId,
      event_type: event.event || event.type || 'unknown',
      provider_payload: event,
      occurred_at: event.timestamp ? new Date(Number(event.timestamp) * 1000).toISOString() : new Date().toISOString(),
    })
    await applyStatus(admin, requestId, event.event || event.type, event)
  }

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
})

async function applyStatus(admin: any, requestId: string, eventType: string, event: Record<string, any>) {
  const statusByEvent: Record<string, string> = {
    delivered: 'delivered',
    bounce: 'failed',
    spam: 'failed',
    unsubscribe: 'suppressed',
    reject: 'rejected',
  }
  const status = statusByEvent[eventType]
  if (status) await admin.from('email_send_requests').update({ status }).eq('id', requestId)
  if (['bounce', 'spam', 'unsubscribe', 'reject'].includes(eventType) && event.recipient) {
    const { data: request } = await admin.from('email_send_requests').select('organization_id').eq('id', requestId).single()
    if (request?.organization_id) {
      await admin.from('email_suppression_entries').upsert({
        organization_id: request.organization_id,
        email: event.recipient,
        reason: eventType === 'reject' ? 'provider_reject' : eventType,
        source: 'smtp2go',
      }, { onConflict: 'organization_id,email' })
    }
  }
}
```

- [ ] **Step 3: Add function configs**

Create both `deno.json` files:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

- [ ] **Step 4: Validate**

Run:

```bash
deno test supabase/functions/send-email supabase/functions/smtp2go-webhook
```

Expected: if Deno is available, no syntax errors. If Deno is unavailable, record the blocker.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-email supabase/functions/smtp2go-webhook
git commit -m "feat: add smtp2go email functions"
```

---

## Task 5: Automations UI Product Shell

**Files:**
- Create: `frontend/src/components/automations/AutomationGuidedBuilder.tsx`
- Create: `frontend/src/components/automations/AutomationTechnicalBuilder.tsx`
- Create: `frontend/src/components/automations/AutomationExecutionsWorkspace.tsx`
- Create: `frontend/src/components/automations/AutomationSimulationPanel.tsx`
- Create: `frontend/src/components/automations/EmailSettingsPanel.tsx`
- Modify: `frontend/src/components/automations/AutomationWorkspace.tsx`
- Test: `frontend/src/components/automations/AutomationWorkspace.test.tsx`

- [ ] **Step 1: Add UI test**

In `frontend/src/components/automations/AutomationWorkspace.test.tsx`, add:

```tsx
it('renders intelligent automation navigation areas', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(<AutomationWorkspace flows={[]} />))
  expect(container.innerHTML).toContain('Automacoes Inteligentes')
  expect(container.innerHTML).toContain('Automacoes')
  expect(container.innerHTML).toContain('Sequencias')
  expect(container.innerHTML).toContain('Templates')
  expect(container.innerHTML).toContain('Execucoes')
  expect(container.innerHTML).toContain('Configuracoes')
  act(() => root.unmount())
})
```

- [ ] **Step 2: Update workspace title and navigation**

Modify `AutomationWorkspace.tsx` header and add tab buttons:

```tsx
const sections = ['Automacoes', 'Sequencias', 'Templates', 'Execucoes', 'Configuracoes'] as const

<h1 className="text-2xl font-bold text-gray-900">Automacoes Inteligentes</h1>
<p className="text-sm text-gray-600">Fluxos, sequencias, templates, execucoes e emails do YUX Hub.</p>
<div className="flex flex-wrap gap-2 rounded-md border bg-white p-2">
  {sections.map(section => (
    <Button key={section} type="button" size="sm" variant="ghost">{section}</Button>
  ))}
</div>
```

- [ ] **Step 3: Add guided builder component**

Create `frontend/src/components/automations/AutomationGuidedBuilder.tsx`:

```tsx
export function AutomationGuidedBuilder() {
  return (
    <section className="rounded-md border bg-white p-4">
      <h2 className="font-semibold text-slate-950">Automacao guiada</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Step title="Quando" value="algo acontecer" />
        <Step title="Se" value="condicoes forem verdadeiras" />
        <Step title="Entao" value="executar acoes" />
      </div>
    </section>
  )
}

function Step({ title, value }: { title: string; value: string }) {
  return <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs uppercase text-slate-500">{title}</p><p className="text-sm font-medium text-slate-950">{value}</p></div>
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/components/automations/AutomationWorkspace.test.tsx
npm run type-check
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/automations
git commit -m "feat: add intelligent automation product shell"
```

---

## Task 6: Sector Templates And Sequences

**Files:**
- Create: `frontend/src/types/automationSequence.ts`
- Create: `frontend/src/lib/automations/sequenceRules.ts`
- Test: `frontend/src/lib/automations/sequenceRules.test.ts`
- Create: `frontend/src/services/automationSequenceService.ts`
- Create: `frontend/src/components/automations/SequencesWorkspace.tsx`
- Create: `supabase/migrations/20260604060000_automation_sequences.sql`
- Create: `supabase/migrations/20260604080000_automation_sector_templates.sql`

- [ ] **Step 1: Add sequence rule test**

Create `frontend/src/lib/automations/sequenceRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canEnrollInSequence, calculateSequenceConversionRate } from './sequenceRules'

describe('sequenceRules', () => {
  it('blocks enrollment when contact channel is missing', () => {
    expect(canEnrollInSequence({ channel: 'email', email: '', whatsappPhone: '+5511999999999', emailOptIn: true })).toEqual({ ok: false, reason: 'email_required' })
  })

  it('blocks email sequence without opt-in', () => {
    expect(canEnrollInSequence({ channel: 'email', email: 'ana@example.com', emailOptIn: false })).toEqual({ ok: false, reason: 'email_opt_in_required' })
  })

  it('calculates sequence conversion rate', () => {
    expect(calculateSequenceConversionRate({ enrolled: 20, converted: 5 })).toBe(25)
  })
})
```

- [ ] **Step 2: Add sequence types and rules**

Create `frontend/src/types/automationSequence.ts`:

```ts
export type AutomationSequenceChannel = 'email' | 'whatsapp' | 'mixed'
export type AutomationSequenceStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface SequenceEnrollmentEligibilityInput {
  channel: AutomationSequenceChannel
  email?: string
  whatsappPhone?: string
  emailOptIn?: boolean
  whatsappOptIn?: boolean
}
```

Create `frontend/src/lib/automations/sequenceRules.ts`:

```ts
import type { SequenceEnrollmentEligibilityInput } from '@/types/automationSequence'

export function canEnrollInSequence(input: SequenceEnrollmentEligibilityInput) {
  if ((input.channel === 'email' || input.channel === 'mixed') && !input.email) return { ok: false, reason: 'email_required' }
  if ((input.channel === 'email' || input.channel === 'mixed') && !input.emailOptIn) return { ok: false, reason: 'email_opt_in_required' }
  if ((input.channel === 'whatsapp' || input.channel === 'mixed') && !input.whatsappPhone) return { ok: false, reason: 'whatsapp_required' }
  if ((input.channel === 'whatsapp' || input.channel === 'mixed') && !input.whatsappOptIn) return { ok: false, reason: 'whatsapp_opt_in_required' }
  return { ok: true }
}

export function calculateSequenceConversionRate(input: { enrolled: number; converted: number }) {
  if (input.enrolled <= 0) return 0
  return Math.round((input.converted / input.enrolled) * 1000) / 10
}
```

- [ ] **Step 3: Add sequence migration**

Create `supabase/migrations/20260604060000_automation_sequences.sql` with:

```sql
ALTER TABLE public.crm_sequences
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('email', 'whatsapp', 'mixed')),
  ADD COLUMN IF NOT EXISTS sector_template_key TEXT,
  ADD COLUMN IF NOT EXISTS conversion_goal TEXT,
  ADD COLUMN IF NOT EXISTS active_enrollment_count INTEGER NOT NULL DEFAULT 0 CHECK (active_enrollment_count >= 0),
  ADD COLUMN IF NOT EXISTS converted_enrollment_count INTEGER NOT NULL DEFAULT 0 CHECK (converted_enrollment_count >= 0);

ALTER TABLE public.crm_sequence_steps
  ADD COLUMN IF NOT EXISTS step_kind TEXT NOT NULL DEFAULT 'message' CHECK (step_kind IN ('message', 'delay', 'task', 'ai', 'webhook')),
  ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IS NULL OR channel IN ('email', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Validate**

Run:

```bash
npm test -- src/lib/automations/sequenceRules.test.ts
npm run type-check
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/automationSequence.ts frontend/src/lib/automations/sequenceRules.ts frontend/src/lib/automations/sequenceRules.test.ts supabase/migrations/20260604060000_automation_sequences.sql
git commit -m "feat: add automation sequences foundation"
```

---

## Task 7: Docs And Final Validation

**Files:**
- Modify: `docs/implementation-status.md`
- Modify: `docs/crm-lead-management.md`
- Modify: `docs/superpowers/specs/2026-06-04-yux-intelligent-automations-smtp2go-design.md`
- Modify: `docs/superpowers/plans/2026-06-04-yux-intelligent-automations-smtp2go.md`

- [ ] **Step 1: Update implementation status**

Add a status row to `docs/implementation-status.md`:

```markdown
| Intelligent automations and SMTP2GO email hub | Planned | `/automations` | `docs/superpowers/specs/2026-06-04-yux-intelligent-automations-smtp2go-design.md`, `docs/superpowers/plans/2026-06-04-yux-intelligent-automations-smtp2go.md` | Replaces the previous external automation phase with native YUX automations and SMTP2GO as shared email infrastructure. |
```

- [ ] **Step 2: Update CRM lead management docs**

Add a short section:

```markdown
### Automacoes Inteligentes Nativas

O CRM passa a depender de automacoes nativas do YUX Hub. Fluxos e
sequencias podem reagir a eventos de CRM, WhatsApp, landing pages, propostas,
campanhas, financeiro, suporte e projetos. Emails de automacao devem usar a
camada SMTP2GO compartilhada com subcontas por cliente, limites e opt-out.
```

- [ ] **Step 3: Run full validation**

Run:

```bash
npm test
npm run type-check
npm run build
```

Expected: all pass. Known acceptable warnings: stale Browserslist/caniuse-lite and large chunks.

- [ ] **Step 4: Run Supabase validation**

Run:

```bash
supabase db reset --debug
```

Expected: migrations apply and probes can be run. If Docker is unavailable, record the exact Docker error as validation blocker.

- [ ] **Step 5: Commit**

```bash
git add docs/implementation-status.md docs/crm-lead-management.md docs/superpowers/specs/2026-06-04-yux-intelligent-automations-smtp2go-design.md docs/superpowers/plans/2026-06-04-yux-intelligent-automations-smtp2go.md
git commit -m "docs: plan intelligent automations smtp2go"
```

---

## Success Criteria

- The previous external automation phase docs are removed.
- New implementation is described as native YUX automations, not CRM-only phase 5.
- Flow Builder Lite evolves instead of being replaced.
- Automations have flows, sequences, templates, executions and settings.
- SMTP2GO is planned as the shared email layer for all modules.
- Client email sending uses SMTP2GO subaccounts and local limits.
- Marketing emails respect opt-in, suppressions and quotas.
- Transactional emails have separate policy from marketing emails.
- All provider credentials stay server-side.
- Every phase has testable frontend and database deliverables.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-04-yux-intelligent-automations-smtp2go.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
