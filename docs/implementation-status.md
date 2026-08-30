# YUX Hub Implementation Status

Updated: 2026-08-30 (repository audit plus locally validated Mission Supervisor
Releases 0–3 on the feature branch)

This document tracks what is implemented in this repository. It separates code
that exists in the repo from operational work that still needs to be applied in
the target VPS/Dokploy environment.

## Current Baseline

- Frontend: React 18, TypeScript, Vite, Tailwind, shadcn-style UI primitives.
- Data/runtime: self-hosted Postgres, Fastify backend API, Redis/BullMQ worker,
  local VPS file storage and Python Agent Harness runtime. This document reports
  repository validation only; production requires a Dokploy deploy, migration
  execution and operational smoke test.

> Historical sections below may mention Supabase migrations or Edge Functions.
> They are archival evidence from before the VPS migration, not a production
> dependency or a claim of current deployment status.
- Active frontend data layer: `/api/*` through `apiClient`, `backendDataClient`,
  `backendAuthService`, `backendDataService`, and module-specific services.
- Mission Supervisor Releases 0–3 are implemented and locally validated
  through migration `0142`: frozen context, deterministic pack compilation,
  autonomy envelopes, decision summaries, notifications, shareable redacted
  shadow reports, structured feedback, budget burn-down, readiness correction
  links, granular capability kill switches, a governed Funnel + Nurture pack and
  a Campaign Launch pack with provider-paused creation, exact activation,
  monitoring, attribution and containment. These are bounded verticals, not yet
  the general autonomous agent. VPS migrations,
  authenticated role/channel QA and rollback rehearsal remain pending.
- Current implementation boundary: committed `main` at `34b3af4`, including
  standalone external lead forms, CRM/client access stabilization and the
  transactional lead-orchestration foundation.
- The VPS operator confirmed the backend migration history through `0126` on
  2026-08-05. The new `0127_company_visual_identity.sql` still requires
  application after this feature branch is deployed.
- Redis/BullMQ executes asynchronous deliveries, but new lead/form events are
  first committed to the Postgres transactional outbox so a temporary queue
  outage does not roll back or lose an accepted submission.
- The CRM scoring consumer now evaluates governed fit/intent rules, persists an
  append-only score history and emits score-change/threshold events.
- The internal YUX active-prospecting path is now connected in the repository:
  Radar analysis runs asynchronously through the Agent Harness, an approved
  opportunity can create a governed prospecting plan, CRM sequences dispatch
  native SMTP2GO e-mail or Meta WhatsApp jobs, and inbound WhatsApp messages can
  produce an AI suggestion, automatic low-risk response or human handoff.
  This is locally validated code, not a claim that production providers are
  already configured or enabled.
- Company Intelligence is now editable end to end: Crescimento YUX resolves its
  own active contract, Company Profile and Brand/Voice persist through the VPS
  API, and the Knowledge Base accepts text, URL, PDF, DOCX, TXT and Markdown
  with review and explicit publication. The Agent Harness uses the published
  organization context for Marketing, Radar, automation AI actions and
  WhatsApp; external messages also receive a deterministic brand-rule check.
- Company knowledge ingestion now preserves the original source for audit,
  removes conservative noise/duplicates, uses an LLM to propose evidence-backed
  atomic facts, supports per-fact approval/rejection and generates Jina passage
  embeddings for hybrid semantic/text retrieval. A website-assisted onboarding
  flow crawls a bounded set of same-origin pages and proposes company, brand and
  product fields with literal evidence before the user applies them.
- Website onboarding now tolerates canonical-host links by safely mapping their
  paths back to the requested public host, reuses an existing site document
  instead of failing on a duplicate checksum and keeps grounded suggestions
  reviewable even if a later indexing step is degraded. The review UI supports
  editing, selecting and applying suggestions for company profile, audience,
  offers and structured visual identity (logo, colors, typography and style).
  That visual context is shared with Marketing Studio and Agent Harness agents.
- Website discovery now follows useful same-origin links found on child pages,
  defaults to 30 pages and allows an operator-selected maximum up to 50. Agent
  extraction runs in batches of at most three pages/60,000 characters; a failed
  batch is split down to individual pages so successful grounded suggestions are
  preserved. The runtime API now imports and handles `ProviderRequestError`
  correctly instead of turning provider failures into `agent_runtime_500`.
- CRM-specific reference:
  `docs/crm-lead-management.md`.

## Summary Table

| Area | Status | Main Routes | Main Repo Evidence | Operational Notes |
| --- | --- | --- | --- | --- |
| Mission Supervisor Releases 0–3 | Implemented and locally validated | `/missions`, `/portal/missoes`, `/mission-simulation/review/:token`, `/api/action-engine/*` | Migrations `0128`–`0142`, safety/knowledge/decision foundations, `funnel_nurture@1.0.0`, `campaign_launch@1.0.0`, immutable bindings, provider effect ledger/reconciliation, pack-driven artifacts/metrics/economics, versioned recipes, disposable sandbox, adversarial corpus, E2E and release runbooks | Releases 2–3 are bounded operational verticals. Apply migrations through `0142`; enable entitlements/policies per pilot; keep campaign create/activate disabled until provider-sandbox acceptance. Composite missions and bounded autonomous canary remain later releases. |
| Platform foundation | Implemented | `/dashboard`, platform shell | Platform schema lineage, Fastify/Postgres repositories, `platformService`, module registry and platform store | Confirm the complete backend migration history and authenticated platform bootstrap in the target VPS. |
| Admin YUX Hub | Implemented in repo | `/admin`, `/admin/integrations`, `/admin/channels`, `/admin/email`, `/admin/ai`, `/admin/modules-governance`, `/admin/health` | Admin platform schema lineage, backend admin routes/repositories, `adminPlatformService`, grouped navigation, Admin Hub pages and `docs/admin-yux-hub.md` | Active reads use the VPS API/Postgres path; production credentials and authenticated Admin QA remain required. |
| Contracts, packages, modules, portal context | Implemented | `/contracts`, `/packages`, `/modules`, `/portal` | `20260601000000_contracts_modules_portal.sql`, `20260601010000_contract_rls_policies.sql`, `ContractsPage`, `PackagesPage`, `ModulesPage`, `PortalDashboardPage` | Portal access derives from active contract and enabled modules. |
| Lead-to-client conversion bridge | Implemented in repo | `/client-conversions` | `ClientConversionsPage`, `clientConversionService`, `platformService.createClientOrganization`, `crmService`, `backendDataService.createClient` | Converts a closed lead from a client/YUX workspace into official client, organization and contract records, optionally applying a sector model and marking the lead as converted. |
| Portal RLS hardening | Implemented in repo | Portal routes | `20260601020000_harden_portal_rls.sql`, `20260601030000_secure_baseline_functions.sql`, `20260601040000_move_auth_trigger_private.sql` | Requires remote migration application/probes in target DB. |
| Portal by customer journeys | Implemented in repo | `/portal`, `/portal/empresa/*`, `/portal/comercial/*`, `/portal/atendimento/*`, `/portal/marketing/*`, `/portal/automacoes/*`, `/portal/projetos/*`, `/portal/relatorios`, `/portal/suporte`, `/portal/financeiro`, `/portal/configuracoes/conta` | `App.tsx`, `navigation.ts`, `PortalJourneyPage`, portal journey pages, `PortalDashboardPage`, `PortalApprovalsPage` | Replaces legacy module-first portal navigation with customer-facing areas. Legacy portal module routes now redirect to the new journey routes. |
| Admin assisted client workspaces | Implemented in repo | `/client-workspaces`, `/client-workspaces/:organizationId/*` | `0105_strategy_packs_yux_workspace.sql`, `ClientWorkspaceSelectorPage`, `ClientWorkspaceLayout`, `platformStore.initializeClientWorkspace`, `usePortalWorkspacePath`, navigation tests | Admin users must select a workspace before operating. `Crescimento YUX` is now a pinned internal workspace with its own client/contract/module context for the YUX operation. |
| Portal data stabilization / phase 6 visibility | Implemented in repo | Portal and client workspace routes | `20260608095633_portal_phase6_rls_visibility.sql`, `usePortalActionSummary`, `usePortalCrmContext`, `usePortalMarketingContext`, `portalDisplay` | Stabilizes portal loading and next-action summaries across CRM, marketing, approvals, projects and finance. Target migration/probe confirmation is still required before production assumptions. |
| Projects, tasks, deliverables, approvals | Implemented | `/projects`, `/portal/projetos/projetos`, `/portal/projetos/aprovacoes` | `20260601070000_project_delivery_approvals.sql` through `20260601100000_backfill_deliverable_approval_status.sql`, `ProjectsPage`, `PortalProjectsPage`, `PortalApprovalsPage`, project components, `approvalRules` | Includes client-visible timeline, documents and approval decisions. |
| CRM and follow-up automation foundation | Implemented in repo | `/leads`, `/portal/comercial/leads` | CRM Postgres migrations/repositories, `crmService`, sequence scheduler, follow-up rules and `docs/crm-lead-management.md` | Provider-neutral CRM core now runs through the VPS backend. Provider credentials, worker availability and production smoke tests remain operational requirements. |
| CRM governed by contract | Implemented and locally validated | `/crm-governance`, `/portal/comercial/leads`, `/portal/empresa/usuarios` | CRM governance schema, backend `governance-context`, `crmGovernanceService`, governance rules/UI and `0116_reconcile_crm_instances.sql` | Contract membership and module entitlement are enforced in the backend; target Postgres migration history and authenticated QA still need confirmation. |
| Client access and CRM provisioning stabilization | Implemented and locally validated | `/clients`, `/crm-governance`, portal/client workspace routes | `0115_reconcile_client_portal_emails.sql`, `0116_reconcile_crm_instances.sql`, `clientIdentity`, workspace/CRM repositories and regression tests | Revalidates persisted sessions, reports invitation-delivery failures, safely synchronizes portal e-mail identities and reconciles CRM instances from active contracts/modules. Production migration and authenticated smoke tests remain required. |
| Commercial proposals and conversion | Implemented | `/proposals`, `/portal/projetos/aprovacoes`, `/proposal/review/:token` | `20260601150000_commercial_proposals_conversion.sql` through `20260601180000_enable_client_proposal_permissions.sql`, `proposalService`, `ProposalEditor`, `PublicProposalPage`, `PortalApprovalsPage` | AI draft generation is provider-neutral with fallback behavior; production provider credentials are not part of this status. |
| Omnichannel AI base | Implemented as provider-neutral base | `/omnichannel`, `/portal/atendimento/conversas`, `/portal/atendimento/canais`, `/webchat/session/:sessionToken` | `20260601190000_omnichannel_ai_core.sql`, `20260601200000_omnichannel_crm_sync.sql`, `20260601210000_omnichannel_webchat_widget_service.sql`, `omnichannelService`, omnichannel components, `frontend/public/yux-webchat.js` | Live WhatsApp/Instagram/email provider credentials are deferred. Webchat uses short-lived session tokens. |
| Finance basic | Implemented in repo | `/finance`, `/portal/financeiro` | `20260601220000_basic_finance.sql`, `financeService`, `FinanceWorkspace`, `PortalFinanceWorkspace`, `financeRules` | Accounts receivable only. No payment gateway, fiscal issuance, bank reconciliation, or automated billing. Migration/probes still need target DB execution. |
| Support basic | Implemented in repo | `/support`, `/portal/suporte` | `20260601230000_basic_support.sql`, `supportService`, `SupportWorkspace`, `PortalSupportWorkspace`, `supportRules` | Contract-based tickets and messages only. No omnichannel ticket conversion, attachments, FAQ/knowledge base, or advanced SLA calendar. Migration/probes still need target DB execution. |
| CRM Cockpit commercial upgrade | Implemented in repo | `/leads`, `/portal/comercial/leads` | `20260601260000_crm_cockpit_upgrade.sql`, CRM service/UI upgrades, `20260603215128_expose_platform_base_tables_to_data_api.sql` | Adds owner/source/stage commercial cockpit primitives and portal-safe CRM continuation. Loading fallback fixed after `organizations` 401 report. |
| CRM ideal phase 1 commercial cockpit | Implemented in repo | `/leads`, `/portal/comercial/leads` | CRM cockpit schema lineage, `crmCockpitService`, `cockpitRules`, `CockpitTabs`, `TodayWorkQueue`, `Lead360Panel`, `LeadCsvImportPanel` | Adds tabs, filters, Today queue, calendar, sources, CSV preview, tags/import/action schema. Confirm target Postgres schema and authenticated QA. |
| CRM ideal phase 2 WhatsApp AI | Implemented in repo | `/leads`, `/portal/comercial/leads`, `/portal/atendimento/conversas`, `/omnichannel` | CRM conversation schema lineage, `crmConversationService`, `conversationRules`, `LeadConversationPanel`, `LeadAiInsightPanel`, `LeadResponseComposer` | Links leads to conversations, stores CRM AI insights, tracks SLA/handoff and supports response suggestions. Live provider/runtime configuration remains operational. |
| CRM ideal phase 3 proposals closing | Implemented in repo | `/leads`, `/portal/comercial/leads`, `/portal/projetos/aprovacoes`, `/proposals` | CRM closing schema lineage, `crmClosingService`, `closingRules`, `LeadProposalLauncher`, `ProposalRecommendationPanel`, `ClosingChecklistPanel`, `ProposalEventTimeline` | Adds CRM-facing lead-to-proposal-to-contract orchestration, event timeline, follow-ups, objections, conversion-run idempotency and onboarding checklist. Confirm target Postgres migration state. |
| CRM ideal phase 4 attribution and MROI | Implemented in repo | `/leads`, `/reports`, `/portal/relatorios` | Attribution schema lineage, `crmAttributionService`, `attributionRules`, `LeadSourcesDashboard`, `SourceFunnelChart`, `MroiAlertPanel` | Adds normalized sources, attribution events, source rollups, campaign snapshots, revenue, MROI alerts and exports. Confirm target Postgres migration state and portal-safe QA. |
| Sector models / blueprints | Implemented in repo | `/blueprints`, `/contracts`, `/client-conversions` | `20260601270000_sector_funnel_blueprints.sql`, `BlueprintApplyPanel`, `ContractsPage`, `ClientConversionsPage`, blueprint application rules | Provides reusable sector templates and contract application runs. Can be applied globally, from a selected contract or during lead conversion. |
| Landing Pages module | Implemented in repo | `/landing-pages`, `/portal/marketing/landing-pages` | `20260601280000_landing_pages.sql`, `landingPageService`, landing page workspaces | Tracks versions, approvals, visits/leads and portal review surface. |
| Standalone external lead forms | Implemented and locally validated | `/portal/marketing/formularios`, `/client-workspaces/:organizationId/marketing/formularios`, public `POST /api/public/lead-forms/:token/submissions` | `0113_external_lead_forms.sql`, `0114_lead_identity_consent_and_scoring.sql`, `0117_standalone_external_lead_forms.sql`, `0118_external_lead_form_crm_visibility.sql`, lead-form repository/routes, portal workspace and `docs/external-lead-forms.md` | Supports hashed/rotatable tokens, custom field mappings, allowed origins, consent/UTM snapshots, idempotency, CRM routing and forms independent of YUX landing pages. Apply migrations and smoke-test the public domain before production use. |
| Campaigns API-first core | Implemented in repo | `/campaigns`, `/portal/marketing/campanhas` | `20260601290000_campaigns_ads_api_core.sql`, backend function compatibility route, campaign service/workspaces, `backend/src/lib/edge-compat/adsProvider.ts` | API-first campaign draft/provider mutation path now routes through the VPS backend; provider side-effect handlers still need explicit domain hardening beyond compatibility jobs. |
| Real WhatsApp provider path | Implemented and locally validated | `/omnichannel`, `/portal/atendimento/conversas` | Backend webhook route, worker handlers and `backend/src/lib/edge-compat/whatsappProvider.ts` | Meta HMAC validation, tenant lookup, idempotency and official outbound dispatch now run through the Fastify/worker path. Provider credentials and Meta production verification remain operational setup. |
| Internal YUX active prospecting | Implemented and locally validated; production activation pending | Internal Radar workspace, `/api/prospecting/*`, CRM sequences and `/omnichannel` | `0123_active_prospecting_orchestration.sql`, prospecting repository/service/routes, asynchronous Radar worker, Agent Harness live workflow contracts, `ProspectingPlanPanel`, native SMTP2GO/Meta dispatch and WhatsApp AI loop | First contact remains human-approved and WhatsApp requires recorded permission, an active Meta connection and approved template. Apply migration `0123`, configure runtime/provider secrets and pass the staged production smoke test before enabling real outreach. |
| Meta channel connectors | Implemented in repo | `/portal/atendimento/canais`, `/admin/channels` | `20260605110828_meta_channel_connectors.sql`, backend compatibility function route, `metaChannelService`, connected-channel workspaces, `backend/src/lib/edge-compat/metaChannel.ts` | Requires Meta App configuration, App Review permissions, runtime secrets and authenticated production QA. Edge Function source was removed from active code. |
| Configurable AI assistant | Implemented in repo | `/omnichannel` admin | `20260601310000_ai_assistant_settings.sql`, `aiAssistantService`, `AssistantSettingsPanel`, `process-ai-message` | Adds configurable assistant objectives, fields, handoff, safety, knowledge links and sanitized AI run metadata. |
| Company Intelligence hub | Implemented and locally validated; production activation pending | `/portal/empresa/perfil`, `/portal/empresa/conhecimento`, `/portal/empresa/marca`, equivalent Crescimento YUX workspace routes and `/api/company-intelligence/*` | `0125_company_intelligence_hub.sql`, `0126_intelligent_knowledge_pipeline.sql`, `0127_company_visual_identity.sql`, company-intelligence backend module/worker, profile/brand forms, evidence review library, multi-page website onboarding, `CustomerContextService`, WhatsApp guardrail and `docs/company-intelligence-operations.md` | Supports editable company/brand data, manual text, URL and PDF/DOCX/TXT/MD ingestion, conservative cleanup, LLM curation with literal evidence, editable website suggestions, structured visual identity, per-fact review, Jina embeddings, hybrid retrieval, explicit publication, visibility and agent rules. Apply migration `0127`, configure OpenRouter/Jina and execute the authenticated/provider smoke test. |
| Marketing Studio foundation | Implemented | `/marketing-studio`, `/portal/marketing/studio` | `20260605220328_marketing_studio_foundation.sql`, `marketingStudioService`, `MarketingStudioWorkspace`, `PortalMarketingStudioWorkspace`, Marketing Studio domain rules | Adds module shell, navigation, settings, agent templates, ideas, content/version/review workflow, editorial calendar, AI credits and usage ledger. Migration and probe passed remotely on `portal-yux`. |
| Marketing Studio organic content and calendar | Implemented in repo | `/marketing-studio`, `/portal/marketing/studio`, `/portal/marketing/conteudo`, `/portal/marketing/calendario` | `2026-06-06-yux-marketing-studio-organic-calendar.md`, expanded `marketingStudioService`, organic content workspace, portal approval surface, calendar/review/version rules | Adds manual organic content operations, version tracking, review decisions, approval actions and editorial calendar surfaces. LangGraph, RAG, Radar, WordPress publishing and AI generation remain follow-up phases. |
| Marketing Studio knowledge and RAG | Implemented and locally validated | `/marketing-studio`, `/portal/marketing/studio`, `/portal/empresa/conhecimento`, `/portal/empresa/marca` | Company Intelligence API/worker, `0126_intelligent_knowledge_pipeline.sql`, Python `CustomerContextService`, Jina query/passage embeddings, hybrid ranking and Strategy Packs | Published, approved organization knowledge is tenant-filtered and merged centrally with Strategy Packs for agent workflows. Semantic vectors are stored in JSONB so pgvector is not required; retrieval combines vector similarity, text relevance and quality with safe text fallback. VPS migration, shared storage and provider smoke tests remain required. |
| Marketing Studio LangGraph runtime and harness | Implemented | `/marketing-studio` | `20260607000807_yux_agent_harness_langgraph.sql`, `2026-06-06-yux-agent-harness-langgraph.md`, worker `workers/marketing-studio-agent-runtime`, Marketing Studio agent/workflow service methods, internal harness panel | Adds YUX-admin global system prompts, client/YUX editable agent prompts/defaults, workflow definitions, workflow/agent/tool run logs, budget policies, model routing and tool policies. Migration and probe passed remotely. Runtime is now extended by the broader YUX Agent Harness Runtime for central trace, autonomy, workflows and learning. |
| Marketing Studio Radar and research | Implemented | `/marketing-studio`, `/admin/integrations` | `20260607003007_marketing_studio_radar_research.sql`, `20260607003928_yux_hub_jina_provider_defaults.sql`, `2026-06-07-yux-marketing-studio-radar-research.md`, worker Jina Reader/Search request builders, source item/radar service methods, internal Radar panel, Jina AI global provider defaults | Adds controlled source items, research cache, Radar runs, dedupe keys, opportunity scores, typed conversion from captured source item to idea, and Admin YUX global Jina configuration fields. Radar and Jina provider migrations/probes passed remotely. Live scheduled jobs and provider credentials remain follow-up operational work. |
| Marketing Studio writing, review and grounding | Implemented | `/marketing-studio` | `20260607141134_marketing_studio_writing_review_grounding.sql`, `2026-06-07-yux-marketing-studio-writing-review-grounding.md`, worker writing/review contracts, generation run and quality check service methods, internal writing/review/grounding panel, worker `OpenRouterClient` and `JinaClient` | Adds Redator Multicanal and Revisor de Marca contracts, generated draft logs, quality checklist, risk flags, grounding-required state and internal pipeline visibility. Migration and probe passed remotely. Worker now supports native OpenRouter chat completion and Jina Reader/Search/Grounding using server-side secrets. |
| Marketing Studio WordPress publishing | Implemented and locally validated | `/marketing-studio` | Backend worker publishing handler, encrypted provider secrets and SSRF guard | Draft and publication runs use the backend worker and require an HTTPS public WordPress endpoint. Production still needs each client credential and VPS deploy verification. |
| Marketing Studio campaign creatives and drafts | Implemented | `/marketing-studio` | `20260607152544_marketing_studio_campaign_creatives.sql`, campaign creative suggestion and draft run service methods, internal campaign creative panel, worker campaign strategist helpers | Adds campaign creative suggestions for Meta/Google-style briefs, copy variations, creative concepts, targeting suggestions, approval states, landing page/campaign links and idempotent campaign draft runs. Migration and probe passed remotely. |
| Marketing Studio native Meta/Google integrations | Implemented and locally validated | `/marketing-studio`, `/campaigns`, `/api/functions/*` | Backend OAuth routes, worker handlers, encrypted provider secrets and approval gates | OAuth state is persisted, redirects are allowlisted, provider tokens are encrypted and approved mutations/publishing execute in the worker. External provider credentials and production callbacks still require configuration. |
| YUX Strategy Engine | Implemented in repo, pending VPS DB migration/probe confirmation | `/admin/strategy-engine`, `/client-workspaces`, CRM/Omnichannel/Marketing Studio/Reports surfaces | `0105_strategy_packs_yux_workspace.sql`, `strategy-knowledge` scripts, worker `retrieval.py`/`strategy.py`, `strategyEngineService`, `StrategyEnginePage`, `StrategyAdminChatPanel`, `StrategyPacksPanel`, `StrategyContextPanel`, `process-ai-message` role routing | Adds internal doctrine, skills, profile policies, Strategy Packs, guided ingestion jobs, curated pack items, pack bindings, multi-assistant routing, internal Growth Strategist chat, Metrics & Cash, Objection Intelligence, CRM Controller rules, handoffs, recommendations and outcome/learning records. Apply the backend Postgres migration before production claims. |
| YUX Agent Harness Runtime | Implemented and locally validated | `/admin/strategy-engine`, `/omnichannel` and Strategy Admin chat | PostgreSQL runtime store, queue, workflow, trace, autonomy and retrieval modules | Runtime requires its bearer token and Postgres, validates tenant context, uses `SKIP LOCKED`, keeps traces PII-minimized and applies worker retention. VPS deployment confirmation remains separate. |
| Flow Builder Lite (initial) | Implemented in repo | `/automations` | `20260601320000_flow_builder_lite.sql`, `automationService`, `AutomationWorkspace`, `dispatch-crm-automation` | Initial trigger/condition/action flows and execution history. Later evolved into full Intelligent Automations Workspace. |
| Intelligent automations and SMTP2GO email hub | Implemented in repo | `/automations` | `20260604050000_intelligent_automations_foundation.sql`, `20260604060000_automation_sequences.sql`, `20260604070000_smtp2go_email_hub.sql`, `20260604080000_automation_sector_templates.sql`, backend automation routes/jobs, `automationService`, `automationSequenceService`, `emailDeliveryRules`, `AutomationWorkspace`, `SequencesWorkspace` timeline | Full automation workspace with visual builder, simulation, templates, versioning, bulk operations, dashboard, CRM/IA previews, audit trail, CRM sequences and VPS material storage. Runtime now targets backend routes/jobs instead of Edge Functions. |
| Integrated lead orchestration foundation | Implemented and locally validated | Backend/worker; surfaced through forms, CRM, automations and sequences | `0119_lead_orchestration_foundation.sql`, `0120_crm_pipeline_management.sql`, `0121_crm_task_center.sql`, `0122_lead_scoring_rules.sql`, domain-event outbox/delivery ledger, pipeline/task repositories, scoring engine, automation runtime and SMTP2GO delivery/webhook services | Fans one event out to independent automation and scoring consumers with retries, idempotency, version snapshots, re-entry controls, correlation and loop protection. Funis, central de tarefas e scoring por ações estão disponíveis no portal do cliente e conectados ao outbox. |
| Visual Node Editor & Materials Library | Implemented in repo | `/automations`, `/admin/limits` | `20260604220000_automation_graph_and_materials.sql`, `AutomationNodeEditor`, `NodeConfigSidebar`, `MaterialLibraryDialog`, `AdminLimitsPage`, `automationService`, `adminPlatformService` | Visual node-based automation flow editor (React Flow), branched flow traversal (parallel execution), dynamic file attachments (email/WhatsApp) integrated with multitenant Materials Library storage, and administrative interface to configure global and client limits. |
| Growth Workspace orchestration | Implemented and locally validated | `/leads`, `/campaigns`, `/automations`, `/reports`, portal/workspace routes | `20260608130000_growth_workspace_foundation.sql`, `growthWorkspaceService`, `record360Rules`, `campaignPlanRules`, `onboardingRules`, `templateRules`, Growth Workspace components | Connects Registro 360, Campanha 360, sector onboarding, Central da Marca, template library, smart segments, guided automations and executive Ads/MROI reporting into one commercial journey. |
| Operational reports and MROI | Implemented and locally validated | `/reports`, `/portal/relatorios` | `20260601330000_operational_reports.sql`, `reportService`, `reportRules`, report workspaces, `CampaignMetricsPanel` | Aggregates funnel, campaign, landing page, proposal, conversation, project and activity metrics with portal-safe output, report presets, AI insight summary and executive Ads/MROI cockpit. |
| Portal dashboard and next actions | Implemented in repo | `/portal`, `/client-workspaces/:organizationId` | `PortalDashboardPage`, `usePortalActionSummary`, `usePortalWorkspacePath`, navigation rules/tests | Dashboard highlights active contract, module summaries and fixed approval shortcut. Next actions aggregate approvals, marketing reviews, CRM follow-ups, projects and finance. |
| Deploy and CI hardening | Implemented in repo | N/A | `docs/phase-8-deploy-hardening.md`, `DEPLOY-DOKPLOY-VPS.md`, `docker-compose.dokploy.yml` | Production target is now VPS/Dokploy with self-hosted backend, Postgres and Redis. Vercel configs and Vercel deploy docs were removed from the active path. |

## Changes Since The Previous Documentation Boundary

The previous content boundary was commit `a8728d0` on 2026-07-10. The items
below were verified against the current source and tests; planning-only commits
are listed separately and are not counted as implemented scope.

### Mission Supervisor Safety, Foundation And Decision Experience

Implemented and locally validated in the repository:

- the Harness proposes typed, knowledge-grounded plans while the TypeScript
  Action Engine compiles and executes only published capabilities/packs;
- context snapshots, exact capability manifests, claims/fencing, provider
  unknown-effect reconciliation, planning budgets, attribution and mutation
  leases preserve the approval-to-execution trust boundary;
- conversational intake is capped at three grouped questions and uses visible
  Company Context provenance;
- decision UI renders concrete changes, contact impact, economics, assumptions
  and irreversible effects before approval, with technical proof behind
  progressive disclosure;
- pending decisions support deduplicated in-product/e-mail/consented WhatsApp
  delivery, immutable redacted shadow report/PDF sharing and external feedback
  that cannot grant execution authority;
- rejection taxonomy is append-only and privacy-redacted; budget burn-down emits
  unique 50/80/95% alerts per envelope version; readiness links are allowlisted
  and permission-filtered; exact capability versions can be paused with an audit
  reason while unrelated capabilities remain active;
- independent flags can contain decisions, notifications, simulation reports or
  feedback without deleting existing evidence.

Operationally pending: deploy the branch, apply migrations `0128`–`0142`,
configure backend/worker/Harness and provider channels, run authenticated admin,
client-owner and external-review acceptance, record real IDs/NFR samples and
rehearse the release runbooks. Composite missions and bounded autonomy
(Releases 4–5) remain planned and must not be claimed as implemented.

### Security And Tenant Isolation Reverification

Implemented after the previous boundary:

- tenant/membership checks for support messages and ticket mutations,
  omnichannel outbound approval/retry and scoped provider/campaign data;
- internal-only raw finance, support and operational-report endpoints, keeping
  portal callers on sanitized DTOs;
- forced RLS policy for `support_messages` through migration `0112`;
- server-side Agent Harness credit estimation and reservation, ignoring
  caller-supplied credit estimates;
- expanded trace/event/message PII retention purge, sanitized subagent traces,
  attachment magic-byte validation and scheduled Google token refresh;
- startup validation requiring `N8N_WEBHOOK_SECRET` whenever the CRM webhook is
  configured, plus negative multitenant regression coverage.

These are repository guarantees. They do not replace migration application,
secret configuration or authenticated production penetration/smoke testing.

### Authentication, Invitation And CRM Provisioning Stabilization

Implemented:

- persisted frontend sessions are revalidated against the backend during app
  startup; an invalid/expired session is cleared before protected routes load;
- client creation and access-email resend now distinguish successful client
  persistence from SMTP2GO invitation delivery failure and expose a useful
  operator message;
- linked client and portal-user e-mails are synchronized only when the
  relationship is unambiguous and the target e-mail is not already in use;
- active contracts with the CRM module create/reconcile a governed CRM instance;
  an instance becomes active when an active pipeline exists and is paused when
  entitlement is removed;
- CRM governance context is resolved through backend membership/contract checks
  rather than frontend generic-table queries, including the operator path used
  by assisted client workspaces.

### External Lead Capture

Implemented:

- public JSON and form-urlencoded submissions with per-form rate limiting,
  hashed/rotatable tokens, `Idempotency-Key` and optional external submission ID;
- forms tied to a YUX landing page or standalone forms owned directly by a
  client contract, managed at `marketing/formularios`;
- per-client field mappings, required-field validation, allowed origins,
  consent/policy versions, UTM/referrer/language snapshots and custom CRM values;
- lead deduplication by normalized identity, attribution history and routing to
  an active CRM pipeline/stage with correct CRM-instance visibility;
- atomic `lead.created` (new identity only) and `form.submitted` (every distinct
  accepted submission) events, with sanitized payloads available to automations.

See `docs/external-lead-forms.md` for the integration contract.

### Transactional Lead Orchestration

Implemented in migration `0119` and the Fastify/BullMQ worker:

- transactional `domain_events` outbox and per-consumer delivery ledger;
- event catalog for lead, form, stage/owner/task/interaction, sequence, e-mail
  lifecycle and score events;
- dispatcher scheduled every five seconds, claiming up to 100 events and
  delivering automation and scoring consumers independently;
- published-flow snapshot matching, conditions, per-flow execution runs,
  independent retry/failure, daily limits, re-entry cooldown, correlation,
  maximum depth, automation trace and idempotent action effects;
- native CRM commands for pipeline/stage moves, owner assignment, tasks,
  activities, allowed field updates, sequence enrollment/pause, tags and manual
  score adjustment; core CRM sequence e-mail and WhatsApp delivery now use the
  native SMTP2GO and Omnichannel/Meta workers. The signed n8n adapter remains
  only for explicit custom integration actions;
- CRM sequence execution with idempotent tasks, published e-mail templates,
  server-side suppression/quota checks, SMTP2GO sending and signed delivery,
  open, click, bounce, complaint and unsubscribe webhook events.

### Internal YUX Active Prospecting

Implemented in the current local delivery:

- migration `0123_active_prospecting_orchestration.sql` adds the internal,
  forced-RLS prospecting policy, channel-permission ledger and prospecting-plan
  state, while extending the existing Radar and CRM sequence structures;
- policy resolution rechecks the kill switch, legal-review gate, quiet hours,
  opt-out, daily/per-lead attempt limits, recorded channel permission and active
  WhatsApp connection before approval, start and every outbound sequence step;
- the Radar no longer presents the fixed score/diagnostic as a successful AI
  analysis: it creates an idempotent asynchronous analysis run, invokes the
  tenant-scoped Agent Harness and persists only schema-validated results and
  trace identifiers;
- the Python runtime now builds its Harness from PostgreSQL configuration,
  applies tenant-scoped profiles, prompts, routes, tool/budget policies and RAG,
  calls OpenRouter for Radar and conversation contracts, and does not replace a
  provider failure with a canned successful analysis;
- a converted Radar opportunity can be turned into one governed plan, explicitly
  approved by a YUX operator and enrolled once in an existing CRM sequence;
- CRM sequence e-mail remains native through SMTP2GO and WhatsApp now creates an
  Omnichannel message/job for the Meta Cloud API, including approved template
  name, language and components instead of using n8n for the core path;
- inbound WhatsApp persistence invokes the conversation workflow in the retryable
  worker, stores the AI response with classification, qualification, policy and
  runtime trace metadata, queues only approved automatic decisions and sends
  blocked/high-risk decisions to the human handoff queue. Conversations in
  assisted mode always wait for human approval even if the agent recommends
  auto-send, and runtime unavailability also forces handoff;
- the Radar frontend polls asynchronous analysis state and exposes the policy,
  permission evidence, sequence choice, plan approval and start controls without
  enabling silent first-contact auto-send.

Repository limitations that still prevent a production-operational claim:

- migration `0123` was not applied to a live/local Postgres instance in this
  session because Docker was unavailable;
- no live OpenRouter, SMTP2GO or Meta WhatsApp request was made with production
  credentials, and no approved Meta test template/recipient was exercised;
- deployment health, worker scheduling, webhook callbacks and a canary with real
  provider delivery remain mandatory before outreach is enabled;
- advanced prospecting operations reporting, automatic retention/deletion of
  cold-prospect source data and a dedicated cross-module journey timeline remain
  follow-up hardening, not prerequisites silently reported as complete.

### Final Compatibility Audit: Funis, Tasks And Scoring

These modules were implemented in a separate workstream and were not modified by
the active-prospecting delivery. The final read-only compatibility audit found:

- Funis: backend create/update/stage/reorder routes, role/customization guards,
  portal page, editor and summary board are connected to `crmService`;
- Central de Tarefas: aggregate listing/filtering, create/update, explicit
  complete/cancel/reopen transitions, lead next-action refresh and portal page
  are connected;
- Scoring: fit/intent model, editable event rules, append-only score history,
  simulation, manual adjustment and outbox consumer are connected to the portal;
- the focused backend audit passed `31/31` tests and the focused frontend audit
  passed `40/40` tests. No compatibility defect with prospecting was found.

This confirms repository integration. Migration `0120` through `0122` and an
authenticated browser/database smoke test are still required before calling the
three modules operational in the target VPS.

Not implemented in this phase:

- a first-class operations UI for the outbox, dead letters and event replay;
- deeper scoring analytics and bulk rule import beyond the client-facing
  configuration and simulation surface.

## Growth Workspace Reorganization Status

Implemented and locally validated through Phase 7:

- Registro 360: lead detail now has a unified record shell with identity,
  quick actions, tabs, associations, activities and intelligence.
- Campanha 360: campaigns can start from an objective and expose a checklist
  for segment, landing page, form, creative, ad, post, follow-up, automation,
  approval and report.
- Sector onboarding: Modelos Setoriais can generate onboarding checklists and
  preview the expected implementation work.
- Central da Marca: brand readiness and knowledge readiness are visible in the
  company/marketing journey and surface gaps for Marketing Studio, IA,
  campaigns and landing pages. Company Profile, Brand/Voice and the Knowledge
  Base now also provide edit, import/upload, review and publication operations.
- Template library: templates are filterable by sector, objective, module,
  channel, required module, portal visibility and campaign step.
- Smart segments: CRM/leads can build source/stage/status/owner/activity/
  campaign/score/proposal-status segments with estimated size and actions.
- Guided automations: the automation workspace starts from business objectives
  such as responder lead novo, follow-up de proposta, reativar cliente,
  confirmar agendamento, alerta de CPL alto and aprovacao de criativo.
- Executive Ads/MROI cockpit: campaigns and reports now show spend,
  impressions, clicks, leads, CPL, opportunities, proposals, clients, revenue,
  MROI, sync health, report presets and AI insight summaries.

Phase-by-phase status:

| Phase | Product outcome | Status |
| --- | --- | --- |
| 1. Registro 360 foundation | Lead/contact record with identity, quick actions, tabs, associations and intelligence | Implemented |
| 2. Unified activity and associations | Cross-module timeline and related objects around the record | Implemented |
| 3. Campanha 360 | Objective-first campaign plan with checklist of funnel assets | Implemented |
| 4. Sector onboarding | Modelos Setoriais generate onboarding/checklist context for clients/contracts | Implemented |
| 5. Central da Marca | Brand readiness and knowledge readiness for IA, Studio, campaigns and landing pages | Implemented |
| 6. Segments, automations and templates | Smart segments, guided automation objectives and template library | Implemented |
| 7. Ads/MROI cockpit and reports | Executive campaign metrics, report presets, AI insight summary and launch QA | Implemented and locally validated |

## Growth Workspace Operational Notes

- configure Meta App IDs, Embedded Signup config, App Review permissions and
  runtime secrets;
- route Meta callbacks to the Fastify backend webhook and keep the backend
  worker running; active production traffic must not target the archived Edge
  Function path;
- validate WhatsApp Embedded Signup, Instagram Direct and Messenger with
  development-mode test assets before production;
- configure per-client WordPress application-password secrets referenced by
  `publishing_connections.token_reference` before executing live blog posts;
- configure native Marketing Studio runtime secrets for Meta/Google OAuth,
  Google Ads developer token and provider secret encryption before live posting
  or ad activation;
- complete Meta App Review, Google OAuth consent setup and redirect URL
  registration before client tenants authorize their accounts;
- confirm/apply the current backend Postgres migration history, including
  `0105_strategy_packs_yux_workspace.sql`, before treating Strategy Packs, the
  pinned `Crescimento YUX` workspace and contextual harness panels as
  production-confirmed;
- confirm the older Strategy Engine/Harness schema already exists in the target
  VPS/Postgres database before treating Strategy Engine, workflow traces and
  Active Learning records as production-confirmed;
- deploy and configure the YUX Agent Harness Runtime on VPS/Dokploy before
  treating WhatsApp/Strategy Admin runtime execution as operational instead of
  fallback-only.

The consolidated deployment checklist, including migrations `0112` through
`0119`, appears in the final Pending Operational Work section.

## Implemented Functional Scope

### Admin YUX Hub

Implemented:

- sidebar interna reorganizada por Visao Geral, Clientes & Contratos,
  Operacao, Workspaces dos Clientes, Administracao da Plataforma e Financeiro;
- mini area "Comercial YUX" removida para evitar CRM paralelo e menor que o
  produto; a propria YUX deve operar vendas, marketing e atendimento por um
  workspace cliente YUX/Crescimento YUX;
- logo interno atualizado para YUX Hub;
- painel central `/admin` com resumo administrativo e atalhos;
- entrada `/client-workspaces` para selecao obrigatoria do cliente antes de
  operar qualquer area de cliente;
- entrada `/client-conversions` em Clientes & Contratos para transformar lead
  fechado em cliente, organizacao, contrato e historico administrativo;
- modo `client_workspace` com logo "Workspace Cliente", banner "Operando como
  cliente", troca de cliente e breadcrumbs separados do portal real;
- schema administrativo para limites por modulo, provedores globais,
  integracoes por cliente, uso e auditoria;
- `adminPlatformService` com mappers, resumo do Admin Hub, SMTP2GO, limites,
  provedores, uso e auditoria;
- pagina `/admin/integrations` para provedores globais;
- pagina `/admin/channels` para governanca global de canais Meta por cliente;
- pagina `/admin/email` para indicadores SMTP2GO;
- pagina `/admin/ai` para governanca IA/LLM;
- pagina `/admin/modules-governance` para CRM, Automacoes, Financeiro, Suporte,
  Email e IA;
- pagina `/admin/health` para provedores com falha, limites em atencao,
  auditoria recente e clientes impactados;
- painel de limites por modulo dentro de contratos;
- aplicacao de Modelos Setoriais diretamente no contrato selecionado;
- documentacao operacional em `docs/admin-yux-hub.md`.

Not complete:

- target Supabase application of `20260604203319_yux_hub_admin_platform.sql`;
- CRUD completo de provedores, credenciais e limites;
- testes de conexao de provedores via edge functions;
- provisionamento automatico de subcontas SMTP2GO;
- politicas comerciais completas de custo/credito de IA por cliente;
- alertas ativos e notificacoes administrativas.

### Platform Foundation

Implemented:

- organizations, roles, memberships, permissions;
- package and module definitions;
- contracts and contract modules;
- module registry and navigation rules;
- portal context derived from the active contract;
- shared Supabase service patterns and platform store.

Not complete:

- a single production-ready admin workflow for every platform primitive;
- full cleanup of legacy `apiService` assumptions.

### Contracts And Portal

Implemented:

- internal contract/package/module screens;
- active contract lookup for portal users;
- portal dashboard and module visibility derived from contract modules;
- portal organized by customer journeys instead of technical module names:
  Empresa, Comercial, Atendimento & IA, Marketing, Automacoes, Projetos,
  Relatorios, Suporte, Financeiro and Configuracoes da Conta;
- legacy portal module routes redirect to the new journey routes, for example
  `/portal/crm` to `/portal/comercial/leads`, `/portal/omnichannel` to
  `/portal/atendimento/conversas`, `/portal/marketing-studio` to
  `/portal/marketing/studio` and `/portal/reports` to `/portal/relatorios`;
- reusable portal path helper so pages also work inside
  `/client-workspaces/:organizationId/*` without leaking links back to
  `/portal`;
- RLS hardening for portal access.

Not complete:

- production confirmation that every migration has been applied to the target
  Supabase instance;
- browser-level verification with authenticated production users after latest
  finance/support migrations.

### Portal By Journeys And Client Workspaces

Implemented:

- new portal menu groups: Visao Geral, Empresa, Comercial, Atendimento & IA,
  Marketing, Automacoes, Projetos, Relatorios, Suporte, Financeiro and
  Configuracoes da Conta;
- Empresa pages for Perfil da Empresa, Usuarios e Equipe, Base de Conhecimento,
  Marca e Tom de Voz and Integracoes;
- Comercial pages for Leads, Empresas / Contas, Funis and Tarefas e
  Follow-ups;
- Atendimento & IA pages for Conversas, Agente IA, Canais and Filas e Handoff;
- Marketing pages for Landing Pages, Campanhas, Marketing Studio, Conteudo
  Organico, Calendario Editorial and Criativos e Assets;
- Automacoes safe-state pages for Fluxos, Templates, Execucoes and Logs;
- Projetos pages for Projetos, Aprovacoes and Documentos;
- direct routes for Relatorios, Suporte, Financeiro and Configuracoes da Conta;
- dashboard shortcut for Pendencias de Aprovacao;
- shared Base de Conhecimento positioning as the source for Agente IA,
  Marketing Studio, respostas sugeridas, campanhas, landing pages, FAQ and
  suporte;
- admin workspace selector listing client organizations with active contracts;
- selected client workspace loading active contract, enabled modules and a
  client-admin-like operating role before rendering the portal-like routes.

Not complete:

- full CRUD for every new customer-facing placeholder surface;
- production-level authenticated QA for all client tenants and role variations;
- final product copy review for all Portuguese labels after encoding cleanup.

### Lead-To-Client Conversion Bridge

Implemented:

- route `/client-conversions` inside Clientes & Contratos;
- loads client workspaces as possible commercial sources, with preference for a
  YUX-named workspace when available;
- loads CRM leads from the selected source workspace;
- pre-fills client and contract fields from the selected lead;
- creates an official client record in `clients`;
- creates/reuses the client organization in `organizations`;
- creates an active contract in `contracts`;
- enables package modules when no blueprint is selected;
- optionally applies a selected sector model/blueprint to the new contract;
- updates the source lead as won/converted and stores `converted_to_client_id`;
- records a lead activity that ties the conversion back to the administrative
  client/contract.

Not complete:

- dedicated conversion audit table with first-class attribution fields;
- automated conversion from approved proposal without user review in this page;
- production QA against all RLS variants for internal roles and old client
  records without organizations.

### Projects, Deliverables, And Approvals

Implemented:

- project listing and management;
- project phases and tasks;
- deliverables;
- approval requests and decisions;
- client-visible project portal;
- timeline entries with portal filtering;
- approval validation rules and tests.

Not complete:

- advanced document storage/review workflows;
- notifications beyond recorded timeline/activity state.

### CRM And Automation Foundation

Implemented:

- CRM pipeline/follow-up primitives;
- lead interaction support required by later automation;
- client CRM portal enablement;
- follow-up rules and tests;
- n8n-oriented boundaries without coupling the frontend to provider execution;
- standalone and landing-page-bound external lead capture with CRM routing;
- transactional domain-event outbox, independent delivery ledger and worker
  fan-out to automations and the preparatory scoring consumer;
- real automation command adapters for CRM mutations, sequence enrollment,
  task/activity creation, tags and controlled score adjustments;
- native CRM sequence task/e-mail execution and SMTP2GO delivery events.

Not complete:

- complete live provider integrations;
- full outbound automation execution UI for every workflow type;
- action-based scoring rules/thresholds and automatic qualification;
- centralized task-management UI and operational event/dead-letter console.

### CRM Governed By Contract

Implemented:

- CRM instance per active CRM contract;
- contracted limits for sellers, managers and client admins;
- CRM members with seller, manager, client admin and YUX admin roles;
- commercial teams and team memberships;
- versionable pipeline/stage/custom-field/category/loss-reason structures;
- configuration drafts, publications, migration runs and audit events;
- RLS helpers for instance access, member role, team access and lead visibility;
- explicit Data API grants for the new governance tables;
- domain rules for seat limits, lead visibility and publication migration;
- typed `crmGovernanceService`;
- internal YUX governance surface at `/crm-governance`;
- client settings surface moved from legacy `/portal/crm/settings` to the
  customer journey route `/portal/empresa/usuarios`;
- CRM workspace state for clients without active CRM instance;
- seller and manager workspace titles;
- backend governance-context endpoint with contract/membership enforcement;
- automatic CRM-instance creation/reconciliation when an active contract has
  the CRM module, activation after pipeline configuration and pause after
  entitlement removal.

Not complete:

- confirmation/application of the current CRM governance and reconciliation
  migrations in the target VPS/Postgres database;
- full CRUD forms for every governance entity;
- richer invitation lifecycle/audit beyond the implemented SMTP2GO delivery
  status and resend feedback;
- advanced sales dashboard by seller/team;
- behavioral scoring and the planned functional-funnel/task-center expansion.

### CRM Ideal Phase 1 Commercial Cockpit

Implemented:

- CRM cockpit tabs: Kanban, Lista, Hoje, Calendario and Fontes;
- advanced lead filters for search, stage, source, temperature and stalled
  opportunities;
- Today work queue ranked by follow-up, temperature, urgency and stage age;
- lead 360 panel with profile, next actions, tasks and timeline;
- CSV import preview with valid/invalid row counts;
- source summary inside the CRM workspace;
- domain rules for stage age, stalled leads, next-day ranking, loss reason
  requirement, duplicate detection, CSV preview and saved-view filtering;
- `crmCockpitService` for snapshots, saved views, imports, stage history, tags
  and next actions;
- Supabase migration/probe for `lead_stage_history`, `lead_tags`,
  `lead_tag_assignments`, `lead_loss_reasons`, `lead_duplicates`,
  `lead_saved_views`, `lead_imports`, `lead_import_rows`, `lead_next_actions`
  and `crm_activity_calendar_entries`.

Not complete:

- target Supabase application of `20260604010000_crm_commercial_cockpit.sql`;
- target probe execution for `supabase/probes/20260604010000_crm_commercial_cockpit.sql`;
- drag-and-drop enhancements beyond the existing Kanban move behavior;
- fully persisted CSV execution UI with file upload storage;
- AI-based next best action, which belongs to CRM ideal phase 2.

### CRM Ideal Phase 2 WhatsApp AI

Implemented:

- domain types for CRM AI, lead-conversation links, insights, field
  suggestions, response suggestions, SLA events, handoff locks, quick replies
  and message templates;
- pure rules for phone normalization, lead-conversation match scoring,
  conversation-to-lead creation decision, human handoff automation pause, SLA
  breach detection, template opt-in blocking and confirmed AI field patches;
- Supabase migration/probe for `lead_conversation_links`, `lead_ai_insights`,
  `lead_ai_field_suggestions`, `lead_response_suggestions`, `lead_sla_events`,
  `lead_handoff_locks`, `crm_quick_replies` and `crm_message_templates`;
- `crmConversationService` for matching, linking, creating leads from
  conversations, insights, response suggestions and handoff locks;
- Lead 360 panels for conversations, AI insight, response composer and SLA;
- `process-ai-message` persistence of CRM AI insight metadata when the
  conversation is linked to a governed CRM lead.

Not complete:

- target Supabase application of `20260604020000_crm_whatsapp_ai.sql`;
- target probe execution for `supabase/probes/20260604020000_crm_whatsapp_ai.sql`;
- production provider credentials/workflows for Meta WhatsApp and n8n;
- operational QA with authenticated users after the migration is applied.

### CRM Ideal Phase 3 Proposals Closing

Implemented:

- domain types for proposal recommendations, proposal events, follow-up tasks,
  objections, closing checklists, CRM conversion runs and onboarding checklists;
- pure rules for package recommendation, proposal creation permission,
  proposal draft from lead, closing approval requirement, conversion plan and
  retryable failure detection;
- Supabase migration/probe for `lead_proposal_recommendations`,
  `proposal_view_events`, `proposal_follow_up_tasks`, `proposal_objections`,
  `proposal_closing_checklists`, `client_onboarding_checklists` and
  `client_onboarding_tasks`;
- extension of `proposal_conversion_runs`, `proposals`, `contracts`,
  `projects` and optional `invoices` with CRM closing references;
- `crmClosingService` for lead proposal context, proposal creation, events,
  objections, follow-ups, closing checklist and conversion retry;
- CRM UI panels for launching proposals, package recommendations, closing
  checklist and proposal timeline;
- `LeadCommercialPanel` now uses the new CRM closing panels while preserving
  existing proposal listing.

Not complete:

- target Supabase application of `20260604030000_crm_proposals_closing.sql`;
- target probe execution for `supabase/probes/20260604030000_crm_proposals_closing.sql`;
- authenticated QA for proposal conversion against the target environment;
- deeper finance automation beyond source proposal references.

### CRM Ideal Phase 4 Attribution And MROI

Implemented:

- domain types for lead sources, attribution events, source rollups, campaign
  CRM snapshots, revenue attribution, MROI alerts and CSV exports;
- pure rules for UTM normalization, primary source derivation, CPL, conversion,
  MROI, portal sanitization and explainable alerts;
- Supabase migration/probe for `lead_sources`, `lead_attribution_events`,
  `lead_source_rollups`, `campaign_crm_performance_snapshots`,
  `crm_revenue_attribution`, `crm_mroi_alerts` and `crm_report_exports`;
- extensions for `leads.primary_source_id`, `leads.source_confidence`,
  `campaigns.crm_performance_status`, `landing_pages.crm_source_id`,
  `proposals.source_lead_id` and optional `invoices.source_lead_id`;
- `crmAttributionService` for recording attribution, dashboard reads, source
  funnel, campaign MROI, portal-safe MROI, alerts and CSV exports;
- CRM Fontes tab now renders `LeadSourcesDashboard` with funnel chart, MROI
  alerts, source table and fallback data derived from loaded leads;
- internal reports render CRM attribution when source rollups are available;
- portal reports render sanitized attribution without internal media/operational
  cost fields.

Not complete:

- target Supabase application of `20260604040000_crm_attribution_mroi.sql`;
- target probe execution for `supabase/probes/20260604040000_crm_attribution_mroi.sql`;
- local Supabase reset/probe in this Windows session because Docker Desktop was
  unavailable;
- scheduled aggregation jobs for continuously refreshing rollups/snapshots;
- production QA with real campaign, landing page, proposal and finance data.

### Intelligent Automations Workspace

Implemented:

- full CRUD for automation flows, triggers, conditions and actions;
- visual builder with When/If/Then paradigm and interactive editors;
- trigger picker grouped by module (9 modules, 15 triggers);
- condition builder with field/operator/value and 6 operators;
- action builder with 13 action types and type-specific payload forms;
- flow selection in sidebar with search, status filter and status counts;
- flow duplicate and delete operations;
- flow publish with automatic version creation;
- automation dashboard with metrics cards (active flows, executions, success rate, last error);
- dashboard charts: pie chart for status distribution, bar chart for top 5 flows;
- simulation panel with event picker, JSON payload editor and local dry-run;
- simulation result display with trigger match, condition results, planned actions;
- simulation persistence in `automation_simulation_runs`;
- sector template catalog (clinic, real_estate, dealer, workshop, agency);
- template preview in creation dialog with block counts;
- create flow from template with auto-populated triggers/conditions/actions;
- flow versioning panel with history, active version badge and rollback;
- bulk operations with checkbox selection, bulk enable/disable/delete;
- CRM integration preview for change_stage, assign_owner, create_task;
- AI action preview for ai_classify_lead, ai_generate_message, ai_generate_proposal;
- audit trail with creation date, last update, published version, sector template;
- real-time execution updates via Supabase Realtime;
- dry-run mode toggle per flow using risk_level 'test';
- execution timeline with expandable details, duration, retry button;
- risk assessment display (low/medium/high/test);
- domain rules for simulation, trigger matching, condition evaluation;
- typed `automationService` with full CRUD and version/simulation methods;
- **P0: Drag-and-drop action reordering** in the builder with native HTML5 drag events;
- **P0: Real-time validation** with errors/warnings for triggers, conditions, actions and full flows;
- **P0: Confirmation dialogs** for destructive operations (delete, publish) with destructive variant;
- **P1: First-time onboarding** with 3-step guided tour explaining When/If/Then paradigm;
- **P1: Timeline visualization** for sequences showing steps chronologically with delay indicators;
- **P1: Tooltips** on builder step headers for better field explanation;
- **Visual Node Editor:** canvas built with `@xyflow/react` allowing layout customization, nodes addition, triggers, conditions, and actions matching backend logic;
- **Parallel Branch Execution:** Edge Function engine updated to traversal visual nodes graph concurrently (`Promise.all`);
- **Materials Library:** multitenant file storage bucket and registry with public download/restricted upload RLS policies, allowing files upload or select to attach to WhatsApp/Email steps;
- **Upload Size Governance:** dynamic resolution of max file upload limit from global configuration (`system_config`) or client specific custom setting (`omnichannel_settings`);
- **Admin limits dashboard:** `/admin/limits` hub view allowing YUX Admins to edit global max size and overrides per organization.

Not complete:

- target Supabase application of automation migrations (already listed in pending operational work);
- flow import/export beyond sector templates;
- advanced version diff comparison (current implementation shows version list only).

### Commercial Proposals And Conversion

Implemented:

- proposal records and versions;
- editable proposal UI;
- public proposal review route;
- portal proposal surface;
- proposal approval/adjustment/rejection flow;
- conversion support into client/contract/project records;
- proposal conversion transaction hardening;
- proposal service and tests.

Not complete:

- production AI provider configuration and billing governance;
- full template management UI beyond implemented proposal workflow.

### Omnichannel AI

Implemented:

- provider-neutral channel connections;
- contacts, conversations, messages, handoff rules, handoff events;
- outbound run tracking;
- AI run cost/status tracking;
- CRM sync run tracking;
- knowledge source/publication primitives;
- webchat widget bootstrap and short-lived webchat sessions;
- internal and portal omnichannel workspaces;
- channel simulator and admin tabs;
- shared Edge Function helpers and tests.

Not complete:

- live WhatsApp, Instagram, email provider credentials and adapters;
- production n8n workflows;
- production queue/team operating procedures;
- final attachment retention/storage policy execution.

### YUX Strategy Engine And Agent Harness

Implemented:

- internal Strategy Engine area at `/admin/strategy-engine` for platform admin
  governance of agent profiles, skills, Strategy Packs, concept cards,
  retrieval, objections and strategy records;
- Strategy Packs model for internal methodology packages, including pack
  metadata, curated items, guided ingestion jobs and bindings by organization,
  agent profile, module, channel and workflow;
- pinned `Crescimento YUX` workspace in `/client-workspaces`, backed by an
  internal YUX client, active contract and all platform modules enabled through
  `0105_strategy_packs_yux_workspace.sql`;
- clear separation between Strategy Engine governance in Admin and daily YUX
  operation inside the `Crescimento YUX` workspace;
- contextual Strategy Harness panels in CRM, Marketing Studio, Omnichannel and
  Reports, linking each module to the relevant strategic agent and Strategy
  Packs;
- admin-only Growth Strategist chat for initial analysis, 48h diagnosis support,
  service/package recommendation and proposal preparation;
- Strategy Engine skill/profile layer for Growth Strategist, CRM Controller, AI
  SDR/Comercial 1, Closer, Customer Growth/Comercial 2, Revenue Recovery,
  Offer & Conversion, Marketing Studio, Referral, Metrics & Cash and Support
  style roles;
- controlled routing from omnichannel AI processing to assistant roles and
  strategy profile policies;
- separated admin tabs for `Execution Trace`, `Workflows` and `Learning`,
  covering runtime status, autonomy policies, execution runs, trace steps,
  learning signals, improvement recommendations and shadow experiments;
- Python Agent Harness runtime with API endpoints for health, event ingestion,
  job processing and workflow execution;
- persistent event/job model for WhatsApp and strategic events, with autonomy
  policies by client, agent, channel, intent and action;
- execution trace model covering runs, steps, context snapshots, verification
  results, subagent runs, outcomes and learning signals;
- workflow specs for `diagnostic_48h`, `proposal_consultative` and
  `whatsapp_conversation_turn`;
- controlled Active Learning foundation that can collect outcomes and suggest
  improvements without auto-changing production prompts, cards, policies or
  agent defaults.

Not complete:

- VPS/Postgres application/probe execution for `0105_strategy_packs_yux_workspace.sql`;
- final runtime wiring so Strategy Packs are used by every live worker response,
  not only visible in Admin UI and contextual module panels;
- Dokploy/VPS deployment of the Python Agent Harness runtime;
- production runtime secrets and backend environment variables;
- authenticated production QA for `/admin/strategy-engine`, especially the
  Growth Strategist chat, Strategy Packs tab and contextual module panels;
- live WhatsApp runtime switch from Edge Function/n8n fallback to Agent Harness
  execution;
- full curation and approval of operational concept cards, playbooks, rubrics
  and chunks for the private strategy knowledge base.

### Finance Basic

Implemented:

- `invoices`;
- `billing_items`;
- invoice total/payment-state triggers;
- internal accounts receivable view;
- portal read-only finance view;
- finance summary rules and tests;
- RLS for internal management and portal read access by active finance contract.

Not complete:

- payment gateway;
- automated billing;
- fiscal invoice issuance;
- bank reconciliation;
- remote migration/probe execution against target Supabase.

### Support Basic

Implemented:

- `support_tickets`;
- `support_messages`;
- status, priority, category, simple SLA due timestamp;
- internal support queue;
- portal ticket opening and public replies;
- portal sanitization that hides internal notes/messages;
- RLS for internal management and portal access by active support contract;
- support rules, service, and component tests.

Not complete:

- direct omnichannel-to-ticket conversion;
- attachments;
- knowledge base or FAQ;
- business-hour SLA calendar;
- email or WhatsApp notifications;
- remote migration/probe execution against target Supabase.

### Commercial MVP Expansion

Implemented:

- CRM Cockpit commercial upgrade with stronger sales-pipeline primitives;
- Sector Funnels and blueprint application for verticalized setup;
- Landing Pages as tracked, approvable funnel assets;
- Campaigns and Ads API-first core with protected provider mutation runs;
- Real WhatsApp Provider Path for inbound Meta webhooks and manual outbound;
- Configurable AI Assistant settings wired into AI processing metadata;
- Full Automation Workspace with visual builder (When/If/Then), CRUD for triggers/conditions/actions, flow selection, search/filter, duplicate/delete, publish with versioning;
- Automation Dashboard with metrics (active flows, executions, success rate) and charts (status distribution, top 5 flows);
- Automation Simulation with event picker, JSON payload editor, local dry-run evaluation and result persistence;
- Sector Templates (clinic, real_estate, dealer, workshop, agency) with pre-filled triggers/conditions/actions;
- Flow Versioning with history panel, rollback to previous published versions;
- Bulk Operations with checkbox selection, bulk enable/disable/delete;
- CRM Integration Preview for change_stage, assign_owner, create_task actions;
- AI Action Preview for ai_classify_lead, ai_generate_message, ai_generate_proposal;
- Audit Trail showing creation date, last update, published version, sector template;
- Real-time execution updates via Supabase Realtime;
- Dry-run mode toggle per flow (test mode without executing actions);
- Drag-and-drop action reordering in the builder for intuitive flow design;
- Real-time validation with errors/warnings for triggers, conditions, actions and full flows;
- Confirmation dialogs for destructive operations (delete, publish) to prevent accidents;
- First-time onboarding with 3-step guided tour explaining When/If/Then paradigm;
- Timeline visualization for sequences showing steps chronologically with delay indicators;
- Tooltips on builder step headers for better field explanation;
- Operational Reports with CPL, MROI, landing conversion, proposals, response
  time, owner activity, and portal-safe reporting;
- Portal by customer journeys with module-gated customer areas, dashboard next
  actions, approval shortcut and admin-assisted client workspaces.

Not complete:

- production application of all commercial MVP migrations/probes;
- production application of `20260603215128_expose_platform_base_tables_to_data_api.sql`
  if the target Supabase Data API rejects base platform table reads; this grant
  fix was applied to `portal-yux` as remote migration `20260603215652`, but the
  target project still needs the later commercial MVP migrations after
  `20260601210000`;
- production provider credentials/OAuth for Meta, Google, WhatsApp, and n8n;
- authenticated browser QA against the target Supabase and VPS/Dokploy environments;
- production CI/deploy verification after the full Growth Workspace batch;
- live provider health checks for OpenRouter/OpenAI/SMTP2GO.

## Current Validation Evidence

Repository-wide validation rerun after the active-prospecting implementation on
2026-08-04:

- backend `npm test`: 60 test files, 268 tests passed;
- backend `npm run type-check`: passed;
- backend `npm run build`: passed;
- frontend `npm test`: 97 test files, 466 tests passed;
- frontend `npm run type-check`: passed;
- frontend `npm run build`: passed with the existing Browserslist age and large
  bundle warnings;
- focused ESLint for the active-prospecting Radar files: passed with zero
  warnings;
- `python -m pytest tests` in the Agent Harness runtime: 69 tests passed.

Focused Funis, Tasks and Scoring compatibility audit:

- backend CRM routes, scoring, schema, outbox and automation dispatch: 5 files,
  31 tests passed;
- frontend funil page/editor, pipeline rules, CRM service and navigation: 5
  files, 40 tests passed;
- direct Task Center and Scoring page component tests are not present; their
  TypeScript integration is covered by the full build graph, while authenticated
  behavior remains part of the deployment smoke test.

The frontend total includes the router-context regression fixtures added for
Campaigns, CRM, Omnichannel, Reports and Strategy Engine workspace tests after
the previous documentation boundary.

The frontend test run emitted only the existing Vite/esbuild deprecation and
outdated Browserslist-data warnings; neither caused a failure.

Latest YUX Agent Harness validation:

- `python -m pytest tests` from `workers/marketing-studio-agent-runtime`: 52
  tests passed.
- `python -m compileall yux_agent_runtime`: passed.
- `npm run type-check`: passed.
- Focused ESLint on modified Strategy Engine frontend files: passed.
- `deno check supabase/functions/run-strategy-admin-chat/index.ts supabase/functions/process-ai-message/index.ts`:
  passed.
- `npm test -- StrategyEnginePage strategyEngineService`: 2 files, 8 tests
  passed.
- Local Vite smoke on
  `http://127.0.0.1:5173/admin/strategy-engine`: HTTP 200.

Latest Growth Workspace Phase 7 validation:

- `npx vitest run src/lib/reports/reportRules.test.ts src/services/reportService.test.ts src/components/reports/ReportsWorkspace.test.tsx src/components/campaigns/CampaignsWorkspace.test.tsx`:
  4 files, 16 tests passed.
- `npm run type-check`: passed.
- `npm test`: 76 test files, 366 tests passed.
- `npm run build`: passed with known Browserslist/chunk-size warnings.
- Browser QA on `http://127.0.0.1:3000` as admin:
  `/campaigns`, `/leads`, `/automations`, `/reports`, `/client-workspaces`
  and `/client-workspaces/650e8400-e29b-41d4-a716-446655440101/marketing/campanhas`
  rendered without console errors.
- Browser QA on `http://127.0.0.1:3000` as demo client
  `cliente1@empresa.com`: `/portal`, `/portal/empresa/marca`,
  `/portal/marketing/campanhas` and `/portal/relatorios` rendered with the
  expected portal menu, Central da Marca, campaign MROI card, report presets
  and executive Ads/MROI cockpit.

Latest portal/workspace architecture validation:

- `npm run type-check`: passed.
- `npx vitest run src/lib/platform/navigation.test.ts`: 1 file, 18 tests
  passed.
- `npm run build`: passed with known Browserslist/chunk-size warnings.
- Browser QA on `http://127.0.0.1:3000` as admin:
  `/client-conversions` loaded "Converter lead em cliente" with the new
  Clientes & Contratos entry, YUX workspace source flow and no console errors;
  `/blueprints` loaded as "Modelos Setoriais" with sector templates and no
  console errors; `/contracts` loaded the "Modelo setorial" contract panel and
  no console errors;
  `/client-workspaces` listed active client workspaces;
  `/client-workspaces/650e8400-e29b-41d4-a716-446655440101` loaded the
  selected client context with "Workspace Cliente" and "Operando como cliente";
  direct subroutes including `/empresa/perfil`, `/comercial/leads`,
  `/atendimento/canais`, `/marketing/studio`, `/projetos/aprovacoes` and
  `/financeiro` loaded without workspace-unavailable state, without `/portal`
  link leaks and without console errors.

Latest Marketing Studio campaign creatives validation:

- Remote Supabase migration `20260607152544_marketing_studio_campaign_creatives`
  applied to `portal-yux`.
- Remote probe `supabase/probes/20260607152544_marketing_studio_campaign_creatives.sql`
  passed.
- `npm test -- src/lib/marketing-studio/marketingStudioRules.test.ts src/services/marketingStudioService.test.ts src/components/marketing-studio/MarketingStudioWorkspace.test.tsx`:
  3 files, 44 tests passed.
- `npm run type-check`: passed.
- `npm run build`: passed with known Browserslist/chunk-size warnings.
- `python -m unittest discover -s workers/marketing-studio-agent-runtime/tests -v`:
  18 tests passed.

Previous automations, Node Editor & Upload Limits validation:

- `npm test`: 62 test files, 261 tests passed.
- `npm run type-check`: passed with zero errors.
- `npx eslint` on modified automations files: passed with zero errors.

Previous support commit validation:

- `npm test`: 20 test files, 101 tests passed.
- `npm run type-check`: passed.
- `npm run build`: passed with known Browserslist/chunk-size warnings.
- `deno test supabase/functions/_shared`: 21 tests passed.
- GitHub Actions run `26866092631`: `Frontend`, `Supabase Metadata`, and
  `Supabase Edge Functions` succeeded.
- Historical Vercel preview for commit `709212f`: deployment succeeded before the Dokploy migration decision.

Latest intelligent Company Knowledge validation:

- backend `npm test`: 70 files and 289 tests passed;
- frontend `npm test`: 100 files and 471 tests passed;
- Agent Harness `python -m pytest -q`: 75 tests passed;
- backend and frontend type checks/builds passed;
- focused frontend lint for the changed Company Intelligence files passed with
  zero warnings;
- the operator later confirmed production application of migration `0126`;
  the authenticated provider canary remains operational validation.

Latest website-onboarding expansion validation (2026-08-05):

- backend `npm test`: 71 files and 295 tests passed;
- frontend `npm test`: 101 files and 472 tests passed;
- Agent Harness `python -m unittest discover -s tests -v`: 75 tests passed;
- backend and frontend production builds passed;
- migration `0127` and an authenticated live website/provider smoke test remain
  operational validation, not repository validation.

Latest resilient crawl/runtime correction validation (2026-08-07):

- backend `npm test`: 71 files and 299 tests passed;
- frontend `npm test`: 101 files and 472 tests passed;
- Agent Harness `python -m unittest discover -s tests -v`: 77 tests passed;
- backend and frontend production builds passed;
- recursive discovery above the former 10/20-page limits and partial page
  failures are covered by backend tests;
- Agent Harness batch isolation, safe HTTP error detail and malformed model
  confidence are covered by TypeScript/Python regression tests;
- the production screenshot and authenticated DOM confirmed the prior failure
  occurred after 10 successful page reads, specifically at Agent Harness
  extraction; post-deploy provider validation remains required.

Latest website-suggestion application correction validation (2026-08-08):

- backend `npm test`: 72 files and 300 tests passed;
- backend production build passed;
- applying a reviewed run now recovers suggestions left as `applied` or
  `rejected` by an interrupted prior attempt instead of incorrectly returning
  `website_onboarding_suggestions_required`;
- edited values, selected/rejected suggestion states and the final run status
  are committed together in one transaction, preventing that partial state
  from recurring;
- authenticated post-deploy interaction remains required because the available
  in-app browser session did not contain the operator's production login.

Known validation limitation:

- This 2026-08-04 audit did not apply migrations or perform authenticated
  browser/provider smoke tests against the production VPS. Passing repository
  tests therefore confirms code consistency, not deployment state.
- Historical unauthenticated HTTP smoke on Vercel preview routes returned `401`
  because Vercel Authentication protected the preview deployment.
- Local Supabase reset for CRM governance could not run in this session because
  Docker Desktop was unavailable or not connected to the Windows Docker daemon.
- Local Supabase reset for CRM ideal phase 1 could not run for the same Docker
  daemon limitation.
- Local Supabase migration validation for
  `20260613191046_yux_agent_harness_runtime.sql` could not run because local
  Postgres at `127.0.0.1:54322` refused connection.
- Docker/Dokploy compose validation for the Agent Harness runtime could not run
  because Docker was not available in this Windows session.
- For the same reason, migrations `0120` through `0123` were not applied to a
  disposable database and the active-prospecting journey could not be exercised
  against real Postgres/Redis/provider containers.
- repository-wide frontend lint is not currently a green gate: it reports 585
  pre-existing issues across legacy modules, including the parallel CRM work.
  The active-prospecting frontend files pass their focused zero-warning lint.

## Pending Operational Work

These are not missing code in this repository; they are deployment/operation
steps still required before treating the app as live-ready:

- preserve the user-confirmed VPS/Postgres migration history through `0126`
  and apply `0127_company_visual_identity.sql` after deploying this
  feature branch;
- keep the Fastify API, Redis and BullMQ worker healthy; confirm the five-second
  outbox dispatcher, automation deliveries, sequence scheduler and retries are
  operating after deployment;
- smoke-test standalone and landing-page-bound form submission on the public
  production domain, including allowed origins, idempotency, duplicate identity,
  CRM visibility and two independent matching automations;
- run authenticated portal/internal QA for session revalidation, client
  invitation/resend feedback, e-mail identity synchronization, CRM governance
  and CRM-instance provisioning;
- configure `PUBLIC_APP_URL`, `CORS_ORIGIN`, `SMTP2GO_WEBHOOK_SECRET` and the
  signed SMTP2GO callback before relying on e-mail lifecycle events;
- configure `N8N_CRM_WEBHOOK_URL` together with `N8N_WEBHOOK_SECRET` only when
  external automation actions are enabled;
- deploy `workers/marketing-studio-agent-runtime` to VPS/Dokploy and configure
  `YUX_AGENT_RUNTIME_URL` plus `YUX_AGENT_RUNTIME_TOKEN` in the backend when the
  runtime should process Strategy Admin or WhatsApp jobs;
- configure `KNOWLEDGE_STORAGE_DIR=/app/storage/company-knowledge` and confirm
  that API and worker mount the same persistent `yux_company_knowledge_data`
  volume before uploading documents;
- configure runtime/provider secrets such as the Postgres connection,
  `OPENROUTER_API_KEY`, `JINA_API_KEY`, Meta/Google credentials and provider
  encryption keys only in server-side/Dokploy environments;
- for internal YUX prospecting, configure `YUX_AGENT_RUNTIME_TOKEN`, an active
  Meta WhatsApp connection/access-token reference and phone-number ID, and an
  approved Meta template whose name/language/components are stored on the first
  WhatsApp sequence step;
- activate the organization prospecting policy only after the legal/process
  review, record channel permission evidence per address, and start with a small
  human-approved canary; keep the kill switch on until Radar-only validation and
  native e-mail/Meta sandbox delivery pass;
- run authenticated QA for `/admin/strategy-engine`, especially the
  `Harness & Learning` tab, after target migration application;
- verify the Agent Harness runtime health endpoint and job execution in the
  production VPS before switching WhatsApp/Strategy Admin paths from fallback to
  runtime execution;
- deploy `docker-compose.dokploy.yml` in Dokploy and validate production domains;
- configure real provider credentials only when the business chooses to move
  from provider-neutral bases to live integrations.

## Recommended Next Product Focus

The 2026-08-03 lead-orchestration plan and its first functional CRM expansion
are implemented locally. Funis, Tasks and Scoring passed the final repository
compatibility audit and retain these documents as production acceptance
checklists:

- `docs/superpowers/plans/2026-08-03-crm-funis-funcionais.md`;
- `docs/superpowers/plans/2026-08-03-crm-central-tarefas.md`;
- `docs/superpowers/plans/2026-08-03-crm-scoring-por-acoes.md`.

Recommended order:

1. apply migration `0127`, preserve the confirmed history through `0126` and
   validate Postgres, Redis/BullMQ, outbox, Agent Harness and native delivery
   health in the VPS before using intelligent Company Knowledge;
2. run the active-prospecting canary in gates: Radar without outbound, approved
   e-mail/task cadence, Meta test template, then assisted AI replies;
3. rerun the authenticated client smoke test for Funis, Tasks and Scoring after
   the parallel workstream is deployed;
4. execute the Company Intelligence smoke test in
   `docs/company-intelligence-operations.md`, including cross-organization
   isolation, evidence review, semantic paraphrase retrieval, website-assisted
   onboarding and a forbidden-claim WhatsApp handoff;
5. add the outbox/dead-letter operations surface, deeper scoring analytics and
   advanced prospecting operations/retention controls when operational volume
   justifies them.

Finance and support should stay basic unless a real client forces deeper
requirements.

## Known Workspace Notes

- The local worktree contains unrelated untracked files; none were used as
  implementation evidence or modified by this documentation audit.
- The active frontend path is the self-hosted `/api/*` backend and module
  services. Supabase/Edge Function references in historical sections are
  archival and must not be used as the current production architecture.
