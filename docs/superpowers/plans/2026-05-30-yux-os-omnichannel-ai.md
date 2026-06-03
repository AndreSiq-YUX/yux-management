# YUX OS Omnichannel AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete provider-neutral omnichannel service center for YUX and contracted clients, with internal supervision, client operation, configurable AI and handoff rules, CRM synchronization, knowledge publishing, cost traceability, an embeddable webchat, n8n integration contracts, and channel simulators.

**Architecture:** Preserve the commercial module key `whatsapp_ai` for package compatibility while replacing its placeholder surfaces with `/omnichannel` and `/portal/omnichannel`. Store every channel in one multitenant conversation model. Keep provider credentials outside the frontend and treat n8n as the invisible integration boundary for WhatsApp, Instagram, email, and scheduling. Use public-token Edge Function boundaries only for webchat and external adapter ingestion, authenticated Edge Functions for operational commands, private Postgres functions for privileged mutations, and RLS for every exposed table.

**Tech Stack:** PostgreSQL and RLS on Supabase, Supabase Storage, Supabase Edge Functions with Deno and `@supabase/supabase-js`, n8n webhooks, React 18, TypeScript, Vite, Vitest, Tailwind CSS, shadcn/ui, lucide-react.

---

### Task 1: Omnichannel domain rules and types

**Files:**
- Create: `frontend/src/types/omnichannel.ts`
- Create: `frontend/src/lib/omnichannel/omnichannelRules.ts`
- Create: `frontend/src/lib/omnichannel/omnichannelRules.test.ts`

- [x] **Step 1: Write failing pure-rule tests**

Cover:

- a stable idempotency key derived from connection, external event ID, and event type;
- `automatic`, `assisted`, and `manual` response-mode decisions;
- handoff rule matching with `all` and `any` combinators;
- ordered rule priority and the first matching outcome;
- conditions for human request, low confidence, critical keywords, qualified lead, purchase intent, scheduling intent, business hours, SLA threshold, sentiment, repeated contact, channel, tag, queue, and responsible user;
- queue selection by explicit queue, team, lead owner, available team member, fixed user, and supervisor fallback;
- CRM sync eligibility filters;
- retention deadline calculation using the organization setting and the 12-month default;
- attachment-retention deadlines using a separate setting;
- published-only knowledge eligibility;
- AI estimated cost from input and output token prices;
- allowed-origin matching for the webchat widget.

- [x] **Step 2: Run the focused test and confirm failure**

```bash
cd frontend
npm test -- src/lib/omnichannel/omnichannelRules.test.ts
```

Expected: fail because the omnichannel rule module does not exist.

- [x] **Step 3: Add domain types**

Define:

- channels: `whatsapp | instagram | email | webchat`;
- conversation statuses: `open | waiting_ai | waiting_human | assigned | resolved | archived`;
- message directions: `inbound | outbound`;
- message authors: `contact | ai | agent | system`;
- delivery statuses: `queued | processing | sent | delivered | read | failed`;
- response modes: `automatic | assisted | manual`;
- handoff conditions, combinators, outcomes, routing candidates, rule evaluations, CRM sync decisions, retention settings, knowledge publication states, widget settings, AI token usage, AI cost estimates, and the persisted domain entities used by the service.

Keep domain properties in camelCase. Keep database conversion inside the service layer.

- [x] **Step 4: Implement the minimal pure rules**

Add:

- `buildChannelEventIdempotencyKey(input)`;
- `decideResponseMode(mode, context)`;
- `matchesHandoffRule(rule, context)`;
- `selectHandoffOutcome(rules, context)`;
- `selectRoutingCandidate(outcome, candidates)`;
- `shouldSyncConversationToCrm(filters, context)`;
- `calculateRetentionDeadline(createdAt, months)`;
- `getKnowledgeEntriesForAi(entries)`;
- `estimateAiCost(usage, prices)`;
- `isAllowedWidgetOrigin(origin, allowedOrigins)`.

- [x] **Step 5: Run focused tests**

```bash
cd frontend
npm test -- src/lib/omnichannel/omnichannelRules.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add frontend/src/types/omnichannel.ts frontend/src/lib/omnichannel
git commit -m "feat: add omnichannel domain rules"
```

### Task 2: Omnichannel schema, storage, permissions, and RLS

**Files:**
- Create with Supabase CLI: migration returned by `supabase migration new omnichannel_ai_core`

- [x] **Step 1: Confirm current Supabase documentation and CLI commands**

Fetch `https://supabase.com/changelog.md`, scan relevant `breaking-change` entries, and verify current official documentation for RLS, Storage access control, Edge Function configuration, and secrets before implementing schema or deployment changes.

```bash
supabase --version
supabase migration new --help
supabase db push --help
supabase functions deploy --help
```

- [x] **Step 2: Generate the migration with the CLI**

```bash
supabase migration new omnichannel_ai_core
```

Use the generated migration path. If the linked database history requires the repository's synthetic ordering, rename only the CLI-generated file to the next available timestamp after `20260601180000`.

- [x] **Step 3: Add operation tables**

Create:

- `channel_connections`: organization, channel, name, active flag, provider-neutral adapter key, hashed inbound token, optional n8n routing metadata, last-event timestamp, timestamps;
- `omnichannel_contacts`: organization, display name, email, phone, external identities JSON, consent metadata, profile metadata, optional CRM lead, optional client, timestamps;
- `conversations`: organization, contact, connection, channel, status, response mode, optional queue, team, assigned user, optional CRM lead, subject, summary, classification, sentiment, commercial intent, scheduling intent, last-message date, SLA deadline, resolved date, timestamps;
- `messages`: conversation, direction, author type, optional author user, content type, body, external message ID, delivery status, metadata JSON, timestamps;
- `message_attachments`: message, storage path, filename, MIME type, byte size, retention deadline, timestamps;
- `conversation_tags`: conversation, tag, timestamp;
- `conversation_assignments`: conversation, optional queue, team, assigned user, source, reason, assigning user, timestamp;
- `omnichannel_teams`: organization, name, availability mode, active flag, timestamps;
- `omnichannel_team_members`: team, user, availability flag, priority, timestamps;
- `conversation_queues`: organization, optional team, name, strategy, SLA settings JSON, active flag, timestamps.

Use checks for enum-like text fields, non-negative sizes, unique external identities where appropriate, and uniqueness for `(connection_id, external_message_id)` when an external message ID exists.

- [x] **Step 4: Add automation and audit tables**

Create:

- `handoff_rules`: organization, name, enabled flag, priority, combinator, conditions JSON, outcome JSON, timestamps;
- `handoff_events`: conversation, optional rule, trigger, matched conditions JSON, previous assignment JSON, next assignment JSON, outcome JSON, immutable timestamp;
- `channel_webhook_events`: connection, external event ID, event type, idempotency key, sanitized payload JSON, status, protected error text, received and processed dates;
- `outbound_message_runs`: message, attempt number, adapter key, status, sanitized request JSON, sanitized response JSON, protected error text, timestamps;
- `scheduling_requests`: conversation, contact, optional CRM lead, requested slot JSON, status, optional external reference, n8n metadata JSON, timestamps;
- `ai_message_runs`: conversation, optional inbound and outbound message, logical provider, model, status, input tokens, output tokens, estimated cost, latency, fallback flag, protected error text, metadata JSON, timestamps.
- `crm_sync_runs`: conversation, optional CRM lead, status, sanitized metadata JSON, protected error text, timestamps.

Keep handoff events immutable. Store sanitized payloads only. Never store raw channel credentials.

- [x] **Step 5: Add knowledge, settings, and widget tables**

Create:

- `knowledge_sources`: organization, source type, name, optional URL, optional storage path, retention deadline, status, timestamps;
- `knowledge_entries`: organization, source, title, body, status, optional reviewer, timestamps;
- `knowledge_publications`: organization, entry, immutable body snapshot, publisher, published timestamp;
- `omnichannel_settings`: one row per organization with default response mode, retention months, attachment-retention months, anonymization flag, CRM sync filters JSON, business hours JSON, AI logical provider, AI model, token prices, timestamps;
- `webchat_widgets`: organization, name, hashed public token, active flag, allowed origins, branding JSON, consent text, initial-form JSON, timestamps.
- `webchat_sessions`: widget, hashed short-lived session token, validated origin, optional contact, optional conversation, expiration, revocation, last-seen timestamp, timestamps.

- [x] **Step 6: Add indexes, triggers, storage bucket, and retention metadata**

Index:

- inbox filters by organization, status, channel, queue, team, assigned user, SLA deadline, and last-message date;
- messages by conversation and creation date;
- external identities and webhook idempotency keys;
- outbound runs and AI runs by conversation and creation date;
- knowledge entries by organization and status;
- widget and short-lived webchat session token hashes.

Reuse `public.update_updated_at_column()` for mutable rows. Create the private `omnichannel-attachments` Storage bucket and scoped policies. Store deadlines now; cleanup and anonymization jobs remain a later operational task.

- [x] **Step 7: Add private authorization helpers**

Create functions under `private`, with fixed `search_path`, for:

- internal cross-organization omnichannel supervision;
- client membership plus active contract with enabled `whatsapp_ai` module;
- required `omnichannel.read`, `omnichannel.write`, `omnichannel.supervise`, and `omnichannel.configure` permission checks;
- conversation, message, knowledge, queue, team, and widget access;
- widget hashed-token lookup, allowed-origin verification, and short-lived session verification.

Revoke `PUBLIC` execution. Grant only the operations needed by `authenticated` and `service_role`.

- [x] **Step 8: Add RLS and explicit grants**

Enable RLS on every new public table.

Policies:

- YUX internal users supervise organizations according to omnichannel permissions;
- client users read and operate only their own contracted organization's data;
- client users never read protected errors, token hashes, provider metadata, or internal-only AI cost fields;
- portal configurators manage rules, teams, queues, knowledge drafts, widget settings, and organization settings only when allowed;
- `anon` receives no direct table grant;
- public widget access goes through an Edge Function boundary only.

- [x] **Step 9: Seed permissions and route metadata**

Insert permissions:

- `omnichannel.read`;
- `omnichannel.write`;
- `omnichannel.supervise`;
- `omnichannel.configure`.

Grant:

- `yux_admin`: all four;
- `yux_manager`: all four;
- `yux_member`: read and write;
- `client_admin`: read, write, configure;
- `client_member`: read and write.

Update `platform_modules.key = 'whatsapp_ai'` to name `Central Omnichannel IA`, internal route `/omnichannel`, portal route `/portal/omnichannel`, and required permission `omnichannel.read`.

- [x] **Step 10: Add SQL probes before remote application**

Validate with local SQL review and, once applied remotely, direct probes for:

- RLS enabled on every public table;
- no raw inbound or widget token stored;
- client organization isolation;
- inactive or missing `whatsapp_ai` contract module denying portal access;
- immutable handoff events and knowledge publications;
- widget token revocation, session expiration, and origin checks;
- protected error and cost metadata inaccessible to portal users.

Probe file: `supabase/probes/20260601190000_omnichannel_ai_core.sql`

- [x] **Step 11: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add omnichannel schema and permissions"
```

### Task 3: Typed omnichannel service

**Files:**
- Create: `frontend/src/services/omnichannelService.ts`
- Create: `frontend/src/services/omnichannelService.test.ts`

- [x] **Step 1: Write failing mapping tests**

Cover:

- conversation list rows with contact, connection, queue, team, and assigned-user summaries;
- message rows with attachments;
- numeric AI cost and token values returned as strings or numbers;
- protected internal fields omitted from portal mapper results;
- filter builders excluding empty values;
- knowledge publication snapshots detached from later draft edits.

- [x] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npm test -- src/services/omnichannelService.test.ts
```

Expected: fail because the service does not exist.

- [x] **Step 3: Implement mappers and reads**

Following `crmService.ts` and `proposalService.ts`, add reads for:

- internal filtered inbox;
- portal inbox;
- conversation detail and timeline;
- messages and attachments;
- teams, members, queues, rules, settings, widget configuration;
- knowledge sources, entries, and publication history;
- AI cost and latency summaries for internal metrics;
- sanitized portal metrics;
- webhook event and outbound retry logs for internal supervisors.

- [x] **Step 4: Implement authenticated mutations**

Add:

- send human reply;
- approve assisted AI suggestion;
- assign, reassign, resolve, reopen, and hand off conversation;
- create and edit teams, queues, rules, settings, and widget configuration;
- create knowledge source, create or edit entry, submit for review, publish;
- invoke channel simulator;
- invoke outbound retry;
- request scheduling through n8n.

Use `supabase.functions.invoke()` for Edge Function commands. Do not expose service keys or raw adapter tokens.

- [x] **Step 5: Run focused tests and type checking**

```bash
cd frontend
npm test -- src/services/omnichannelService.test.ts
npm run type-check
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add frontend/src/services/omnichannelService.ts frontend/src/services/omnichannelService.test.ts
git commit -m "feat: add typed omnichannel service"
```

### Task 4: Shared Edge Function contracts

**Files:**
- Create: `supabase/functions/_shared/omnichannel.ts`
- Create: `supabase/functions/_shared/omnichannel.test.ts`
- Update: `supabase/functions/_shared/edge.ts`

- [x] **Step 1: Write failing Deno tests**

Cover:

- inbound event parsing for WhatsApp, Instagram, email, and webchat normalized payloads;
- idempotency key generation;
- outbound adapter payload construction;
- protected error sanitization;
- deterministic token hashing;
- webchat event validation;
- AI-run cost calculation;
- CRM sync payload construction.

- [x] **Step 2: Run focused Deno tests and confirm failure**

```bash
deno test supabase/functions/_shared/omnichannel.test.ts
```

Expected: fail because the shared module does not exist.

- [x] **Step 3: Implement provider-neutral contracts**

Add:

- normalized inbound event and outbound request types;
- validators for supported channel events;
- deterministic idempotency and token-hash helpers;
- safe webhook metadata sanitizer;
- n8n payload builders;
- AI-run cost calculator;
- widget origin validator;
- CRM sync payload builder.

Keep provider-specific credentials and signatures outside this repository until real adapters are selected.

- [x] **Step 4: Extend shared Edge helpers**

Add shared helpers for:

- required authenticated user validation;
- service-role client reuse;
- constant-time adapter-token comparison after hashing;
- timeout-wrapped n8n webhook calls;
- safe protected-error formatting.

- [x] **Step 5: Run focused Deno tests**

```bash
deno test supabase/functions/_shared/omnichannel.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add supabase/functions/_shared
git commit -m "feat: add omnichannel edge contracts"
```

### Task 5: Inbound ingestion, simulator, and transactional CRM sync

**Files:**
- Create with Supabase CLI: migration returned by `supabase migration new omnichannel_crm_sync`
- Create: `supabase/functions/receive-channel-event/deno.json`
- Create: `supabase/functions/receive-channel-event/index.ts`
- Create: `supabase/functions/simulate-channel-event/deno.json`
- Create: `supabase/functions/simulate-channel-event/index.ts`

- [x] **Step 1: Generate the CRM-sync migration**

```bash
supabase migration new omnichannel_crm_sync
```

- [x] **Step 2: Add private transactional CRM synchronization**

Create `private.sync_omnichannel_crm(...)` and a service-role-only wrapper. The function must:

- acquire the conversation row for update;
- filter irrelevant conversations using organization CRM settings;
- find or create a contact and match a lead by organization plus normalized email or phone;
- create a lead in the organization's default pipeline when configured and no match exists;
- link contact, conversation, and lead idempotently;
- update source, summary, qualification score, tags, responsible user, next follow-up, scheduling request, and CRM interaction history without duplicating records;
- return a sanitized synchronization result.

- [x] **Step 3: Implement `receive-channel-event`**

Configure as a custom-token public boundary. It must:

- accept a normalized provider-neutral event;
- locate an active `channel_connections` adapter token by hash;
- reject missing, inactive, or mismatched connections;
- record `channel_webhook_events` before processing;
- return success without duplicate writes for a repeated idempotency key;
- upsert the omnichannel contact identity;
- find or open the conversation;
- append inbound message and attachment metadata;
- update SLA and last-message timestamps;
- invoke private CRM synchronization;
- evaluate handoff rules and record immutable handoff events;
- enqueue AI processing only when the selected mode allows it;
- mark the webhook event completed or failed.

- [x] **Step 4: Implement authenticated `simulate-channel-event`**

Allow internal supervisors and contracted portal configurators to submit realistic sanitized inbound payloads for each supported channel. Reuse the same normalized processing contract without requiring live credentials.

- [x] **Step 5: Add function configuration**

In `supabase/config.toml`, set:

- `receive-channel-event`: `verify_jwt = false`;
- `simulate-channel-event`: authenticated JWT verification.

- [x] **Step 6: Run SQL probes and Deno checks**

Verify:

- duplicate external events create one message only;
- irrelevant CRM sync filters do not create a lead;
- relevant first contact creates or links one lead;
- repeated messages update the same lead;
- handoff events are recorded for matching rules;
- simulator requests cannot cross organization boundaries.

```bash
deno check supabase/functions/receive-channel-event/index.ts
deno check supabase/functions/simulate-channel-event/index.ts
```

Probe file: `supabase/probes/20260601200000_omnichannel_crm_sync.sql`

- [x] **Step 7: Commit**

```bash
git add supabase/migrations supabase/functions supabase/config.toml
git commit -m "feat: ingest omnichannel events and sync crm"
```

### Task 6: AI processing and outbound delivery boundaries

**Files:**
- Create: `supabase/functions/process-ai-message/deno.json`
- Create: `supabase/functions/process-ai-message/index.ts`
- Create: `supabase/functions/dispatch-outbound-message/deno.json`
- Create: `supabase/functions/dispatch-outbound-message/index.ts`
- Create: `supabase/functions/retry-outbound-message/deno.json`
- Create: `supabase/functions/retry-outbound-message/index.ts`
- Create: `supabase/functions/request-scheduling/deno.json`
- Create: `supabase/functions/request-scheduling/index.ts`

- [x] **Step 1: Write failing helper tests**

Extend `supabase/functions/_shared/omnichannel.test.ts` for:

- automatic mode creating a queued outbound AI reply;
- assisted mode creating a suggestion without dispatch;
- manual mode skipping AI generation;
- knowledge context including published entries only;
- n8n generation failure recording fallback metadata;
- retry incrementing attempt numbers without duplicating messages.
- scheduling requests calling n8n only when configured and preserving a pending provider-neutral record otherwise.

- [x] **Step 2: Run focused test and confirm failure**

```bash
deno test supabase/functions/_shared/omnichannel.test.ts
```

- [x] **Step 3: Implement `process-ai-message`**

Require authenticated operational access or a service-role invocation. It must:

- load conversation, published knowledge snapshots, CRM summary, settings, and recent messages;
- call `N8N_OMNICHANNEL_AI_WEBHOOK_URL` with a timeout when configured;
- record provider-neutral logical provider, model, token usage, estimated cost, latency, fallback, and sanitized metadata;
- use a safe fallback response when the webhook is absent or unavailable;
- create a suggestion in assisted mode;
- create and dispatch an outbound message in automatic mode;
- leave manual mode unchanged;
- evaluate post-generation handoff conditions such as low confidence.

- [x] **Step 4: Implement `dispatch-outbound-message`**

Require authenticated access or service role. It must:

- validate message ownership and direction;
- create the next `outbound_message_runs` attempt;
- dispatch webchat messages internally;
- call `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL` for WhatsApp, Instagram, and email with timeout;
- record sanitized success or protected failure details;
- update delivery status idempotently;
- allow individual agent messages and transactional automation only, never bulk campaigns.

- [x] **Step 5: Implement `retry-outbound-message`**

Require authenticated write access. Retry only failed outbound messages and reuse the dispatcher contract.

- [x] **Step 6: Implement `request-scheduling`**

Require authenticated write access. Create a provider-neutral `scheduling_requests` row, call `N8N_OMNICHANNEL_SCHEDULING_WEBHOOK_URL` with timeout when configured, store only sanitized n8n metadata, and preserve a pending request for later dispatch when the integration is absent.

- [x] **Step 7: Add function configuration and checks**

Add authenticated function entries to `supabase/config.toml`.

```bash
deno test supabase/functions/_shared/omnichannel.test.ts
deno check supabase/functions/process-ai-message/index.ts
deno check supabase/functions/dispatch-outbound-message/index.ts
deno check supabase/functions/retry-outbound-message/index.ts
deno check supabase/functions/request-scheduling/index.ts
```

Expected: pass.

- [x] **Step 8: Commit**

```bash
git add supabase/functions supabase/config.toml
git commit -m "feat: process ai replies and dispatch messages"
```

### Task 7: Internal omnichannel inbox workspace

**Files:**
- Create: `frontend/src/pages/omnichannel/OmnichannelPage.tsx`
- Create: `frontend/src/components/omnichannel/OmnichannelWorkspace.tsx`
- Create: `frontend/src/components/omnichannel/ConversationList.tsx`
- Create: `frontend/src/components/omnichannel/ConversationDetails.tsx`
- Create: `frontend/src/components/omnichannel/ConversationComposer.tsx`
- Create: `frontend/src/components/omnichannel/ChannelSimulator.tsx`
- Create: `frontend/src/components/omnichannel/OmnichannelWorkspace.test.tsx`
- Update: `frontend/src/App.tsx`
- Update: `frontend/src/lib/platform/moduleRegistry.ts`
- Update: `frontend/src/lib/platform/navigation.test.ts`
- Update: `frontend/src/types/platform.ts`

- [ ] **Step 1: Write failing navigation and workspace tests**

Cover:

- `whatsapp_ai` displaying as `Central Omnichannel IA`;
- internal module route `/omnichannel`;
- filter controls for organization, channel, queue, team, user, status, SLA, tag, and handoff;
- conversation selection rendering timeline, attachments, AI summary, classification, confidence, cost, latency, CRM link, and assignment;
- agent reply, assisted-response approval, assign, reassign, handoff, resolve, reopen, retry, and mode-change commands;
- simulator channel selector and event submission.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/components/omnichannel/OmnichannelWorkspace.test.tsx
```

- [ ] **Step 3: Update platform metadata**

Add omnichannel permission keys to `PermissionKey`. Preserve the module key `whatsapp_ai`, rename the label, and route it to `/omnichannel` internally and `/portal/omnichannel` in the portal.

- [ ] **Step 4: Implement the internal workspace**

Build a dense operational layout:

- left filterable conversation list;
- central chronological timeline and composer;
- right context panel for CRM, assignment, AI trace, tags, and SLA;
- compact action toolbar with lucide icons and tooltips;
- simulator panel accessible from the workspace.

Avoid nested cards. Keep list dimensions stable and responsive.

- [ ] **Step 5: Wire the internal route**

Replace the internal placeholder route with `<OmnichannelPage />`.

- [ ] **Step 6: Run focused tests and type checking**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/components/omnichannel/OmnichannelWorkspace.test.tsx
npm run type-check
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: add internal omnichannel inbox"
```

### Task 8: Portal omnichannel inbox and sanitized metrics

**Files:**
- Create: `frontend/src/pages/client-portal/PortalOmnichannelPage.tsx`
- Create: `frontend/src/components/omnichannel/PortalOmnichannelWorkspace.tsx`
- Create: `frontend/src/components/omnichannel/PortalOmnichannelWorkspace.test.tsx`
- Update: `frontend/src/App.tsx`
- Update: `frontend/src/lib/platform/navigation.test.ts`

- [ ] **Step 1: Write failing portal tests**

Cover:

- contracted client route `/portal/omnichannel`;
- module hidden when `whatsapp_ai` is disabled by contract;
- own-organization inbox and conversation operation;
- allowed assignment, queue, and mode controls;
- sanitized metrics for volume, SLA, handoff, and channel mix;
- no cross-organization filter;
- no protected webhook error, raw adapter metadata, internal-only note, or internal AI cost margin.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/components/omnichannel/PortalOmnichannelWorkspace.test.tsx
```

- [ ] **Step 3: Implement portal page and workspace**

Reuse shared inbox primitives with a portal capability profile. Keep the client surface focused on:

- own inbox;
- conversation timeline;
- reply, assignment, queue, resolve, reopen, and manual handoff;
- configurable response mode when permission allows;
- sanitized metrics;
- onboarding simulator access for portal configurators.

- [ ] **Step 4: Wire the portal route**

Replace the portal placeholder route with `<PortalOmnichannelPage />`.

- [ ] **Step 5: Run focused tests and type checking**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/components/omnichannel/PortalOmnichannelWorkspace.test.tsx
npm run type-check
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: add portal omnichannel inbox"
```

### Task 9: Teams, queues, handoff rules, knowledge, widget settings, and metrics

**Files:**
- Create: `frontend/src/components/omnichannel/OmnichannelAdminTabs.tsx`
- Create: `frontend/src/components/omnichannel/TeamQueueManager.tsx`
- Create: `frontend/src/components/omnichannel/HandoffRuleManager.tsx`
- Create: `frontend/src/components/omnichannel/KnowledgeManager.tsx`
- Create: `frontend/src/components/omnichannel/WidgetSettingsPanel.tsx`
- Create: `frontend/src/components/omnichannel/OmnichannelMetricsPanel.tsx`
- Create: `frontend/src/components/omnichannel/OmnichannelAdminTabs.test.tsx`
- Update: `frontend/src/components/omnichannel/OmnichannelWorkspace.tsx`
- Update: `frontend/src/components/omnichannel/PortalOmnichannelWorkspace.tsx`

- [ ] **Step 1: Write failing administration tests**

Cover:

- team membership and availability editing;
- queue strategy selection;
- handoff-rule condition and outcome editing with priority;
- organization response mode, business hours, retention, attachment retention, anonymization, CRM filters, logical AI provider, model, and token price editing;
- knowledge draft, review, publish, and immutable publication history;
- widget branding, consent, initial form, allowed origins, activation, token regeneration, and embed snippet;
- internal metrics including AI cost and latency;
- portal metrics excluding internal-only values.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npm test -- src/components/omnichannel/OmnichannelAdminTabs.test.tsx
```

- [ ] **Step 3: Implement compact administration tabs**

Add tabs:

- Inbox;
- Equipes e filas;
- Regras de handoff;
- Base de conhecimento;
- Webchat;
- Metricas;
- Logs e simulador for internal supervisors only.

Use tables, compact panels, switches, select inputs, and explicit save actions. Do not expose provider credentials.

- [ ] **Step 4: Run focused tests and type checking**

```bash
cd frontend
npm test -- src/components/omnichannel/OmnichannelAdminTabs.test.tsx
npm run type-check
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/omnichannel
git commit -m "feat: configure omnichannel operations"
```

### Task 10: Embeddable webchat boundary and widget

**Files:**
- Create: `supabase/functions/submit-webchat-event/deno.json`
- Create: `supabase/functions/submit-webchat-event/index.ts`
- Create: `frontend/public/yux-webchat.js`
- Create: `frontend/src/pages/webchat/WebchatWidgetPage.tsx`
- Create: `frontend/src/components/webchat/WebchatWidget.tsx`
- Create: `frontend/src/components/webchat/WebchatWidget.test.tsx`
- Update: `frontend/src/App.tsx`
- Update: `supabase/config.toml`

- [ ] **Step 1: Write failing widget tests**

Cover:

- revocable public widget token bootstrapping an active widget;
- host-page script sending the browser `Origin` to the public bootstrap boundary;
- denied host origin;
- short-lived session token binding subsequent iframe actions to one widget and validated origin;
- consent requirement;
- configurable initial form;
- start or resume conversation;
- send and receive timeline;
- attachment signed-upload request;
- human-transfer request;
- inactive or revoked widget returning a neutral not-found state.

- [ ] **Step 2: Run focused widget tests and confirm failure**

```bash
cd frontend
npm test -- src/components/webchat/WebchatWidget.test.tsx
```

- [ ] **Step 3: Implement `submit-webchat-event`**

Configure `verify_jwt = false`. Accept actions:

- `bootstrap_widget`;
- `load_session`;
- `start_conversation`;
- `resume_conversation`;
- `send_message`;
- `request_attachment_upload`;
- `request_human`;
- `poll_messages`.

For every action:

- hash and resolve the public widget token for bootstrap only;
- verify active status and the host browser `Origin`;
- issue a hashed, short-lived `webchat_sessions` token bound to the validated origin and widget;
- require the short-lived session token for every action after bootstrap;
- bind the request to exactly one organization;
- reuse normalized ingestion and dispatch contracts;
- generate Storage signed-upload URLs only for safe generated object paths;
- return sanitized data only.

- [ ] **Step 4: Implement the host-page loader and widget page**

Add `frontend/public/yux-webchat.js`. The generated snippet loads this script with the public widget token. The script calls `bootstrap_widget` from the host page, relies on the browser `Origin`, and injects an iframe only after receiving a short-lived session token.

Add public route `/webchat/session/:sessionToken`. Render:

- organization branding;
- consent step;
- initial form;
- conversation timeline;
- composer and attachment control;
- human-transfer action;
- polling for updates.

The iframe uses the short-lived session token. Never place the long-lived widget token in the iframe URL. If the repository ignore rules omit `frontend/public`, stage `frontend/public/yux-webchat.js` explicitly with `git add -f`.

- [ ] **Step 5: Run focused tests and checks**

```bash
cd frontend
npm test -- src/components/webchat/WebchatWidget.test.tsx
npm run type-check
cd ..
deno check supabase/functions/submit-webchat-event/index.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src supabase/functions supabase/config.toml
git commit -m "feat: add embeddable webchat widget"
```

### Task 11: Remote Supabase application and Edge Function deployment

**Files:**
- Update only if needed: generated migrations and `supabase/config.toml`

- [ ] **Step 1: Verify local migration and function state**

```bash
git status --short
supabase migration list
supabase functions list
```

- [ ] **Step 2: Apply migrations to the linked Supabase project**

Read the database password from `controle.txt` without echoing it. Apply:

```bash
supabase db push
```

- [ ] **Step 3: Deploy Edge Functions**

Deploy:

```bash
supabase functions deploy receive-channel-event --no-verify-jwt
supabase functions deploy simulate-channel-event
supabase functions deploy process-ai-message
supabase functions deploy dispatch-outbound-message
supabase functions deploy retry-outbound-message
supabase functions deploy request-scheduling
supabase functions deploy submit-webchat-event --no-verify-jwt
```

- [ ] **Step 4: Configure non-secret fallback behavior and document n8n secrets**

The system must remain testable through simulators without n8n. Document the optional deployment secrets:

- `N8N_OMNICHANNEL_AI_WEBHOOK_URL`;
- `N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL`;
- `N8N_OMNICHANNEL_SCHEDULING_WEBHOOK_URL`.

Do not commit secret values. Do not require real WhatsApp, Instagram, or email credentials.

- [ ] **Step 5: Run remote probes**

Verify:

- all omnichannel migrations appear in remote history;
- new Edge Functions are active with intended JWT settings;
- internal authenticated access works;
- portal access requires active `whatsapp_ai` module and permission;
- invalid external adapter tokens and invalid widget tokens fail neutrally;
- denied widget origins and expired webchat sessions fail neutrally;
- simulator creates one conversation and one inbound message;
- repeating the same simulated event does not duplicate the message;
- automatic, assisted, and manual modes behave differently;
- handoff creates an immutable event and assignment;
- CRM link is created or reused idempotently;
- published knowledge is available while drafts are excluded;
- outbound retry increments attempt count;
- protected internal metadata remains inaccessible to portal users.

- [ ] **Step 6: Commit remote-only corrections if necessary**

```bash
git add supabase
git commit -m "fix: align omnichannel supabase deployment"
```

Skip this commit when no correction is needed.

### Task 12: Final verification and operational documentation

**Files:**
- Create: `docs/omnichannel-ai-operations.md`

- [ ] **Step 1: Document operational boundaries**

Describe:

- module contract behavior under key `whatsapp_ai`;
- internal and portal routes;
- response modes;
- simulator workflow for WhatsApp, Instagram, email, and webchat;
- optional n8n webhook contracts;
- adapter and widget token rotation;
- knowledge publishing workflow;
- CRM synchronization rules;
- retention metadata and the future cleanup-job requirement;
- provider credentials intentionally excluded from frontend and repository;
- real adapter onboarding checklist for a later provider-selection task.

- [ ] **Step 2: Run frontend verification**

```bash
cd frontend
npm test
npm run type-check
npm run build
```

Expected: pass.

- [ ] **Step 3: Run Edge verification**

```bash
deno test supabase/functions/_shared
deno check supabase/functions/receive-channel-event/index.ts
deno check supabase/functions/simulate-channel-event/index.ts
deno check supabase/functions/process-ai-message/index.ts
deno check supabase/functions/dispatch-outbound-message/index.ts
deno check supabase/functions/retry-outbound-message/index.ts
deno check supabase/functions/request-scheduling/index.ts
deno check supabase/functions/submit-webchat-event/index.ts
```

Expected: pass.

- [ ] **Step 4: Run repository checks**

```bash
git diff --check
git status --short
```

- [ ] **Step 5: Start the frontend and perform focused browser verification**

Open:

- `/omnichannel`;
- `/portal/omnichannel`;
- `/webchat/session/:sessionToken` through the generated host-page script.

Verify desktop and mobile layouts, no console errors, stable inbox columns, simulator flow, client isolation, widget consent and message flow, manual handoff, assisted suggestion approval, and outbound retry.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/omnichannel-ai-operations.md
git commit -m "docs: document omnichannel operations"
```
