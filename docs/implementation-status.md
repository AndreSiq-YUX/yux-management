# YUX Hub Implementation Status

Updated: 2026-06-27 (runtime migrated to VPS backend/Postgres/Redis; frontend Supabase client and Edge Functions removed from active path)

This document tracks what is implemented in this repository. It separates code
that exists in the repo from operational work that still needs to be applied in
the target VPS/Dokploy environment.

## Current Baseline

- Frontend: React 18, TypeScript, Vite, Tailwind, shadcn-style UI primitives.
- Data/runtime: self-hosted Postgres, Fastify backend API, Redis/BullMQ worker,
  local VPS file storage and Python Agent Harness runtime.
- Active frontend data layer: `/api/*` through `apiClient`, `backendDataClient`,
  `backendAuthService`, `backendDataService`, and module-specific services.
- Current development branch target: active local workspace with Growth
  Workspace, Strategy Engine and Agent Harness changes.
- Latest implementation state includes uncommitted local Strategy Engine and
  Agent Harness files; check `git status` before using commit hashes as a
  release boundary.
- CRM-specific reference:
  `docs/crm-lead-management.md`.

## Summary Table

| Area | Status | Main Routes | Main Repo Evidence | Operational Notes |
| --- | --- | --- | --- | --- |
| Platform foundation | Implemented | `/dashboard`, platform shell | `20260531000000_yux_os_clean_baseline.sql`, `platformService`, module registry, platform store | Remote Supabase state must be checked before assuming all migrations are applied. |
| Admin YUX Hub | Implemented in repo | `/admin`, `/admin/integrations`, `/admin/channels`, `/admin/email`, `/admin/ai`, `/admin/modules-governance`, `/admin/health` | `20260604203319_yux_hub_admin_platform.sql`, `adminPlatformService`, grouped navigation, Admin Hub pages, `docs/admin-yux-hub.md` | Target Supabase still needs the admin platform migration applied before live data loads through the Data API. |
| Contracts, packages, modules, portal context | Implemented | `/contracts`, `/packages`, `/modules`, `/portal` | `20260601000000_contracts_modules_portal.sql`, `20260601010000_contract_rls_policies.sql`, `ContractsPage`, `PackagesPage`, `ModulesPage`, `PortalDashboardPage` | Portal access derives from active contract and enabled modules. |
| Lead-to-client conversion bridge | Implemented in repo | `/client-conversions` | `ClientConversionsPage`, `clientConversionService`, `platformService.createClientOrganization`, `crmService`, `backendDataService.createClient` | Converts a closed lead from a client/YUX workspace into official client, organization and contract records, optionally applying a sector model and marking the lead as converted. |
| Portal RLS hardening | Implemented in repo | Portal routes | `20260601020000_harden_portal_rls.sql`, `20260601030000_secure_baseline_functions.sql`, `20260601040000_move_auth_trigger_private.sql` | Requires remote migration application/probes in target DB. |
| Portal by customer journeys | Implemented in repo | `/portal`, `/portal/empresa/*`, `/portal/comercial/*`, `/portal/atendimento/*`, `/portal/marketing/*`, `/portal/automacoes/*`, `/portal/projetos/*`, `/portal/relatorios`, `/portal/suporte`, `/portal/financeiro`, `/portal/configuracoes/conta` | `App.tsx`, `navigation.ts`, `PortalJourneyPage`, portal journey pages, `PortalDashboardPage`, `PortalApprovalsPage` | Replaces legacy module-first portal navigation with customer-facing areas. Legacy portal module routes now redirect to the new journey routes. |
| Admin assisted client workspaces | Implemented in repo | `/client-workspaces`, `/client-workspaces/:organizationId/*` | `ClientWorkspaceSelectorPage`, `ClientWorkspaceLayout`, `platformStore.initializeClientWorkspace`, `usePortalWorkspacePath`, navigation tests | Admin users must select a client before operating. The selected workspace mirrors the portal menu and loads the selected client's contract/module context. |
| Portal data stabilization / phase 6 visibility | Implemented in repo | Portal and client workspace routes | `20260608095633_portal_phase6_rls_visibility.sql`, `usePortalActionSummary`, `usePortalCrmContext`, `usePortalMarketingContext`, `portalDisplay` | Stabilizes portal loading and next-action summaries across CRM, marketing, approvals, projects and finance. Target migration/probe confirmation is still required before production assumptions. |
| Projects, tasks, deliverables, approvals | Implemented | `/projects`, `/portal/projetos/projetos`, `/portal/projetos/aprovacoes` | `20260601070000_project_delivery_approvals.sql` through `20260601100000_backfill_deliverable_approval_status.sql`, `ProjectsPage`, `PortalProjectsPage`, `PortalApprovalsPage`, project components, `approvalRules` | Includes client-visible timeline, documents and approval decisions. |
| CRM and follow-up automation foundation | Implemented in repo | `/leads`, `/portal/comercial/leads` | `20260601105000_ensure_interactions_for_crm.sql` through `20260601140000_enable_client_crm_portal.sql`, `crmService`, `followUpRules`, `docs/crm-lead-management.md` | Provider-neutral; target Supabase must have migrations, grants, valid session, memberships and RLS applied. |
| CRM governed by contract | Implemented in repo | `/crm-governance`, `/portal/comercial/leads`, `/portal/empresa/usuarios` | `20260603230000_crm_governance_by_contract.sql`, `crmGovernanceService`, `governanceRules`, CRM governance UI, scoped CRM workspace | Local Supabase reset/probe could not run because Docker was unavailable in this Windows session. Target Supabase still needs migration and probe execution. |
| Commercial proposals and conversion | Implemented | `/proposals`, `/portal/projetos/aprovacoes`, `/proposal/review/:token` | `20260601150000_commercial_proposals_conversion.sql` through `20260601180000_enable_client_proposal_permissions.sql`, `proposalService`, `ProposalEditor`, `PublicProposalPage`, `PortalApprovalsPage` | AI draft generation is provider-neutral with fallback behavior; production provider credentials are not part of this status. |
| Omnichannel AI base | Implemented as provider-neutral base | `/omnichannel`, `/portal/atendimento/conversas`, `/portal/atendimento/canais`, `/webchat/session/:sessionToken` | `20260601190000_omnichannel_ai_core.sql`, `20260601200000_omnichannel_crm_sync.sql`, `20260601210000_omnichannel_webchat_widget_service.sql`, `omnichannelService`, omnichannel components, `frontend/public/yux-webchat.js` | Live WhatsApp/Instagram/email provider credentials are deferred. Webchat uses short-lived session tokens. |
| Finance basic | Implemented in repo | `/finance`, `/portal/financeiro` | `20260601220000_basic_finance.sql`, `financeService`, `FinanceWorkspace`, `PortalFinanceWorkspace`, `financeRules` | Accounts receivable only. No payment gateway, fiscal issuance, bank reconciliation, or automated billing. Migration/probes still need target DB execution. |
| Support basic | Implemented in repo | `/support`, `/portal/suporte` | `20260601230000_basic_support.sql`, `supportService`, `SupportWorkspace`, `PortalSupportWorkspace`, `supportRules` | Contract-based tickets and messages only. No omnichannel ticket conversion, attachments, FAQ/knowledge base, or advanced SLA calendar. Migration/probes still need target DB execution. |
| CRM Cockpit commercial upgrade | Implemented in repo | `/leads`, `/portal/comercial/leads` | `20260601260000_crm_cockpit_upgrade.sql`, CRM service/UI upgrades, `20260603215128_expose_platform_base_tables_to_data_api.sql` | Adds owner/source/stage commercial cockpit primitives and portal-safe CRM continuation. Loading fallback fixed after `organizations` 401 report. |
| CRM ideal phase 1 commercial cockpit | Implemented in repo | `/leads`, `/portal/comercial/leads` | `20260604010000_crm_commercial_cockpit.sql`, `crmCockpitService`, `cockpitRules`, `CockpitTabs`, `TodayWorkQueue`, `Lead360Panel`, `LeadCsvImportPanel` | Adds tabs, filters, Today queue, calendar, sources, CSV preview, tags/import/action schema. Supabase migration/probe still need target execution. |
| CRM ideal phase 2 WhatsApp AI | Implemented in repo | `/leads`, `/portal/comercial/leads`, `/portal/atendimento/conversas`, `/omnichannel` | `20260604020000_crm_whatsapp_ai.sql`, `crmConversationService`, `conversationRules`, `LeadConversationPanel`, `LeadAiInsightPanel`, `LeadResponseComposer`, `process-ai-message` | Links leads to conversations, stores CRM AI insights, tracks SLA/handoff, supports response suggestions. Supabase migration/probe still need target execution. |
| CRM ideal phase 3 proposals closing | Implemented in repo | `/leads`, `/portal/comercial/leads`, `/portal/projetos/aprovacoes`, `/proposals` | `20260604030000_crm_proposals_closing.sql`, `crmClosingService`, `closingRules`, `LeadProposalLauncher`, `ProposalRecommendationPanel`, `ClosingChecklistPanel`, `ProposalEventTimeline` | Adds CRM-facing lead-to-proposal-to-contract orchestration, event timeline, follow-ups, objections, conversion run idempotency and onboarding checklist. Supabase migration/probe still need target execution. |
| CRM ideal phase 4 attribution and MROI | Implemented in repo | `/leads`, `/reports`, `/portal/relatorios` | `20260604040000_crm_attribution_mroi.sql`, `crmAttributionService`, `attributionRules`, `LeadSourcesDashboard`, `SourceFunnelChart`, `MroiAlertPanel` | Adds normalized sources, attribution events, source rollups, campaign snapshots, attributed revenue, MROI alerts, CSV exports and portal-safe attribution reporting. Supabase migration/probe still need target execution. |
| Sector models / blueprints | Implemented in repo | `/blueprints`, `/contracts`, `/client-conversions` | `20260601270000_sector_funnel_blueprints.sql`, `BlueprintApplyPanel`, `ContractsPage`, `ClientConversionsPage`, blueprint application rules | Provides reusable sector templates and contract application runs. Can be applied globally, from a selected contract or during lead conversion. |
| Landing Pages module | Implemented in repo | `/landing-pages`, `/portal/marketing/landing-pages` | `20260601280000_landing_pages.sql`, `landingPageService`, landing page workspaces | Tracks versions, approvals, visits/leads and portal review surface. |
| Campaigns API-first core | Implemented in repo | `/campaigns`, `/portal/marketing/campanhas` | `20260601290000_campaigns_ads_api_core.sql`, backend function compatibility route, campaign service/workspaces, `backend/src/lib/edge-compat/adsProvider.ts` | API-first campaign draft/provider mutation path now routes through the VPS backend; provider side-effect handlers still need explicit domain hardening beyond compatibility jobs. |
| Real WhatsApp provider path | Implemented in repo | `/omnichannel`, `/portal/atendimento/conversas` | `20260601300000_whatsapp_provider_path.sql`, backend omnichannel routes/jobs, `backend/src/lib/edge-compat/whatsappProvider.ts` | Adds Meta WhatsApp webhook normalization, signature validation, token state and manual outbound path; production ingress should target backend routes, not Edge Functions. |
| Meta channel connectors | Implemented in repo | `/portal/atendimento/canais`, `/admin/channels` | `20260605110828_meta_channel_connectors.sql`, backend compatibility function route, `metaChannelService`, connected-channel workspaces, `backend/src/lib/edge-compat/metaChannel.ts` | Requires Meta App configuration, App Review permissions, runtime secrets and authenticated production QA. Edge Function source was removed from active code. |
| Configurable AI assistant | Implemented in repo | `/omnichannel` admin | `20260601310000_ai_assistant_settings.sql`, `aiAssistantService`, `AssistantSettingsPanel`, `process-ai-message` | Adds configurable assistant objectives, fields, handoff, safety, knowledge links and sanitized AI run metadata. |
| Marketing Studio foundation | Implemented | `/marketing-studio`, `/portal/marketing/studio` | `20260605220328_marketing_studio_foundation.sql`, `marketingStudioService`, `MarketingStudioWorkspace`, `PortalMarketingStudioWorkspace`, Marketing Studio domain rules | Adds module shell, navigation, settings, agent templates, ideas, content/version/review workflow, editorial calendar, AI credits and usage ledger. Migration and probe passed remotely on `portal-yux`. |
| Marketing Studio organic content and calendar | Implemented in repo | `/marketing-studio`, `/portal/marketing/studio`, `/portal/marketing/conteudo`, `/portal/marketing/calendario` | `2026-06-06-yux-marketing-studio-organic-calendar.md`, expanded `marketingStudioService`, organic content workspace, portal approval surface, calendar/review/version rules | Adds manual organic content operations, version tracking, review decisions, approval actions and editorial calendar surfaces. LangGraph, RAG, Radar, WordPress publishing and AI generation remain follow-up phases. |
| Marketing Studio knowledge and RAG | Implemented | `/marketing-studio`, `/portal/marketing/studio`, `/portal/empresa/conhecimento`, `/portal/empresa/marca` | `20260606233110_marketing_studio_knowledge_rag.sql`, `2026-06-06-yux-marketing-studio-knowledge-rag.md`, brand profile/product/knowledge service methods, Marketing Studio knowledge panels | Adds pgvector, brand voice profiles, products/services, marketing knowledge documents/chunks and `match_marketing_knowledge` text-search RPC. Migration and probe passed remotely. Embedding generation, RAG worker and LangGraph remain follow-up phases. |
| Marketing Studio LangGraph runtime and harness | Implemented | `/marketing-studio` | `20260607000807_yux_agent_harness_langgraph.sql`, `2026-06-06-yux-agent-harness-langgraph.md`, worker `workers/marketing-studio-agent-runtime`, Marketing Studio agent/workflow service methods, internal harness panel | Adds YUX-admin global system prompts, client/YUX editable agent prompts/defaults, workflow definitions, workflow/agent/tool run logs, budget policies, model routing and tool policies. Migration and probe passed remotely. Runtime is now extended by the broader YUX Agent Harness Runtime for central trace, autonomy, workflows and learning. |
| Marketing Studio Radar and research | Implemented | `/marketing-studio`, `/admin/integrations` | `20260607003007_marketing_studio_radar_research.sql`, `20260607003928_yux_hub_jina_provider_defaults.sql`, `2026-06-07-yux-marketing-studio-radar-research.md`, worker Jina Reader/Search request builders, source item/radar service methods, internal Radar panel, Jina AI global provider defaults | Adds controlled source items, research cache, Radar runs, dedupe keys, opportunity scores, typed conversion from captured source item to idea, and Admin YUX global Jina configuration fields. Radar and Jina provider migrations/probes passed remotely. Live scheduled jobs and provider credentials remain follow-up operational work. |
| Marketing Studio writing, review and grounding | Implemented | `/marketing-studio` | `20260607141134_marketing_studio_writing_review_grounding.sql`, `2026-06-07-yux-marketing-studio-writing-review-grounding.md`, worker writing/review contracts, generation run and quality check service methods, internal writing/review/grounding panel, worker `OpenRouterClient` and `JinaClient` | Adds Redator Multicanal and Revisor de Marca contracts, generated draft logs, quality checklist, risk flags, grounding-required state and internal pipeline visibility. Migration and probe passed remotely. Worker now supports native OpenRouter chat completion and Jina Reader/Search/Grounding using server-side secrets. |
| Marketing Studio WordPress publishing | Implemented and deployed | `/marketing-studio` | `20260607150115_marketing_studio_wordpress_publishing.sql`, `execute-wordpress-publishing` Edge Function, publishing connection/run service methods, internal WordPress publishing panel | Adds multi-tenant WordPress publishing connections and idempotent publishing runs for draft creation, draft update and approval-bound publication. Migration/probe passed remotely and Edge Function deployed to `portal-yux`. Requires per-client WordPress secret references to be configured before live posting. |
| Marketing Studio campaign creatives and drafts | Implemented | `/marketing-studio` | `20260607152544_marketing_studio_campaign_creatives.sql`, campaign creative suggestion and draft run service methods, internal campaign creative panel, worker campaign strategist helpers | Adds campaign creative suggestions for Meta/Google-style briefs, copy variations, creative concepts, targeting suggestions, approval states, landing page/campaign links and idempotent campaign draft runs. Migration and probe passed remotely. |
| Marketing Studio native Meta/Google integrations | Implemented in repo, backend cutover in progress | `/marketing-studio`, `/campaigns`, `/api/functions/*` | `20260607175945_marketing_studio_native_integrations.sql`, `backend/src/lib/edge-compat/providerSecrets.ts`, `providerOAuth.ts`, `socialPublishingProvider.ts`, `adsProvider.ts`, backend function compatibility route, frontend provider state panels | Adds multi-tenant OAuth sessions, encrypted provider token storage patterns, Meta/Facebook/Instagram/Google Business Profile publishing helpers, Meta Ads and Google Ads request builders, provider asset/account listing and approval gates. Runtime no longer depends on Supabase Edge Functions; live provider side effects still need explicit backend handlers beyond compatibility queueing. |
| YUX Strategy Engine | Implemented in repo, pending remote migration/probe confirmation | `/admin/strategy-engine`, affected CRM/Omnichannel/Marketing Studio surfaces | `20260611190000_yux_strategy_engine.sql`, `20260612183708_yux_strategy_admin_chat.sql`, `20260612184513_yux_strategy_growth_route_seed.sql`, `strategy-knowledge` scripts, worker `retrieval.py`/`strategy.py`, `strategyEngineService`, `StrategyEnginePage`, `StrategyAdminChatPanel`, `process-ai-message` role routing | Adds internal doctrine, skills, profile policies, knowledge ingestion, concept cards, retrieval logs, multi-assistant routing, internal Growth Strategist chat, Metrics & Cash, Objection Intelligence, CRM Controller rules, handoffs, recommendations and outcome/learning records. Target Supabase still needs migration and probe execution before production claims. |
| YUX Agent Harness Runtime | Implemented locally, pending VPS deploy confirmation | `/admin/strategy-engine` -> `Harness & Learning`, optional runtime for `/omnichannel` and Strategy Admin chat | `20260613191046_yux_agent_harness_runtime.sql`, `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`, `queue.py`, `workflow.py`, `trace.py`, `autonomy.py`, `runtime_store.py`, `StrategyHarnessPanel`, backend function compatibility route, `docs/yux-agent-harness-runtime.md` | Adds central event queue, execution runs/steps, context snapshots, verification results, subagent runs, autonomy policies, workflow specs, outcomes, learning signals, improvement recommendations and shadow experiments. Runtime exposes health, event ingestion, job processing and workflow execution endpoints. Backend API can call `YUX_AGENT_RUNTIME_URL`; Dokploy deploy and runtime env are still required. |
| Flow Builder Lite (initial) | Implemented in repo | `/automations` | `20260601320000_flow_builder_lite.sql`, `automationService`, `AutomationWorkspace`, `dispatch-crm-automation` | Initial trigger/condition/action flows and execution history. Later evolved into full Intelligent Automations Workspace. |
| Intelligent automations and SMTP2GO email hub | Implemented in repo | `/automations` | `20260604050000_intelligent_automations_foundation.sql`, `20260604060000_automation_sequences.sql`, `20260604070000_smtp2go_email_hub.sql`, `20260604080000_automation_sector_templates.sql`, backend automation routes/jobs, `automationService`, `automationSequenceService`, `emailDeliveryRules`, `AutomationWorkspace`, `SequencesWorkspace` timeline | Full automation workspace with visual builder, simulation, templates, versioning, bulk operations, dashboard, CRM/IA previews, audit trail, CRM sequences and VPS material storage. Runtime now targets backend routes/jobs instead of Edge Functions. |
| Visual Node Editor & Materials Library | Implemented in repo | `/automations`, `/admin/limits` | `20260604220000_automation_graph_and_materials.sql`, `AutomationNodeEditor`, `NodeConfigSidebar`, `MaterialLibraryDialog`, `AdminLimitsPage`, `automationService`, `adminPlatformService` | Visual node-based automation flow editor (React Flow), branched flow traversal (parallel execution), dynamic file attachments (email/WhatsApp) integrated with multitenant Materials Library storage, and administrative interface to configure global and client limits. |
| Growth Workspace orchestration | Implemented and locally validated | `/leads`, `/campaigns`, `/automations`, `/reports`, portal/workspace routes | `20260608130000_growth_workspace_foundation.sql`, `growthWorkspaceService`, `record360Rules`, `campaignPlanRules`, `onboardingRules`, `templateRules`, Growth Workspace components | Connects Registro 360, Campanha 360, sector onboarding, Central da Marca, template library, smart segments, guided automations and executive Ads/MROI reporting into one commercial journey. |
| Operational reports and MROI | Implemented and locally validated | `/reports`, `/portal/relatorios` | `20260601330000_operational_reports.sql`, `reportService`, `reportRules`, report workspaces, `CampaignMetricsPanel` | Aggregates funnel, campaign, landing page, proposal, conversation, project and activity metrics with portal-safe output, report presets, AI insight summary and executive Ads/MROI cockpit. |
| Portal dashboard and next actions | Implemented in repo | `/portal`, `/client-workspaces/:organizationId` | `PortalDashboardPage`, `usePortalActionSummary`, `usePortalWorkspacePath`, navigation rules/tests | Dashboard highlights active contract, module summaries and fixed approval shortcut. Next actions aggregate approvals, marketing reviews, CRM follow-ups, projects and finance. |
| Deploy and CI hardening | Implemented in repo | N/A | `docs/phase-8-deploy-hardening.md`, `DEPLOY-DOKPLOY-VPS.md`, `docker-compose.dokploy.yml` | Production target is now VPS/Dokploy with self-hosted backend, Postgres and Redis. Vercel configs and Vercel deploy docs were removed from the active path. |

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
  campaigns and landing pages.
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

## Pending Operational Work

- configure Meta App IDs, Embedded Signup config, App Review permissions and
  runtime secrets;
- deploy Meta channel Edge Functions;
- validate WhatsApp Embedded Signup, Instagram Direct and Messenger with
  development-mode test assets before production.
- configure per-client WordPress application-password secrets referenced by
  `publishing_connections.token_reference` before executing live blog posts.
- configure native Marketing Studio runtime secrets for Meta/Google OAuth,
  Google Ads developer token and provider secret encryption before live posting
  or ad activation;
- complete Meta App Review, Google OAuth consent setup and redirect URL
  registration before client tenants authorize their accounts.
- confirm or apply/probe `20260608095633_portal_phase6_rls_visibility.sql` in
  the target Supabase project before treating the new portal/client workspace
  loading behavior as production-confirmed.
- confirm or apply/probe `20260608130000_growth_workspace_foundation.sql` in
  the target Supabase project before treating Growth Workspace persistence as
  production-confirmed. The migration and probe files exist locally, but this
  status update could not verify remote migration history because the linked
  Supabase database password failed authentication in the local CLI.
- confirm or apply/probe `20260611190000_yux_strategy_engine.sql`,
  `20260612183708_yux_strategy_admin_chat.sql`,
  `20260612184513_yux_strategy_growth_route_seed.sql` and
  `20260613191046_yux_agent_harness_runtime.sql` in the target Supabase project
  before treating Strategy Engine, Harness & Learning, workflow traces and
  Active Learning records as production-confirmed.
- deploy and configure the YUX Agent Harness Runtime on VPS/Dokploy before
  treating WhatsApp/Strategy Admin runtime execution as operational instead of
  fallback-only.

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
- n8n-oriented boundaries without coupling the frontend to provider execution.

Not complete:

- complete live provider integrations;
- full outbound automation execution UI for every workflow type.

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
- seller and manager workspace titles.

Not complete:

- target Supabase application of `20260603230000_crm_governance_by_contract.sql`;
- target probe execution for `supabase/probes/20260603230000_crm_governance_by_contract.sql`;
- full CRUD forms for every governance entity;
- real user invitation lifecycle through Supabase Auth;
- advanced sales dashboard by seller/team;
- AI scoring and full CRM redesign beyond this governance foundation.

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
  governance of agent profiles, skills, concept cards, retrieval, objections and
  strategy records;
- admin-only Growth Strategist chat for initial analysis, 48h diagnosis support,
  service/package recommendation and proposal preparation;
- Strategy Engine skill/profile layer for Growth Strategist, CRM Controller, AI
  SDR/Comercial 1, Closer, Customer Growth/Comercial 2, Revenue Recovery,
  Offer & Conversion, Marketing Studio, Referral, Metrics & Cash and Support
  style roles;
- controlled routing from omnichannel AI processing to assistant roles and
  strategy profile policies;
- Harness & Learning admin panel for runtime status, workflows, autonomy
  policies, execution runs, trace steps, learning signals, improvement
  recommendations and shadow experiments;
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

- target Supabase application/probe execution for Strategy Engine and Agent
  Harness migrations;
- Dokploy/VPS deployment of the Python Agent Harness runtime;
- production runtime secrets and Edge Function environment variables;
- authenticated production QA for `/admin/strategy-engine`, especially the
  Growth Strategist chat and `Harness & Learning` tab;
- live WhatsApp runtime switch from Edge Function/n8n fallback to Agent Harness
  execution;
- full curation and approval of operational concept cards, playbooks and chunks
  for the private strategy knowledge base.

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

Known validation limitation:

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

## Pending Operational Work

These are not missing code in this repository; they are deployment/operation
steps still required before treating the app as live-ready:

- apply the latest Supabase migrations in the target project, especially:
  - `20260601220000_basic_finance.sql`;
  - `20260601230000_basic_support.sql`;
  - `20260601270000_sector_funnel_blueprints.sql`;
  - `20260601280000_landing_pages.sql`;
  - `20260601290000_campaigns_ads_api_core.sql`;
  - `20260601300000_whatsapp_provider_path.sql`;
  - `20260601310000_ai_assistant_settings.sql`;
  - `20260601320000_flow_builder_lite.sql`;
  - `20260601330000_operational_reports.sql`;
  - `20260604010000_crm_commercial_cockpit.sql`;
  - `20260604020000_crm_whatsapp_ai.sql`;
  - `20260604030000_crm_proposals_closing.sql`;
  - `20260604050000_intelligent_automations_foundation.sql`;
  - `20260604060000_automation_sequences.sql`;
  - `20260604070000_smtp2go_email_hub.sql`;
  - `20260604080000_automation_sector_templates.sql`;
  - `20260604220000_automation_graph_and_materials.sql`;
  - `20260608095633_portal_phase6_rls_visibility.sql`;
  - `20260608130000_growth_workspace_foundation.sql`;
  - `20260611190000_yux_strategy_engine.sql`;
  - `20260612183708_yux_strategy_admin_chat.sql`;
  - `20260612184513_yux_strategy_growth_route_seed.sql`;
  - `20260613191046_yux_agent_harness_runtime.sql`;
- confirm remote migration history or apply the missing migrations, then run
  the corresponding probes in `supabase/probes/`;
- verify portal/internal flows with authenticated test users after migrations;
- deploy `workers/marketing-studio-agent-runtime` to VPS/Dokploy and configure
  `YUX_AGENT_RUNTIME_URL` plus `YUX_AGENT_RUNTIME_TOKEN` for Edge Functions when
  the runtime should process Strategy Admin or WhatsApp jobs;
- configure runtime server secrets such as `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` and `JINA_API_KEY` only in
  server-side/Dokploy environments;
- run authenticated QA for `/admin/strategy-engine`, especially the
  `Harness & Learning` tab, after target migration application;
- verify the Agent Harness runtime health endpoint and job execution in the
  production VPS before switching WhatsApp/Strategy Admin paths from fallback to
  runtime execution;
- confirm current Supabase project activity/status before diagnosing remote SQL
  failures;
- deploy `docker-compose.dokploy.yml` in Dokploy and validate production domains;
- configure real provider credentials only when the business chooses to move
  from provider-neutral bases to live integrations.

## Recommended Next Product Focus

The next commercial build focus is documented in
`docs/commercial-mvp-priorities.md`.

The implementation design and master execution plan are documented in:

- `docs/superpowers/specs/2026-06-03-yux-hub-commercial-mvp-design.md`;
- `docs/superpowers/plans/2026-06-03-yux-hub-commercial-mvp.md`.

Short version:

- deepen CRM into a visual sales cockpit;
- add sector funnel templates through blueprints;
- implement one real WhatsApp provider path;
- add Landing Pages as tracked, approvable funnel assets;
- add Campaigns And Ads with API-first Meta/Google creation and management;
- add configurable AI assistant settings;
- add simple operational reports;
- complete email settings configuration UI.

Finance and support should stay basic unless a real client forces deeper
requirements.

## Known Workspace Notes

- The local worktree may contain unrelated untracked files. At this snapshot,
  `Ruolo-Dott.ssa-Iannelli-ud.01.06.2026.pdf` and root `package-lock.json` were
  intentionally outside the support/finance commits.
- The repository is still partly mid-migration: prefer newer module services
  and `supabaseService` over legacy `/api` assumptions in `apiService`.
