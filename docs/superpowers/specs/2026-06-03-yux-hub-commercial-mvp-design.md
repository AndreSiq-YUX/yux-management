# YUX Hub Commercial MVP Design

## Objective

Build YUX Hub into a first-line commercial application focused on the assets a
client understands: CRM pipeline, lead funnel, WhatsApp conversations, landing
pages, campaigns, creatives, automations, and proof-of-value reporting.

This design does not replace the existing YUX OS platform foundation. It
prioritizes the next product layer on top of what is already implemented:
contracts, modules, portal access, projects, proposals, omnichannel base,
finance, and support.

## Product Direction

The product should move from modular operational foundation to native commercial
cockpit.

The next sellable version must make a demo feel like a professional operation,
not only a collection of configured tables. The UI should expose recognizable
business assets:

- Lead;
- Funil;
- Conversa;
- WhatsApp IA;
- Landing Page;
- Campanha;
- Criativo;
- Automacao;
- Resultado.

## Core Principle

Every new module should connect to the same commercial loop:

```text
Campaign
  -> Landing Page or WhatsApp CTA
  -> Tracking / UTM / Lead Source
  -> CRM Lead
  -> Pipeline Stage
  -> WhatsApp IA / Follow-up
  -> Proposal / Scheduling / Sale
  -> Operational Report / MROI
```

This loop is the architecture boundary. Features that do not strengthen the loop
should stay secondary.

## Module Sequence

### 1. CRM Commercial Core

CRM becomes the primary operating surface. It should include:

- Kanban pipeline;
- list/table view;
- lead details;
- contact/company data;
- lead source and UTM context;
- owner;
- score;
- tasks and follow-ups;
- timeline;
- notes;
- won/lost status and loss reason;
- conversion into proposal, client, project, or contract.

The current `crmService`, `LeadsPage`, `CrmWorkspace`, `followUpRules`, and CRM
migrations should be reused. The next work should deepen the UX and field model,
not replace the service boundary.

### 2. Sector Funnels And Blueprints

Blueprints should become applicable commercial templates. A blueprint should be
able to define:

- pipeline template;
- default stages;
- custom fields;
- default score rules;
- lead source defaults;
- message templates;
- automation templates;
- reporting presets;
- onboarding checklist.

The first target blueprints are:

- clinics;
- real estate;
- vehicle dealers;
- repair shops;
- agencies.

### 3. Real WhatsApp Path

The existing omnichannel module should receive one real WhatsApp provider path.
The first live channel must support:

- provider account/channel connection;
- webhook reception;
- contact persistence;
- conversation and message persistence;
- lead linking;
- internal inbox;
- manual sending from the Hub;
- human handoff;
- AI summary;
- intent classification;
- AI reply suggestion;
- CRM timeline sync.

The existing simulator remains for demos and tests, but no longer counts as the
main product experience.

### 4. Landing Pages

Landing Pages become a first-class module. The Hub does not need a page builder
in the first slice. It needs a professional approval, routing, tracking, and
performance surface.

Landing pages should store:

- client and contract;
- optional project;
- objective;
- sector;
- status;
- preview URL;
- published URL;
- thumbnail URL;
- primary CTA type and value;
- campaign linkage;
- pipeline and initial stage;
- default responsible user;
- form and field mapping;
- version history;
- approval/change-request history;
- generated leads and conversion metrics.

### 5. Campaigns And Ads API-First

Campaigns should be implemented as an API-first module from the first serious
slice. Manual and organic campaigns can exist, but the main direction is real
Meta/Google account connection, campaign creation, campaign management, and
metric sync.

Meta and Google are both part of the campaign target. Implementation can land
Meta first as an intermediate checkpoint only if needed, but the campaign module
is not complete until the same API-first lifecycle exists for Google as well.
The schema and UI must be provider-neutral enough to support both without
rewriting the module.

Provider mutations must use a controlled lifecycle:

1. create draft in Hub;
2. attach campaign structure, landing page, funnel, UTM, creatives, and budget;
3. collect internal/client approval;
4. execute provider API mutation through an Edge Function;
5. store external IDs and mutation logs;
6. sync provider status and metrics.

Required safety:

- idempotency key per provider mutation;
- before/after audit for budget and status changes;
- `needs_reauth` state for token failures;
- no destructive delete as default; prefer pause/archive;
- protected error text;
- client-safe portal visibility.

### 6. Configurable AI Assistant

The AI assistant is configured per client/contract and feeds conversations,
follow-up, and CRM classification.

It should store:

- agent name;
- tone of voice;
- objective;
- fields to collect;
- FAQ/knowledge references;
- handoff rules;
- forbidden topics and escalation rules;
- summary prompt settings;
- classification settings.

### 7. Flow Builder Lite

Automations become visible and configurable inside the Hub. They may execute via
Edge Functions or n8n, but the Hub must own the business configuration.

Initial primitives:

- triggers;
- conditions;
- actions;
- execution logs;
- retry/disable state;
- sector templates.

Triggers should cover lead created, stage changed, idle lead, message received,
conversation unanswered, proposal decision, ticket created, date, and field
updated.

Actions should cover send WhatsApp, create task, change stage, assign owner,
create reminder, notify internal user, create ticket, update field, run AI, and
register activity.

### 8. Operational Reports

Reports should prove commercial value before advanced BI exists.

Initial reports:

- leads by source;
- conversion by stage;
- average response time;
- leads without response;
- stalled opportunities;
- messages by period;
- resolved conversations;
- proposals sent and approved;
- campaign spend, leads, CPL, and MROI;
- landing page visits, conversions, and conversion rate;
- owner activity.

## Navigation Model

Internal YUX menu should move toward:

- Dashboard;
- Clientes;
- CRM & Funis;
- Conversas IA;
- Landing Pages;
- Campanhas;
- Automacoes;
- Projetos & Entregas;
- Propostas;
- Relatorios & ROI;
- Suporte;
- Financeiro;
- Blueprints;
- Configuracoes.

Client portal should move toward:

- Visao Geral;
- Leads & Funil;
- Conversas IA;
- Landing Pages;
- Campanhas;
- Relatorios;
- Aprovacoes;
- Documentos;
- Suporte;
- Financeiro.

The current module registry should be extended rather than bypassed. New
commercial modules must still respect contract modules and permissions.

## Data Boundary

The schema should add new commercial entities without duplicating existing
records:

- CRM leads remain the source for lead status, owner, score, and timeline.
- Omnichannel conversations remain the source for message history.
- Proposals remain the source for commercial offers and conversion.
- Projects remain the source for delivery work after conversion.
- Landing pages and campaigns add attribution and funnel-entry context.
- Reports should aggregate from canonical operational tables, not from
  duplicated snapshots except when explicitly storing historical report
  snapshots.

## UI Direction

The app should feel like a polished commercial operating system:

- dense but attractive dashboards;
- Kanban and board views where they communicate movement;
- asset cards for landing pages, campaigns, creatives, and conversations;
- clear status badges and next actions;
- side panels/drawers for details;
- timeline views for trust;
- compact metrics that show value quickly;
- client portal views that hide operational internals but show recognizable
  assets and results.

Avoid generic placeholder pages for these priority modules. Each route should
show a real workflow, even if the first slice uses limited data.

## Integration Boundary

Frontend must not hold provider secrets or perform provider mutations directly.

Provider operations should go through Supabase Edge Functions and store:

- sanitized request summary;
- sanitized response summary;
- protected error;
- provider account;
- external object IDs;
- idempotency key;
- actor;
- status;
- timestamps.

The frontend consumes typed services and surfaces operational states such as:

- `connected`;
- `stale`;
- `needs_reauth`;
- `syncing`;
- `failed`;
- `draft`;
- `pending_approval`;
- `published`.

## Out Of Scope For This MVP

- advanced finance;
- payment gateway;
- fiscal issuance;
- bank reconciliation;
- complex support SLA;
- advanced support attachments;
- white-label;
- marketplace;
- many external CRM integrations;
- live Instagram/email providers before the first WhatsApp path;
- advanced BI beyond operational reports;
- drag-and-drop landing page builder.

## Success Criteria

The commercial MVP is successful when YUX can demo:

1. a sector blueprint creating a funnel structure;
2. a lead entering from a landing page or WhatsApp CTA;
3. the lead moving through a Kanban pipeline;
4. a WhatsApp conversation linked to the lead;
5. an AI summary/classification for that conversation;
6. a campaign created/managed through a provider API path;
7. a landing page tied to campaign and funnel metrics;
8. simple automation actions based on lead/conversation state;
9. a client portal showing pipeline, landing pages, campaigns, conversations,
   and reports;
10. reports that show leads, CPL, response time, proposal conversion, and MROI.
