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

- [ ] Verify empty CRM and active contracted modules.
- [ ] Create one pipeline within the existing limit, with discovery, qualification, email, response, follow-up, WhatsApp handoff, proposal and terminal stages.
- [ ] Activate and record configuration publication; preserve activation during entitlement reconciliation.
- [ ] Verify the client CRM page and scoped lead operations.

### Task 2: Import existing discoveries for qualification

**Files:** backend/src/modules/radar/crm-delivery.ts; radar/routes.ts; backend/tests/radar-crm-delivery.test.ts.
**Interfaces:** deliveryMode?: 'qualified' | 'discovery_triage', default qualified. Discovery mode requires YUX admin and the first nonterminal pipeline stage. Preserve all delivery-rights and exclusion checks; label pending qualification explicitly.

- [ ] Add focused cases for explicit triage permission, default reviewed behavior and pending qualification.
- [ ] Implement triage import using the existing commercial projection and deduplication.
- [ ] Import only already stored eligible campaign records and verify counts, links and repeat safety.

### Task 3: Repair planning retry and error diagnostics

**Files:** mission-conversations.ts; planner.ts; corresponding focused tests.
**Interfaces:** Existing confirmation returns the same mission; if blocked before any active plan, transition it to planning and synchronize conversation state. Preserve approved/executing missions.

- [ ] Test blocked-before-plan retry and idempotent existing mission confirmation.
- [ ] Retain a safe machine-readable Harness error detail; never persist raw model output or credentials.
- [ ] Build backend, run focused tests, publish authorized changes and verify deployed state without paid model calls.
- [ ] Record the actual operational completion separately from the unsuccessful AI planning attempt; never fabricate execution receipts.
