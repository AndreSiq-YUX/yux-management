# CRM And Lead Management

Updated: 2026-06-03

This document describes the CRM and lead-management module as implemented in
this repository, including its user-facing scope, data model, integrations,
security boundaries, and remaining operational dependencies.

## Executive Status

The CRM and lead-management scope planned for the current repository phase is
implemented in code. The module is not automatically 100% operational in every
environment until the target Supabase project has the required migrations,
Data API grants, RLS policies, seed data, and authenticated users/memberships
applied.

Current state:

- Internal CRM route: implemented at `/leads`.
- Client portal CRM route: implemented at `/portal/crm`.
- CRM Cockpit commercial upgrade: implemented.
- Follow-up automation foundation: implemented.
- Protected CRM automation dispatcher: implemented.
- Provider-neutral automation boundary: implemented.
- Live WhatsApp/email/n8n provider execution: supported by dispatcher boundary,
  but production credentials/workflows remain operational configuration.
- Browser issue reported on 2026-06-03: fixed in code by preventing infinite
  loading when platform context falls back to a non-persisted organization.
- Supabase `401` on `organizations`: addressed in repo with explicit Data API
  grants migration, but the target Supabase project still needs that migration
  applied and a valid authenticated session.
- Remote Supabase check on 2026-06-03: project `portal-yux`
  (`uuowkncimiydpbxqpkej`) is active and had migrations only through
  `20260601210000_omnichannel_webchat_widget_service` before the Data API grants
  fix was applied. Later commercial MVP migrations still need to be applied to
  that target environment.

## Routes And Surfaces

### Internal CRM

Route: `/leads`

Primary component:

- `frontend/src/pages/leads/LeadsPage.tsx`
- `frontend/src/components/crm/CrmWorkspace.tsx`

The internal CRM is the YUX commercial cockpit for pipeline operation. It uses
the current platform organization context and only queries persisted
organization IDs.

### Client Portal CRM

Route: `/portal/crm`

The portal route currently reuses the shared CRM workspace and is gated by the
portal navigation/contract context. A client only sees CRM when the active
contract enables the `crm` module and RLS allows access to that client
organization.

The portal-safe CRM scope is intentionally narrower than internal operation:
it is designed for contracted pipeline visibility and client-safe stage/lead
continuation, not unrestricted YUX internal administration.

## Implemented User-Facing Features

### Pipeline Cockpit

Implemented:

- Loads CRM pipelines by organization.
- Selects the default active pipeline when available.
- Shows ordered pipeline stages.
- Supports Kanban view.
- Supports list/table view.
- Allows lead movement across stages.
- Preserves legacy lead `stage` values while using configurable `stage_id`.
- Supports won/lost stage semantics through stage metadata.

### Metrics Strip

Implemented:

- New leads.
- Stale leads.
- Conversion rate.
- Open pipeline value.

Rules are implemented in:

- `frontend/src/lib/crm/pipelineRules.ts`
- `frontend/src/lib/crm/pipelineRules.test.ts`

### Lead Creation

Implemented:

- Manual lead creation from the CRM UI.
- Captures name, email, phone, company, source, score, and estimated value.
- Assigns the new lead to the first ordered stage of the selected pipeline.
- Persists attribution context and source kind defaults.

### Lead Cards And List Rows

Implemented:

- Lead name.
- Company/email context.
- Source/source kind.
- Score.
- Value.
- Stage selection.
- Stage movement action.

### Lead Detail Operations

Implemented in the lead modal:

- Lead summary.
- Mark as won.
- Mark as lost.
- Interaction timeline.
- Add note/activity.
- Task panel.
- Create follow-up task.
- Complete follow-up task.
- Automation execution list.
- Retry failed execution.
- Commercial/proposal panel integration.

Related components:

- `LeadDetailPanel`
- `LeadKanbanBoard`
- `LeadTaskPanel`
- `LeadTimeline`
- `LeadCommercialPanel`

### Follow-Up Sequences

Implemented:

- CRM sequences.
- Sequence steps.
- Lead enrollments.
- Pause automation.
- Resume automation.
- Manual takeover.
- Reschedule next execution.
- Execution status tracking.
- Retry command for failed execution.

Domain rules:

- `frontend/src/lib/crm/followUpRules.ts`
- `frontend/src/lib/crm/followUpRules.test.ts`

## Data Model

### Core CRM Tables

Implemented by `supabase/migrations/20260601110000_multitenant_crm_automation.sql`:

- `crm_pipelines`
- `crm_pipeline_stages`
- `crm_sequences`
- `crm_sequence_steps`
- `crm_sequence_enrollments`
- `crm_tasks`
- `automation_executions`

Existing tables extended:

- `leads`
- `interactions`

### CRM Cockpit Upgrade Tables

Implemented by `supabase/migrations/20260601260000_crm_cockpit_upgrade.sql`:

- `pipeline_templates`
- `pipeline_template_stages`
- `lead_custom_field_values`
- `lead_tasks`

Lead fields added or normalized:

- `organization_id`
- `pipeline_id`
- `stage_id`
- `owner_id`
- `score`
- `status`
- `lost_reason`
- `won_at`
- `lost_at`
- `last_activity_at`
- `next_follow_up_at`
- `source_kind`
- `attribution_context`

### Data API Exposure Fix

Implemented by `supabase/migrations/20260603215128_expose_platform_base_tables_to_data_api.sql`:

- explicit `GRANT` for authenticated access to base platform tables required
  by the platform shell;
- explicit `GRANT` for authenticated access to CRM tables required by the CRM
  service;
- RLS remains the authorization boundary.

Probe:

- `supabase/probes/20260603215128_expose_platform_base_tables_to_data_api.sql`

Remote application:

- Applied to `portal-yux` (`uuowkncimiydpbxqpkej`) on 2026-06-03 via Supabase
  connector as remote migration
  `20260603215652_expose_platform_base_tables_to_data_api`.

## Security And Access Model

RLS is enabled for CRM tables. The core helper functions live under the private
schema:

- `private.can_access_crm_organization(UUID)`
- `private.can_access_crm_pipeline(UUID)`
- `private.can_access_crm_lead(UUID)`

Access model:

- internal YUX users can manage CRM records;
- client users can access CRM only for their organization when an active
  contract enables the `crm` module;
- cross-client access is blocked by RLS;
- portal access is contract/module-derived;
- Data API grants expose table operations to the REST layer but do not bypass
  RLS.

## Service Layer

Primary service:

- `frontend/src/services/crmService.ts`

Implemented operations:

- `getPipelines`
- `getPipelinesForOrganization`
- `getLeads`
- `getLeadsForPipeline`
- `createLead`
- `moveLead`
- `moveLeadToStage`
- `updateLeadScore`
- `getInteractions`
- `createInteraction`
- `recordLeadActivity`
- `getTasks`
- `createTask`
- `createLeadTask`
- `completeLeadTask`
- `markLeadWon`
- `markLeadLost`
- `getSequences`
- `getEnrollments`
- `enrollLead`
- `updateEnrollment`
- `getExecutions`
- `retryExecution`

## Relationships With Other Modules

### Platform, Contracts, And Portal

CRM depends on platform context:

- organizations;
- memberships;
- roles;
- active contracts;
- enabled modules.

The portal only exposes CRM when the active contract enables `crm`.

### Commercial Proposals

CRM integrates with proposals through `LeadCommercialPanel` and proposal
conversion flows. Leads can become commercial opportunities and connect to
proposal generation/review/conversion.

### Omnichannel AI

Omnichannel keeps CRM sync boundaries through:

- `crm_sync_runs`;
- conversation/contact lead references;
- handoff and lead context;
- future provider workflows for contact-to-lead enrichment.

The current implementation is provider-neutral by default, with real WhatsApp
provider support implemented separately in the omnichannel provider path.

### Landing Pages

Landing pages can route captured submissions into CRM through mapped fields and
lead attribution context. CRM can consume source/source-kind and attribution
metadata for reporting.

### Campaigns

Campaigns connect to leads through paid source attribution, campaign metrics,
and MROI reporting. CRM lead source fields support campaign attribution.

### Flow Builder Lite

Flow Builder can trigger commercial actions that relate to leads, campaigns,
landing pages, proposals, and CRM events. Execution history is available for
operational traceability.

### Operational Reports

Reports aggregate CRM data into:

- leads by source;
- stage conversions;
- stalled opportunities;
- proposal approval rate;
- response time;
- owner activity;
- MROI/campaign outcomes.

Portal reports sanitize internal-only activity.

### Finance And Projects

Won leads can feed proposal, contract, project, and finance workflows. The
current code has the CRM/proposal relationship implemented; full automated
lead-to-billing orchestration is still an operational/product extension.

## Error Handling And Current Browser Fix

The reported browser symptom was:

- CRM stayed on a loading message;
- console showed `401 Unauthorized` on
  `/rest/v1/organizations?select=*&order=name.asc`.

Root cause in code:

- platform initialization can fall back to a local non-persisted organization
  when remote context fails;
- CRM previously initialized `loading=true`;
- when the organization ID was not a persisted UUID, CRM returned early without
  setting `loading=false`.

Fix implemented:

- CRM no longer starts with permanent loading;
- non-persisted or missing organization context renders an explicit operational
  notice;
- pipeline/load errors render an explicit retryable CRM error;
- a regression test covers the fallback organization case.

Important operational note:

- if the console still shows `401` after deploying this fix, the environment
  still has an auth/Data API issue. Apply the new Data API grants migration,
  ensure the user has a valid Supabase session, and confirm memberships/RLS
  policies for the current user.

## Validation Evidence

Focused CRM validation after the loading fix:

```bash
cd frontend
npm test -- src/components/crm/CrmWorkspace.test.tsx src/lib/crm/pipelineRules.test.ts src/lib/crm/followUpRules.test.ts
```

Result:

- 3 test files passed;
- 10 tests passed.

Previous commercial MVP validation included:

- full frontend test suite;
- type-check;
- production build;
- shared Supabase Edge Function tests;
- Vercel deployment success.

## Is CRM 100% Implemented?

Repository implementation: yes, for the CRM/follow-up/commercial cockpit scope
planned in the current phase.

Operational production readiness: not fully guaranteed until the target
environment is verified.

Still required or not fully automated:

- apply all commercial MVP migrations after `20260601210000` to the target
  Supabase project;
- run the CRM probes against the target Supabase project;
- verify an internal YUX user can read `organizations`, pipelines, and leads;
- verify a client portal user only sees CRM when its active contract enables
  `crm`;
- configure real outbound providers/n8n workflows for sequence execution;
- run authenticated browser QA on `/leads` and `/portal/crm`;
- decide whether portal CRM should remain the shared operational workspace or
  receive a more restricted client-only CRM view.

## Relevant Files

Frontend:

- `frontend/src/pages/leads/LeadsPage.tsx`
- `frontend/src/components/crm/CrmWorkspace.tsx`
- `frontend/src/components/crm/LeadKanbanBoard.tsx`
- `frontend/src/components/crm/LeadDetailPanel.tsx`
- `frontend/src/components/crm/LeadTimeline.tsx`
- `frontend/src/components/crm/LeadTaskPanel.tsx`
- `frontend/src/components/proposals/LeadCommercialPanel.tsx`
- `frontend/src/services/crmService.ts`
- `frontend/src/types/crm.ts`
- `frontend/src/lib/crm/followUpRules.ts`
- `frontend/src/lib/crm/pipelineRules.ts`

Supabase:

- `supabase/migrations/20260601110000_multitenant_crm_automation.sql`
- `supabase/migrations/20260601120000_crm_automation_triggers.sql`
- `supabase/migrations/20260601130000_enqueue_crm_follow_up.sql`
- `supabase/migrations/20260601140000_enable_client_crm_portal.sql`
- `supabase/migrations/20260601260000_crm_cockpit_upgrade.sql`
- `supabase/migrations/20260603215128_expose_platform_base_tables_to_data_api.sql`
- `supabase/functions/dispatch-crm-automation/index.ts`

Tests:

- `frontend/src/components/crm/CrmWorkspace.test.tsx`
- `frontend/src/lib/crm/followUpRules.test.ts`
- `frontend/src/lib/crm/pipelineRules.test.ts`
