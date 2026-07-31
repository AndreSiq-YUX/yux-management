# YUX OS Commercial Proposals And Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete commercial proposal workflow from CRM diagnostic through AI-assisted editable drafts, immutable sends, prospect or client decisions, and automatic idempotent conversion into client, contract, and project records.

**Architecture:** Add a proposal vertical slice on top of the existing multitenant CRM, package, contract, project, and portal foundations. Keep mutable drafts and immutable sent versions separate. Use RLS for authenticated reads and writes, hashed expiring tokens for public review, protected Supabase Edge Functions for provider-neutral AI generation and secure send or public-decision boundaries, and an unexposed transactional Postgres function for conversion.

**Tech Stack:** PostgreSQL and RLS on Supabase, Supabase Edge Functions with Deno and `@supabase/supabase-js`, React 18, TypeScript, Vite, Vitest, Tailwind CSS, shadcn/ui, lucide-react.

---

### Task 1: Proposal domain rules and types

**Files:**
- Create: `frontend/src/types/proposal.ts`
- Create: `frontend/src/lib/proposals/proposalRules.ts`
- Create: `frontend/src/lib/proposals/proposalRules.test.ts`

- [ ] **Step 1: Write failing rule tests**

Cover:

- values inside minimum and maximum price limits;
- values outside a configured range requiring a trimmed override reason;
- additional-item range validation;
- total calculation from editable items;
- decision eligibility only for the current pending sent version;
- adjustment requests requiring a trimmed comment;
- rejection comments remaining optional;
- blueprint project presets winning over package presets;
- package presets acting as fallback;
- immutable sent snapshots remaining detached from later draft edits.

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
cd frontend
npm test -- src/lib/proposals/proposalRules.test.ts
```

Expected: fail because `proposalRules.ts` does not exist.

- [ ] **Step 3: Add proposal domain types**

Define:

- `ProposalStatus`: `draft | sent | adjustments_requested | approved | rejected | conversion_failed | converted`;
- `ProposalVersionStatus`: `pending | approved | rejected | adjustments_requested | superseded`;
- `ProposalDecisionValue`: `approved | rejected | adjustments_requested`;
- `ProposalDecisionSource`: `public_token | portal`;
- `AiGenerationStatus`: `completed | fallback | failed`;
- `ProposalConversionStatus`: `completed | failed`;
- `CommercialDiagnostic`, `ProposalPriceRule`, `ProposalItem`, `ProposalDraft`, `ProposalSnapshot`, `ProposalVersion`, `ProposalDecision`, `ProposalAccessLink`, `AiGenerationRun`, `ProposalConversionRun`, and project-preset types.

Keep frontend names in camelCase and database rows in snake_case inside the service layer.

- [ ] **Step 4: Implement minimal pure rules**

Add pure functions:

- `calculateProposalTotal(items)`;
- `validateProposalPricing(items, rules, overrideReason)`;
- `validateProposalDecision(decision, comment)`;
- `canDecideProposalVersion(version, currentVersionId)`;
- `selectProjectPreset(blueprintPreset, packagePreset)`;
- `snapshotProposalDraft(draft)`.

- [ ] **Step 5: Run focused tests**

```bash
cd frontend
npm test -- src/lib/proposals/proposalRules.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/proposal.ts frontend/src/lib/proposals
git commit -m "feat: add proposal domain rules"
```

### Task 2: Proposal schema, presets, and authorization

**Files:**
- Create with Supabase CLI: the migration returned by `supabase migration new commercial_proposals_conversion`

- [ ] **Step 1: Verify current Supabase CLI commands**

```bash
supabase --version
supabase migration new --help
supabase db push --help
supabase functions deploy --help
```

- [ ] **Step 2: Generate the migration with the CLI**

```bash
supabase migration new commercial_proposals_conversion
```

Use the generated migration path for the rest of this task. Do not manually invent a migration timestamp.

- [ ] **Step 3: Add commercial tables**

Create:

- `commercial_diagnostics`: one current structured diagnostic per lead, with `organization_id`, `lead_id`, summary, pain points, goals, budget range, timeline, decision process, notes, creator, and timestamps;
- `proposal_templates`: organization-owned reusable defaults by package and optional blueprint, with scope, default items JSON, WhatsApp copy, email subject, email body, active flag, and timestamps;
- `proposal_price_rules`: organization-owned minimum, recommended, and maximum prices by package and `item_key`, with ordered range checks;
- `proposals`: mutable negotiation record with organization, lead, optional client, package, optional blueprint, responsible user, status, title, editable copy, billing cycle, selected modules, final value, pricing override reason, current version, conversion references, and timestamps;
- `proposal_items`: mutable draft line items with item key, label, description, quantity, unit value, total value, order index, and timestamps;
- `proposal_versions`: immutable `snapshot JSONB`, sequential version number, pending or decided status, sent timestamp, decision timestamp, and unique `(proposal_id, version_number)`;
- `proposal_decisions`: one recipient decision per immutable version, source, optional authenticated user, comment, and timestamp;
- `proposal_access_tokens`: version token hashes only, expiration, revocation, and creation timestamps;
- `ai_generation_runs`: proposal, status, sanitized input summary JSON, provider-neutral metadata JSON, protected error text, creator, and timestamps;
- `proposal_conversion_runs`: proposal, attempt number, status, generated IDs, protected error text, and timestamps;
- `package_project_presets` and `blueprint_project_presets`: one JSON phase-and-task preset per source record.

Use checks for status values, non-negative price fields, ordered min/recommended/max values, and token expiration. Add `current_version_id` after `proposal_versions` exists.

- [ ] **Step 4: Add indexes and update triggers**

Index:

- diagnostics by organization and lead;
- proposals by organization, lead, client, status, responsible user, package, and updated date;
- items and versions by proposal;
- decisions and access tokens by version;
- generation and conversion runs by proposal and creation date.

Reuse `public.update_updated_at_column()` for mutable records.

- [ ] **Step 5: Add unexposed authorization helpers**

Create helper functions under `private`, with fixed `search_path`, to answer:

- whether the current user can manage proposals for an organization using internal proposal permissions;
- whether the current portal user can read a proposal through their organization client and active contract with enabled `proposals` module;
- whether an inserted portal decision targets the proposal's current pending version.

Keep every `SECURITY DEFINER` function under `private`, never under exposed `public`.

- [ ] **Step 6: Add RLS and explicit grants**

Enable RLS on every new public table. Grant only the operations needed by `authenticated` and `service_role`.

Policies:

- internal users with proposal permissions manage drafts, diagnostics, templates, rules, items, versions, and protected run records for their organization;
- portal users read only proposals and immutable versions associated with their own client while an active contract enables `proposals`;
- portal users insert decisions only for their own current pending version;
- portal users never read token hashes, AI run errors, or conversion run errors;
- `anon` receives no direct table grants.

- [ ] **Step 7: Add status-transition triggers**

Implement trigger functions that:

- reject updates or deletes of immutable sent versions;
- reject a second decision for a version;
- reject decisions for stale versions;
- require comments for `adjustments_requested`;
- update version and proposal status after a valid decision;
- supersede an earlier pending version when a new version is sent.

- [ ] **Step 8: Seed templates, pricing rules, and project presets**

Seed a usable initial internal configuration for the existing YUX organization:

- one template and package fallback preset per existing package;
- representative min/recommended/max rules for each package base item;
- blueprint presets for the existing blueprint records;
- selected module defaults derived from `package_modules`.

The seed data must be editable later and must not require an AI provider.

- [ ] **Step 9: Apply remotely and run SQL probes**

```bash
supabase db push
```

Verify:

- all new public tables have RLS enabled;
- an internal YUX user can manage proposal data;
- a portal user sees only their associated client's proposal;
- a client without enabled `proposals` module sees nothing;
- a stale version cannot receive a decision;
- raw public tokens never appear in database rows;
- Supabase advisors report no new security or performance finding attributable to this migration.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add commercial proposal schema"
```

### Task 3: Typed proposal service

**Files:**
- Create: `frontend/src/services/proposalService.ts`
- Create: `frontend/src/services/proposalService.test.ts`

- [ ] **Step 1: Write failing service mapping tests**

Cover:

- snake_case row conversion to proposal domain objects;
- numeric values returned by Postgres as numbers or strings;
- nested item, version, decision, and conversion-run mapping;
- immutable snapshots preserving the sent payload;
- filters omitting empty values.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npm test -- src/services/proposalService.test.ts
```

Expected: fail because `proposalService.ts` does not exist.

- [ ] **Step 3: Implement mappings and reads**

Following `crmService.ts`, centralize row types and mapping functions. Add reads for:

- proposal queue filters;
- proposal details with items, versions, decisions, generation runs, and conversion runs;
- diagnostic by lead;
- proposal summaries by lead;
- templates, rules, packages, blueprints, and presets;
- portal proposals associated with the current authenticated client.

- [ ] **Step 4: Implement draft mutations**

Add:

- create or update diagnostic;
- create proposal from lead;
- update draft metadata and copy;
- replace editable items;
- create pricing override reason;
- revoke public access token;
- submit portal decision;
- invoke AI generation;
- invoke secure send;
- invoke conversion retry.

Use `supabase.functions.invoke()` for Edge Function boundaries. Do not expose secret keys in frontend code.

- [ ] **Step 5: Run focused tests and type checking**

```bash
cd frontend
npm test -- src/services/proposalService.test.ts
npm run type-check
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/proposalService.ts frontend/src/services/proposalService.test.ts
git commit -m "feat: add typed proposal service"
```

### Task 4: Provider-neutral AI draft generation

**Files:**
- Create: `supabase/functions/_shared/proposalDraft.ts`
- Create: `supabase/functions/_shared/proposalDraft.test.ts`
- Create: `supabase/functions/generate-proposal-draft/index.ts`
- Create: `supabase/functions/generate-proposal-draft/deno.json`

- [ ] **Step 1: Write failing draft-generation tests**

Cover:

- deterministic fallback from template, diagnostic, and registered price rules;
- suggested prices clamped to registered bounds;
- sanitized provider input excluding secret or unrelated client data;
- validated webhook response mapped into editable scope, items, WhatsApp message, email subject, and email body;
- invalid provider response falling back cleanly.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalDraft.test.ts
```

Expected: fail because `proposalDraft.ts` does not exist.

- [ ] **Step 3: Add pure generation helpers**

Implement:

- fallback draft construction;
- range-constrained price normalization;
- sanitized provider payload construction;
- provider response parsing and validation;
- generation-result metadata without raw provider secrets.

- [ ] **Step 4: Build protected generation function**

`generate-proposal-draft` must:

1. require the signed-in caller JWT;
2. use a user-scoped Supabase client to confirm proposal access through RLS;
3. use a secret-key server client only inside the Edge Function;
4. load diagnostic, template, rules, modules, and optional blueprint;
5. call `N8N_PROPOSAL_GENERATION_WEBHOOK_URL` when configured;
6. use deterministic fallback when the webhook is absent, fails, times out, or returns invalid data;
7. replace the mutable proposal draft and items;
8. record a `completed`, `fallback`, or `failed` generation run;
9. return editable draft data plus a non-sensitive fallback notice.

- [ ] **Step 5: Run tests and local function verification**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalDraft.test.ts
cd ..
supabase functions serve generate-proposal-draft
```

Invoke locally once without the webhook secret and confirm a usable fallback draft.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/proposalDraft.ts supabase/functions/_shared/proposalDraft.test.ts supabase/functions/generate-proposal-draft
git commit -m "feat: add proposal draft generation boundary"
```

### Task 5: Secure immutable send boundary

**Files:**
- Create: `supabase/functions/_shared/proposalSend.ts`
- Create: `supabase/functions/_shared/proposalSend.test.ts`
- Create: `supabase/functions/send-proposal/index.ts`
- Create: `supabase/functions/send-proposal/deno.json`

- [ ] **Step 1: Write failing send-helper tests**

Cover:

- secure random token generation;
- SHA-256 token hashing;
- raw token returned to caller but never stored;
- immutable snapshot construction;
- next sequential version number;
- invalid out-of-range pricing rejected without override reason;
- expired public link date set explicitly.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalSend.test.ts
```

- [ ] **Step 3: Build pure send helpers**

Implement token generation, hashing, snapshot validation, and default expiration calculation.

- [ ] **Step 4: Build protected send function**

`send-proposal` must:

1. require a signed-in internal caller;
2. load the proposal and items through user-scoped authorization;
3. validate pricing and override reasons server-side;
4. snapshot the mutable proposal;
5. insert the next immutable version;
6. revoke older active public tokens;
7. persist only the new token hash and expiration;
8. update `proposals.current_version_id` and status;
9. return version metadata and a raw public URL containing the one-time visible token.

Use an application URL secret such as `PUBLIC_APP_URL` to construct the final link.

- [ ] **Step 5: Verify locally**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalSend.test.ts
cd ..
supabase functions serve send-proposal
```

Invoke against a seeded proposal and confirm the database stores only the SHA-256 hash.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/proposalSend.ts supabase/functions/_shared/proposalSend.test.ts supabase/functions/send-proposal
git commit -m "feat: add secure proposal send boundary"
```

### Task 6: Internal proposal queue and editor

**Files:**
- Create: `frontend/src/pages/proposals/ProposalsPage.tsx`
- Create: `frontend/src/components/proposals/ProposalEditor.tsx`
- Create: `frontend/src/components/proposals/ProposalVersionHistory.tsx`
- Create: `frontend/src/components/proposals/ProposalDecisionHistory.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace the placeholder route**

Route `/proposals` to `ProposalsPage`.

- [ ] **Step 2: Build the operational queue**

Add compact filters for status, responsible user, lead, package, and date. Display lead, package, price, current status, last send, last decision, and conversion outcome. Include a clear command to start a proposal.

- [ ] **Step 3: Build the editable proposal workspace**

Support:

- selecting a lead, package, optional blueprint, modules, and recurrence;
- editing diagnostic summary and qualification fields;
- requesting AI-assisted content with visible fallback state;
- editing scope, items, WhatsApp copy, email copy, total, and override reason;
- saving mutable draft changes;
- sending an immutable version and copying its secure link;
- inspecting decisions and immutable version history;
- retrying failed conversion;
- opening converted client, contract, and project references.

Use dense tabs or sections. Keep all price controls explicit and preserve entered text after service failures.

- [ ] **Step 4: Add component-level rule tests where behavior is non-trivial**

Cover disabled send state for invalid pricing, fallback notice rendering, and stale-version history rendering.

- [ ] **Step 5: Run focused checks**

```bash
cd frontend
npm test -- src/lib/proposals src/services/proposalService.test.ts
npm run type-check
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/proposals frontend/src/components/proposals frontend/src/App.tsx
git commit -m "feat: add internal proposal workspace"
```

### Task 7: CRM lead commercial surface

**Files:**
- Create: `frontend/src/components/proposals/LeadCommercialPanel.tsx`
- Modify: `frontend/src/components/crm/CrmWorkspace.tsx`

- [ ] **Step 1: Extract the commercial panel**

Build a lead-focused panel that loads:

- latest diagnostic;
- linked proposals and statuses;
- current sent version;
- latest recipient decision;
- conversion outcome.

Add commands to edit the diagnostic and start a new proposal prefilled from the lead.

- [ ] **Step 2: Integrate into CRM lead details**

Add a fifth `Comercial` tab to `LeadOperationsModal`. Preserve the existing follow-up, history, tasks, and executions behavior.

- [ ] **Step 3: Verify focused behavior**

```bash
cd frontend
npm run type-check
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/proposals/LeadCommercialPanel.tsx frontend/src/components/crm/CrmWorkspace.tsx
git commit -m "feat: connect proposals to crm leads"
```

### Task 8: Public prospect review and decision boundary

**Files:**
- Create: `supabase/functions/_shared/proposalDecision.ts`
- Create: `supabase/functions/_shared/proposalDecision.test.ts`
- Create: `supabase/functions/submit-proposal-decision/index.ts`
- Create: `supabase/functions/submit-proposal-decision/deno.json`
- Create: `frontend/src/pages/public/PublicProposalPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing public-decision tests**

Cover:

- hash comparison without storing raw tokens;
- expired or revoked links rejected;
- stale or already-decided versions rejected;
- adjustment comments required;
- rejection comments optional;
- public response generic while protected logs retain details.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalDecision.test.ts
```

- [ ] **Step 3: Build public decision helpers**

Implement token hashing, decision input validation, and generic error mapping.

- [ ] **Step 4: Build public Edge Function**

`submit-proposal-decision` intentionally uses custom token authentication instead of a Supabase user session. It must:

1. accept raw token, decision, and comment;
2. hash the token immediately;
3. load the matching unexpired, unrevoked token with a server client;
4. validate the current pending version;
5. support `GET`-style review payload retrieval without exposing internal fields;
6. insert the decision for `POST`;
7. invoke the service-role-only conversion RPC directly after approval;
8. return only prospect-safe status and immutable snapshot data.

Configure this one function with JWT verification disabled because the hashed proposal token is its authentication boundary. Keep direct table access blocked for `anon`.

- [ ] **Step 5: Build public review page**

Add `/proposal/review/:token` outside authenticated layouts. Show the immutable sent scope, items, total, recurrence, and three decision commands. Require comment only when requesting adjustments. Do not expose internal navigation.

- [ ] **Step 6: Verify focused behavior**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalDecision.test.ts
npm run type-check
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/proposalDecision.ts supabase/functions/_shared/proposalDecision.test.ts supabase/functions/submit-proposal-decision frontend/src/pages/public/PublicProposalPage.tsx frontend/src/App.tsx
git commit -m "feat: add secure public proposal review"
```

### Task 9: Authenticated client portal proposals

**Files:**
- Modify: `frontend/src/lib/platform/moduleRegistry.ts`
- Modify: `frontend/src/lib/platform/navigation.test.ts`
- Create: `frontend/src/pages/client-portal/PortalProposalsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing navigation test**

Assert that an enabled contracted `proposals` module appears as `/portal/proposals` and remains absent when disabled.

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts
```

- [ ] **Step 3: Expose proposals in portal registry**

Set `proposals.portalRoute` to `/portal/proposals`.

- [ ] **Step 4: Build portal proposal page**

List proposal summaries for the authenticated client's active contract context. Show immutable sent versions, decision history, and conversion outcome. Permit approve, reject, or request adjustments only for a current pending version. Reuse `validateProposalDecision`.

- [ ] **Step 5: Add route and run checks**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/lib/proposals/proposalRules.test.ts
npm run type-check
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/platform frontend/src/pages/client-portal/PortalProposalsPage.tsx frontend/src/App.tsx
git commit -m "feat: add portal proposal decisions"
```

### Task 10: Transactional and idempotent approval conversion

**Files:**
- Create with Supabase CLI: the migration returned by `supabase migration new proposal_conversion_transaction`
- Create: `supabase/functions/_shared/proposalConversion.ts`
- Create: `supabase/functions/_shared/proposalConversion.test.ts`
- Create: `supabase/functions/convert-approved-proposal/index.ts`
- Create: `supabase/functions/convert-approved-proposal/deno.json`

- [ ] **Step 1: Write failing conversion-helper tests**

Cover:

- existing client reuse;
- prospect client payload derived from lead;
- blueprint preset preferred over package preset;
- package preset fallback;
- repeated successful conversion returning stored IDs;
- failure result represented without partial-record assumptions.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalConversion.test.ts
```

- [ ] **Step 3: Generate conversion migration**

```bash
supabase migration new proposal_conversion_transaction
```

- [ ] **Step 4: Add unexposed transactional conversion**

Create `private.convert_approved_proposal(target_proposal_id UUID)` with fixed `search_path` and `SECURITY DEFINER`.

Inside one database transaction:

1. lock the proposal row;
2. return existing stored client, contract, and project IDs when conversion already completed;
3. require an approved current version;
4. reuse a linked client or create an active client from the lead;
5. update `leads.converted_to_client_id`;
6. create an active contract with approved package, recurrence, value, and proposal provenance;
7. copy selected modules into `contract_modules`;
8. create a `PLANNING` project with sensible dates, approved budget, and provenance notes;
9. select blueprint preset first and package preset second;
10. create preset phases and tasks;
11. store IDs on `proposals`;
12. insert the successful conversion run;
13. append a CRM interaction describing the conversion;
14. return generated IDs.

Expose only a minimal `public.convert_approved_proposal_service(target_proposal_id UUID)` `SECURITY INVOKER` wrapper granted exclusively to `service_role`, so Edge Functions can call the private transaction through the Data API without exposing privileged execution to browser roles.

- [ ] **Step 5: Build conversion Edge Function**

`convert-approved-proposal` must:

1. require a signed-in internal caller;
2. confirm internal proposal access through a user-scoped client;
3. invoke the service-role-only wrapper with a server client;
4. on database failure, record a failed `proposal_conversion_runs` attempt after rollback;
5. return existing stored IDs for idempotent replay.

Reuse the same service-role-only conversion RPC from `submit-proposal-decision` after public approval. Do not call an Edge Function from another Edge Function. Portal approval should invoke `convert-approved-proposal`; if invocation fails, retain approved status and expose an internal retry command.

- [ ] **Step 6: Apply remotely and probe transaction behavior**

```bash
supabase db push
```

Probe:

- successful prospect conversion creates exactly one client, one contract, one project, expected modules, phases, tasks, and CRM interaction;
- successful existing-client conversion creates no duplicate client;
- repeated calls return the same IDs;
- injected preset failure rolls back all generated operational rows;
- failure run remains traceable after rollback;
- only `service_role` can execute the public service wrapper.

- [ ] **Step 7: Run helper tests**

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared/proposalConversion.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/functions/_shared/proposalConversion.ts supabase/functions/_shared/proposalConversion.test.ts supabase/functions/convert-approved-proposal
git commit -m "feat: convert approved proposals into delivery records"
```

### Task 11: Remote configuration and deployment

**Files:**
- Modify only if deployment exposes a defect.

- [ ] **Step 1: Verify linked project and secrets command**

```bash
node --version
supabase status
supabase secrets --help
supabase functions deploy --help
```

Use Node.js 22 or later for local tooling because current Supabase library support for Node.js 20 ends on June 30, 2026.

- [ ] **Step 2: Configure safe function secrets**

Set:

- `PUBLIC_APP_URL`;
- optional `N8N_PROPOSAL_GENERATION_WEBHOOK_URL`.

Use Supabase-managed secret keys inside Edge Functions. Do not expose secret keys to Vite environment variables or frontend bundles.

- [ ] **Step 3: Deploy protected functions**

```bash
supabase functions deploy generate-proposal-draft
supabase functions deploy send-proposal
supabase functions deploy convert-approved-proposal
```

- [ ] **Step 4: Deploy custom-token public function**

```bash
supabase functions deploy submit-proposal-decision --no-verify-jwt
```

- [ ] **Step 5: Run remote smoke probes**

Confirm:

- authenticated generation returns a fallback draft without n8n configured;
- send returns a functional raw URL and stores only a hash;
- expired token returns a generic error;
- valid public approval persists a decision and attempts conversion;
- internal retry returns prior IDs after successful conversion.

- [ ] **Step 6: Commit deployment fixes if needed**

```bash
git add supabase/functions
git commit -m "fix: harden proposal edge boundaries"
```

### Task 12: Full verification and browser smoke tests

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run automated checks**

```bash
cd frontend
npm test
npm run type-check
npm run build
```

Run Edge helper tests:

```bash
cd frontend
npx vitest run --root .. supabase/functions/_shared
```

- [ ] **Step 2: Run Supabase security and performance checks**

Use Supabase advisors and SQL probes. Confirm:

- every new exposed table has RLS enabled;
- direct `anon` reads fail;
- portal cross-client reads and writes fail;
- portal module-disabled reads fail;
- public tokens are hashed, expiring, and revocable;
- privileged conversion code remains under `private`;
- the public conversion wrapper is executable only by `service_role`.

- [ ] **Step 3: Verify internal browser flow**

Using the local app:

1. sign in as an internal user;
2. open a CRM lead and the `Comercial` tab;
3. save a diagnostic;
4. create a proposal;
5. generate a fallback AI draft;
6. edit copy and pricing;
7. send and copy the secure link;
8. inspect immutable version history.

- [ ] **Step 4: Verify public prospect flow**

Open the secure link without an authenticated session. Confirm:

- only immutable proposal content appears;
- internal navigation is absent;
- requesting adjustments requires a comment;
- a valid decision updates internal history;
- stale links cannot decide a superseded version.

- [ ] **Step 5: Verify client portal flow**

Sign in as a client with contracted `proposals` module, open `/portal/proposals`, submit a decision, and confirm cross-client proposal data remains inaccessible.

- [ ] **Step 6: Verify conversion flow**

Approve a fresh prospect proposal. Confirm the internal proposal references the resulting client, active contract, `PLANNING` project, modules, phases, tasks, and CRM history. Retry conversion and confirm no duplicates.

- [ ] **Step 7: Run focused lint on touched files**

```bash
cd frontend
npx eslint src/types/proposal.ts src/lib/proposals src/services/proposalService.ts src/services/proposalService.test.ts src/pages/proposals src/components/proposals src/components/crm/CrmWorkspace.tsx src/pages/public/PublicProposalPage.tsx src/pages/client-portal/PortalProposalsPage.tsx src/lib/platform/moduleRegistry.ts src/lib/platform/navigation.test.ts src/App.tsx --ext ts,tsx --report-unused-disable-directives --max-warnings 0
```

- [ ] **Step 8: Commit verification fixes**

```bash
git add frontend supabase
git commit -m "fix: stabilize proposal conversion workflow"
```

### Task 13: Documentation and execution closeout

**Files:**
- Modify: `README.md`
- Modify: `docs/stabilization/ARCHITECTURE_MINIMUM.md`

- [ ] **Step 1: Document the commercial slice**

Record:

- internal `/proposals`;
- CRM `Comercial` tab;
- portal `/portal/proposals`;
- public `/proposal/review/:token`;
- AI fallback behavior;
- optional n8n webhook secret;
- immutable proposal versions;
- hashed public links;
- automatic conversion and retry behavior.

- [ ] **Step 2: Record verification commands**

Document frontend checks, Edge helper tests, database push, function deployment, and advisor checks.

- [ ] **Step 3: Re-run final checks**

```bash
cd frontend
npm test
npm run type-check
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/stabilization/ARCHITECTURE_MINIMUM.md
git commit -m "docs: describe commercial proposal workflow"
```
