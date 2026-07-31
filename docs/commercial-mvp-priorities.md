# YUX Hub Commercial MVP Priorities

Updated: 2026-06-03

This document captures the current product recommendation after comparing the
implemented YUX OS foundation with the commercial promise of YUX: WhatsApp IA,
CRM, automation, funnels, and operational reporting.

## Direct Diagnosis

YUX OS already has a relevant foundation:

- contracts, packages, modules, and portal access;
- projects, deliverables, and approvals;
- CRM and follow-up foundation;
- proposal workflow and conversion;
- provider-neutral omnichannel base;
- basic finance;
- basic support.

The strongest commercial gap is not the lack of platform structure. The gap is
that the current product does not yet demonstrate the strongest sales promise
well enough: a native YUX Hub for CRM, conversations, WhatsApp IA, funnels,
automation, and simple proof-of-value reporting.

The omnichannel base already stores channel connections, contacts,
conversations, messages, handoff events, outbound runs, AI runs, CRM sync,
knowledge primitives, webchat, and internal/portal workspaces. However, the
status still explicitly defers live WhatsApp/Instagram/email credentials,
provider adapters, production n8n workflows, and real queue operations.

That means the architecture is prepared, but the strongest sellable product is
not complete yet.

## Recommendation Change

The immediate focus should move from:

> Lean Hub plus external tools and automations outside the platform.

To:

> YUX Hub as the native cockpit for CRM, conversations, funnels, automation,
> reactivation, and reporting, using external tools only where they are still
> unavoidable.

The goal is not to clone RD Station, GoHighLevel, n8n, or a full helpdesk. The
goal is to make the demo feel like a professional operating system for a real
client operation.

## Priority 1: CRM Commercial Core

The CRM should become a central operating area, not a simple lead registry.

Minimum strong scope:

- pipeline Kanban by client/contract;
- leads, contacts, and companies;
- configurable pipeline stages;
- sector-specific custom fields;
- lead source;
- lead owner;
- simple score;
- tasks and follow-ups;
- activity timeline;
- notes;
- won/lost state and loss reason;
- CSV/manual import;
- conversion into client, project, proposal, or contract.

Why this matters:

- the existing plan already includes leads, pipeline stages, source, score,
  owner, follow-ups, notes, tasks, and conversion;
- this is an acceleration of planned scope, not a direction change;
- visually, a Kanban CRM demo sells the operational value much better than a
  generic record table.

## Priority 2: Sector Funnels And Blueprints

Funnels should be operational templates, not only landing page concepts.

The Hub should support configurable pipelines with reusable sector templates.
Initial blueprint targets:

- clinics;
- real estate;
- vehicle dealers;
- repair shops;
- agencies.

Example pipeline templates:

- Clinics: new lead, AI triage, pending appointment, confirmed appointment,
  attended, post-appointment, future reactivation.
- Real estate: new lead, qualification, assigned broker, visit scheduled, visit
  completed, proposal, won/lost.
- Vehicle dealers: new lead, validated interest, trade-in/financing,
  test-drive, proposal, sale/lost.
- Repair shops: new contact, diagnosis scheduled, quote sent, follow-up,
  approved, service completed, next revision.

Blueprints should eventually define:

- suggested modules;
- default pipeline stages;
- custom fields;
- message templates;
- automation templates;
- onboarding tasks;
- reporting defaults;
- checklists.

This makes the product look verticalized before it becomes a giant generic CRM.

## Priority 3: Real WhatsApp Path

The omnichannel module should evolve from provider-neutral foundation to one
real WhatsApp path that works well.

Minimum strong scope:

- connect one WhatsApp number/channel through a chosen provider;
- receive messages by webhook;
- persist contact, conversation, and messages;
- link conversation to lead;
- show an internal inbox;
- use conversation statuses such as new, in service, waiting client, resolved;
- support AI-to-human handoff;
- generate automatic conversation summary;
- classify intent;
- suggest AI reply;
- send manual messages from the Hub;
- support automated send by simple flow;
- show full conversation history in the CRM;
- track basic metrics: response time, volume, and conversions.

Keep the simulator for demo/testing, but stop treating the simulator as enough
for the product promise.

## Priority 4: Campaigns And Ads API-First

Campaigns should become a native module from the start, and unlike other
integrations that can begin as read-only, campaigns should be designed
API-first.

The first campaign slice should already support real provider integration for
creation and management, not only manual registration or metric import.

Initial provider target:

- Meta Ads and Google Ads, with one provider allowed to land first if required
  by implementation risk.

Minimum strong scope:

- connect ad accounts through OAuth/provider credentials;
- list external accounts and campaigns;
- create campaign drafts inside the Hub;
- push approved campaigns to the provider API;
- create and manage campaign structure required by the provider, such as
  campaign, ad set/ad group, ads, creatives, copy, CTA, budget, schedule, and
  destination;
- update campaign status, including active, paused, archived, and deleted when
  supported safely by the provider;
- update daily/total budget with approval and audit trail;
- associate campaigns with landing pages, WhatsApp CTA, CRM pipeline, initial
  lead stage, and UTM values;
- sync spend, impressions, clicks, CTR, CPC, leads, conversions, CPL, cost per
  result, and provider status;
- expose internal recommendations and alerts for high CPL, no-lead campaigns,
  budget exhaustion, tracking gaps, and underdelivery;
- show client-facing campaign cards, investment, status, leads, CPL, creatives,
  landing page, and simple evolution chart.

Required safety controls:

- provider actions should be staged as drafts before execution;
- client approval or internal manager approval should be required before
  creating or materially changing campaigns;
- every provider mutation must store an execution log with request summary,
  response summary, external IDs, status, actor, and protected error text;
- idempotency keys should prevent duplicate campaign creation;
- destructive operations should prefer pause/archive over delete;
- budget changes need explicit before/after values;
- token refresh and permission failures must surface as operational states such
  as `needs_reauth`, not as silent failures.

This changes the earlier conservative campaign recommendation. For the YUX
commercial promise, campaigns are too central to begin as a manual-only module.
The UI and schema should still support manual and organic campaigns, but the
main implementation direction is integrated creation and management via API.

## Priority 5: Landing Pages

Landing pages should become their own module because they are visible assets the
client understands and they bridge campaigns into the CRM.

The Hub does not need a visual page builder at first. YUX can still build pages
in React, Next.js, WordPress, static HTML, or another delivery path. The Hub
should manage, approve, publish, track, and connect the page to the funnel.

Minimum strong scope:

- landing page record with client, contract, project, sector, objective, status,
  preview URL, published URL, thumbnail, and CTA;
- association with campaign, CRM pipeline, initial stage, and responsible user;
- form definition and field mapping into lead fields;
- WhatsApp CTA tracking with UTM and landing page ID;
- client review, change request, and approval;
- basic metrics: visits, conversions, leads, conversion rate, and source;
- generated leads visible from the landing page and CRM.

Out of scope for the first slice:

- drag-and-drop builder;
- client-side direct editing;
- sophisticated native A/B testing;
- complex multi-tenant hosting;
- advanced dynamic personalization.

## Priority 6: Configurable AI Assistant

The first AI assistant does not need to be fully autonomous. It needs to be
configurable per client and safe enough for "WhatsApp IA with human control."

Minimum scope:

- agent name;
- tone of voice;
- main objective: qualify, schedule, answer questions, or support;
- client knowledge base;
- FAQs;
- handoff rules;
- required fields to collect;
- automatic summary;
- lead classification;
- safety limits: what not to answer and when to transfer.

## Priority 7: Flow Builder Lite

The Hub should have a simple native automation builder. It does not need to be
a full Make/n8n clone.

### Triggers

- lead created;
- lead changed stage;
- lead idle for X days;
- message received;
- conversation unanswered for X hours;
- proposal sent;
- proposal approved or rejected;
- ticket created;
- specific date;
- field updated.

### Conditions

- stage equals a configured value;
- source equals a configured value;
- score above threshold;
- sector equals a configured value;
- conversation is waiting for client;
- business hours;
- owner exists or does not exist.

### Actions

- send WhatsApp;
- create task;
- change stage;
- assign owner;
- create reminder;
- notify internal user;
- create ticket;
- update field;
- run AI classification or summary;
- register activity.

This can still call n8n or Edge Functions behind the scenes. The important
product shift is that the business user sees and configures the flow inside the
Hub.

## Priority 8: Simple Operational Reports

Reports should prove value before advanced BI exists.

Minimum scope:

- leads by source;
- conversion rate by stage;
- average response time;
- leads without response;
- stalled opportunities;
- messages by period;
- resolved conversations;
- proposals sent and approved;
- activity by owner.

Avoid overbuilding advanced BI before these operational reports exist.

## Strong Sellable MVP Target

The next sellable YUX Hub target should be:

### Module 1: Commercial CRM

- pipeline Kanban;
- lead list;
- contact/company record;
- lead source;
- owner;
- stage;
- score;
- tasks;
- follow-up;
- history;
- notes;
- won/lost state;
- conversion to client/project/proposal.

### Module 2: Conversations And WhatsApp IA

- inbox;
- received/sent messages;
- contact linked to lead;
- conversation status;
- handoff;
- AI summary;
- intent classification;
- AI reply suggestion;
- manual send;
- one real WhatsApp provider integration;
- simulator retained for testing/demo.

### Module 3: Automations Lite

- flow list;
- active/inactive state;
- trigger;
- condition;
- action;
- execution history;
- errors;
- sector templates.

### Module 4: Landing Pages

- internal landing page registry;
- preview and published URL;
- screenshot/thumbnail;
- form field mapping;
- WhatsApp CTA tracking;
- pipeline and initial stage routing;
- client approval and change requests;
- leads and conversion metrics.

### Module 5: Campaigns And Ads

- Meta/Google account connection;
- campaign creation via provider API;
- provider campaign/ad set/ad/ad group structure where applicable;
- creative/copy/CTA management;
- budget and schedule management;
- approval before provider mutation;
- status sync and status updates;
- landing page and WhatsApp CTA association;
- CRM pipeline routing;
- daily metric sync;
- CPL, spend, conversion, and MROI basics;
- alerts and recommendations;
- client-facing campaign performance view.

### Module 6: Funnels And Blueprints

- clinics blueprint;
- real estate blueprint;
- dealers blueprint;
- repair shops blueprint;
- agencies blueprint;
- default pipeline;
- custom fields;
- message templates;
- suggested automations;
- onboarding tasks.

### Module 7: Operational Reports

- leads by source;
- stage conversion;
- average response time;
- unanswered leads;
- stalled opportunities;
- messages by period;
- resolved service count;
- proposal sent/approved count;
- owner activity.

### Module 8: Client Portal Value

- contracted pipeline visibility;
- simple reports;
- approvals;
- documents;
- support;
- conversation summaries where allowed;
- landing pages;
- campaigns and creatives;
- active automation status.

## Commercial Gap

Current commercial promise:

> YUX integrates WhatsApp, CRM, AI, automation, funnels, and reports to sell
> more and operate better.

Current implemented product:

> YUX OS has a modular foundation with portal, projects, CRM foundation,
> omnichannel foundation, proposals, finance, and support.

The three most dangerous gaps are:

1. WhatsApp IA is promised, but no real provider path is live yet.
2. CRM is promised as a sales engine, but the current state is still a
   foundation.
3. Automations are promised as an operating system, but the Hub does not yet
   expose a broad native builder/execution surface.
4. Campaigns and landing pages are recognizable commercial assets, but the Hub
   does not yet expose them as native assets tied to lead capture and ROI.

## Deprioritize For Now

Pause or keep minimal:

- advanced finance;
- payment gateway;
- fiscal issuance;
- bank reconciliation;
- complex support SLA;
- advanced support attachments;
- white-label;
- marketplace;
- many external CRM integrations;
- Instagram/email live channels before the first WhatsApp path;
- advanced BI.

The already implemented basic finance and support modules are good enough for
the current commercial phase. They should not consume the next major build
cycle unless they block a real client.

## Recommended Next Development Sequence

1. Deepen CRM into a visual commercial pipeline with lead tasks, ownership,
   scoring, history, and sector fields.
2. Add sector funnel templates and blueprint application primitives.
3. Implement one real WhatsApp provider path into the existing omnichannel
   schema.
4. Add Landing Pages as tracked, approvable funnel assets.
5. Add Campaigns And Ads with API-first creation and management for Meta/Google.
6. Add configurable AI assistant settings tied to a client/contract.
7. Add Flow Builder Lite with triggers, conditions, actions, and execution
   logs.
8. Add simple operational reports for CRM/conversations/campaigns/proposals.

This sequence aligns the product with what YUX most needs to sell now: CRM plus
WhatsApp IA plus campaigns plus landing pages plus automation plus funnels plus
proof-of-value reporting.
