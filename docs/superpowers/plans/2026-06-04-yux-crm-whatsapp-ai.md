# YUX CRM WhatsApp AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect CRM leads to omnichannel conversations and AI assistance as specified in `docs/superpowers/specs/2026-06-04-yux-crm-whatsapp-ai-design.md`.

**Architecture:** Reuse existing omnichannel tables and services, adding lead-conversation links, AI insight records, SLA events and response suggestions. Keep provider sending behind existing Edge Function/provider boundaries; the CRM UI only requests approved sends or creates drafts.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres, Supabase Edge Functions, provider-neutral omnichannel services.

---

## File Structure

- Create: `frontend/src/types/crmAi.ts`
- Create: `frontend/src/lib/crm/conversationRules.ts`
- Create: `frontend/src/lib/crm/conversationRules.test.ts`
- Create: `frontend/src/services/crmConversationService.ts`
- Create: `frontend/src/services/crmConversationService.test.ts`
- Create: `frontend/src/components/crm/LeadConversationPanel.tsx`
- Create: `frontend/src/components/crm/LeadAiInsightPanel.tsx`
- Create: `frontend/src/components/crm/LeadResponseComposer.tsx`
- Create: `frontend/src/components/crm/ConversationSlaBadge.tsx`
- Modify: `frontend/src/components/crm/Lead360Panel.tsx`
- Modify: `frontend/src/components/crm/TodayWorkQueue.tsx`
- Create: `supabase/migrations/20260604020000_crm_whatsapp_ai.sql`
- Create: `supabase/probes/20260604020000_crm_whatsapp_ai.sql`
- Modify: `supabase/functions/process-ai-message/index.ts`
- Modify: `docs/crm-lead-management.md`

## Tasks

### Task 1: Conversation And AI Rules

- [ ] Add types for `LeadConversationLink`, `LeadAiInsight`, `LeadAiFieldSuggestion`, `LeadResponseSuggestion`, `LeadSlaEvent`, `LeadHandoffLock`, `CrmQuickReply`, `CrmMessageTemplate`.
- [ ] Implement pure rules: `normalizePhoneForLeadMatch`, `scoreConversationLeadMatch`, `shouldCreateLeadFromConversation`, `shouldPauseAutomationForHuman`, `isSlaBreached`, `canSendTemplate`, `buildAiFieldPatch`.
- [ ] Tests must cover duplicate match by phone, unsafe cross-instance match, SLA breach, opt-out send block, handoff automation pause and AI field patch confirmation.
- [ ] Run `npm test -- src/lib/crm/conversationRules.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/types/crmAi.ts frontend/src/lib/crm/conversationRules.ts frontend/src/lib/crm/conversationRules.test.ts && git commit -m "feat: add crm conversation ai rules"`.

### Task 2: Schema And Probe

- [ ] Create migration `supabase/migrations/20260604020000_crm_whatsapp_ai.sql`.
- [ ] Add tables: `lead_conversation_links`, `lead_ai_insights`, `lead_ai_field_suggestions`, `lead_response_suggestions`, `lead_sla_events`, `lead_handoff_locks`, `crm_quick_replies`, `crm_message_templates`.
- [ ] Extend `leads` with `ai_summary`, `intent`, `sentiment`, `urgency_detected_at`, `last_conversation_at`.
- [ ] Add optional `lead_id` to `conversations` if not already present, with FK to `leads`.
- [ ] Add RLS scoped by `crm_instance_id` and existing omnichannel access helpers.
- [ ] Grant authenticated Data API access for new tables.
- [ ] Create probe checking tables, grants, RLS and `conversations.lead_id`.
- [ ] Run Supabase reset/probe when Docker is available.
- [ ] Commit: `git add supabase/migrations/20260604020000_crm_whatsapp_ai.sql supabase/probes/20260604020000_crm_whatsapp_ai.sql && git commit -m "feat: add crm whatsapp ai schema"`.

### Task 3: CRM Conversation Service

- [ ] Implement `crmConversationService` with `findLeadMatchesForConversation`, `linkConversationToLead`, `createLeadFromConversation`, `getLeadConversations`, `getLeadAiInsights`, `confirmAiFieldSuggestion`, `createResponseSuggestion`, `sendSuggestedReply`, `startHumanHandoff`, `releaseHumanHandoff`.
- [ ] Add service tests for payloads and mapping.
- [ ] Preserve provider-neutral behavior: service records intent and calls existing omnichannel send functions only through safe service boundaries.
- [ ] Run `npm test -- src/services/crmConversationService.test.ts`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/services/crmConversationService.ts frontend/src/services/crmConversationService.test.ts && git commit -m "feat: add crm conversation service"`.

### Task 4: CRM UI Integration

- [ ] Add `LeadConversationPanel.tsx` with conversation list and selected thread preview.
- [ ] Add `LeadAiInsightPanel.tsx` with summary, intent, urgency, sentiment, objections and risk.
- [ ] Add `LeadResponseComposer.tsx` with suggested response, quick replies, templates and opt-out warning.
- [ ] Add `ConversationSlaBadge.tsx` for first-response and last-response state.
- [ ] Integrate these panels into `Lead360Panel.tsx`.
- [ ] Add unresolved conversations and SLA breaches to `TodayWorkQueue.tsx`.
- [ ] Add tests using `createRoot` for panels and workspace states.
- [ ] Run `npm test -- src/components/crm`.
- [ ] Run `npm run type-check`.
- [ ] Commit: `git add frontend/src/components/crm && git commit -m "feat: add crm whatsapp ai panels"`.

### Task 5: AI Processing And Documentation

- [ ] Update `supabase/functions/process-ai-message/index.ts` to store CRM AI insight metadata when a conversation is linked to a lead.
- [ ] Add shared helper tests for the AI metadata payload if the function uses `_shared`.
- [ ] Update `docs/crm-lead-management.md` and `docs/implementation-status.md`.
- [ ] Run `npm test`, `npm run type-check`, `npm run build`, and relevant `deno test supabase/functions/_shared`.
- [ ] Commit: `git add supabase/functions/process-ai-message docs/crm-lead-management.md docs/implementation-status.md && git commit -m "feat: connect crm ai insights to omnichannel"`.

## Success Criteria

- Conversations can create or link leads safely.
- Lead detail shows conversations, summary, AI insight and response suggestions.
- Human handoff pauses automation.
- SLA alerts appear in Today.
- CRM remains provider-neutral and tests pass.
