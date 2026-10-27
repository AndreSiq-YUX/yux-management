# CRM activation and Radar import implementation plan

> **For agentic workers:** Implement natively in this session, as requested by the user, with focused verification only.

**Goal:** Activate the representative's contracted CRM, configure the agreed acquisition pipeline and import existing Radar discoveries without inventing qualification or sending messages.

**Architecture:** Reuse CRM domain commands and record an explicit configuration publication. Extend Radar delivery with an explicit discovery-triage mode while preserving its default reviewed delivery, licensing, exclusion, tenant isolation and commercial projection. Repair attached mission retry state rather than generating another briefing.

**Tech Stack:** TypeScript, PostgreSQL, Fastify, Vitest, existing Python Harness.

**Spec:** Current user instruction and the confirmed briefing of conversation 293019f1-4df5-46fd-b5a6-e1777e6f6d67.

## Global constraints

- No external paid calls, new discovery, outbound messages or lead enrollment.
- Preserve supplier confidentiality, attribution rights and existing contract limits.
- Keep tests scoped to changed behavior; preserve unrelated concurrent work.

## Review focus

- A configured CRM must remain active when its unchanged entitlement is synchronized.
- Discovery import must preserve pending qualification and exclude rejected companies.
- Repeated imports must not duplicate companies; foreign destinations remain forbidden.
- A blocked attached mission must resume planning instead of confirming the same briefing indefinitely.
- Planning errors must retain a bounded safe reason rather than only HTTP 422.

### Task 1: Publish the representative's initial CRM configuration

**Files:** platform/repository.ts; existing platform entitlement tests.
**Interfaces:** Reuse createPipeline, createPipelineStage and activateProvisionedCrmInstance with scoped admin context. Record crm_configuration_publications with actual pipeline/stage IDs.

- [x] Verify empty CRM and active contracted modules.
- [x] Create one pipeline within the existing limit, with discovery, qualification, email, response, follow-up, WhatsApp handoff, proposal and terminal stages.
- [x] Activate and record configuration publication; preserve activation during entitlement reconciliation.
- [x] Verify the client CRM page and scoped lead operations.

### Task 2: Import existing discoveries for qualification

**Files:** backend/src/modules/radar/crm-delivery.ts; radar/routes.ts; backend/tests/radar-crm-delivery.test.ts.
**Interfaces:** deliveryMode?: 'qualified' | 'discovery_triage', default qualified. Discovery mode requires YUX admin and the first nonterminal pipeline stage. Preserve all delivery-rights and exclusion checks; label pending qualification explicitly.

- [x] Add focused cases for explicit triage permission, default reviewed behavior and pending qualification.
- [x] Implement triage import using the existing commercial projection and deduplication.
- [x] Import only already stored eligible campaign records and verify counts, links and repeat safety.

### Task 3: Repair planning retry and error diagnostics

**Files:** mission-conversations.ts; planner.ts; corresponding focused tests.
**Interfaces:** Existing confirmation returns the same mission; if blocked before any active plan, transition it to planning and synchronize conversation state. Preserve approved/executing missions.

- [x] Test blocked-before-plan retry and idempotent existing mission confirmation.
- [x] Retain a safe machine-readable Harness error detail; never persist raw model output or credentials.
- [x] Build backend, run focused tests, publish authorized changes and verify deployed state without paid model calls.
- [x] Record the actual operational completion separately from the unsuccessful AI planning attempt; never fabricate execution receipts.

## Verified production result — 27 October 2026

- Runtime correction: `5e3d009`, Dokploy completed successfully, API healthy and migration service exited with code 0.
- Organization: `972e8163-81b7-4e3f-b964-777110b660b8` (Villeman e Massas).
- CRM `760dcf8c-05ef-4bc7-9728-954c7a537482`: active. Publication `8082702c-e353-48d0-93e9-dea400ba7a5a` records the authorized initial configuration.
- Pipeline `cd6e7bee-b2fd-4a46-9a40-62edb3aacd4f`: ten stages. The existing one-pipeline limit is preserved; requested response paths are stages in this pipeline.
- Radar campaign `958f87b1-96a1-45b5-a095-d9e9eb623f67`: 110 historical records examined, 62 imported for qualification, 48 excluded/outside-profile records preserved without delivery. A repeat produced 62 already-linked results and zero new leads.
- Production CRM page renders the pipeline and companies. A lead detail shows commercial data and Radar origin without requiring sender connections.
- Three draft email templates are stored. Sequence `f5775da8-8a79-45f6-9668-aa7db55cc92f` is paused, with three inactive steps. No outbound messages or enrollments were performed.
- Conversation `293019f1-4df5-46fd-b5a6-e1777e6f6d67` records actual operational fulfillment and is closed. Its old blocked planning mission is cancelled with an explicit reason and audit event, preserving failure history. This is not a claim of successful AI execution.
- Focused checks: 32 backend unit cases, 7 real-database delivery cases, 1 HTTP case covering four roles and cross-account isolation, 34 Python cases, and backend build. No paid provider was called.
- The old HTTP 422 response discarded its detailed reason. Retry lifecycle, safe error propagation and the missing specialist response schemas are corrected; a new paid end-to-end LLM attempt was deliberately not performed and remains unverified.
