# YUX OS Omnichannel AI Design

## Objective

Deliver an operational omnichannel service center for YUX and contracted
clients. The module replaces the WhatsApp IA placeholder with a shared core for
WhatsApp, Instagram, email, and webchat while keeping provider credentials and
provider-specific APIs outside the frontend.

The first implementation delivers a complete internal and client-facing
operational base, provider-neutral n8n contracts, logs, simulators for external
channels, and a functional embeddable webchat. Real provider credentials and
mass marketing campaigns remain outside this slice.

## Scope

This slice includes:

- unified inbox for WhatsApp, Instagram, email, and webchat;
- organization-owned contacts, conversations, messages, attachments, tags,
  queues, teams, assignments, and SLA status;
- YUX cross-organization supervision with protected operational details;
- client operation restricted to the contracted organization;
- automatic AI service mode with organization-configurable assisted mode;
- traceable summaries, classification, confidence, fallback, latency, token
  use, and estimated cost;
- configurable combined handoff rules;
- manual handoff, assignment, reassignment, and automatic routing;
- automatic CRM lead creation and updates with organization filtering rules;
- scheduling requests dispatched through provider-neutral n8n contracts;
- individual human messages and transactional automations;
- organization knowledge base with draft, review, and publication;
- configurable retention and anonymization settings;
- embeddable webchat widget with consent, initial form, conversation,
  attachments, and human transfer;
- provider-neutral adapters, webhook contracts, logs, and simulators for
  WhatsApp, Instagram, and email.

This slice does not include:

- provider credentials or direct provider SDK integration;
- Evolution API, Z-API, Meta Instagram Messaging API, or email-provider setup;
- OAuth integrations;
- Google Calendar, Calendly, or other scheduling-provider connections;
- mass messaging, segmented lists, or marketing campaigns;
- automated retention cleanup jobs;
- autonomous agents beyond bounded service generation and routing.

## Architecture

The omnichannel module is a vertical service slice shared by internal YUX
operators and contracted clients. It is decomposed into six bounded units.

### Unified Inbox

The inbox owns contacts, conversations, messages, attachments, tags, status,
SLA metadata, and responsible users. Channel-specific payload details remain
stored as protected metadata and never leak into UI-specific logic.

### Service Engine

The service engine records automatic or assisted responses, summaries,
classification, confidence, token consumption, estimated cost, latency,
fallback status, and protected failures. It is provider-neutral and can use n8n
or a future code-owned worker.

### Handoff And Queues

The handoff engine evaluates configurable combined rules and records why a
conversation was transferred. Queues route conversations by team,
availability, lead owner, explicit rule destination, or supervisor action.

### CRM Synchronization

The CRM bridge creates or updates leads according to organization settings. It
updates score, tags, responsible user, tasks, history, summary, qualification,
intent, and scheduling metadata while recording the originating conversation.

### Knowledge Base

Knowledge content belongs to one organization. Documents, URLs, and manually
entered answers move through `draft`, `in_review`, and `published` states.
Only published content can feed the service engine.

### Channel Adapters

All channels implement one provider-neutral contract. n8n remains the invisible
orchestrator for external channels. Webchat is implemented directly through a
revocable public widget boundary. WhatsApp, Instagram, and email initially use
simulators and the same webhook contract that future real providers will call.

## Data Model

### Operation Records

Add:

- `channel_connections`: organization-owned channel configuration, adapter
  kind, status, protected metadata reference, and timestamps.
- `omnichannel_contacts`: organization-owned contact identity, optional CRM
  lead and client links, channel identities, consent, and profile metadata.
- `conversations`: contact, connection, channel, queue, responsible user,
  service mode, status, SLA timestamps, summary, classification, sentiment,
  commercial intent, scheduling intent, and timestamps.
- `messages`: conversation, direction, sender kind, content type, body,
  external ID, delivery status, provider-neutral metadata, and timestamps.
- `message_attachments`: message metadata, controlled storage path, media type,
  size, retention deadline, and timestamps.
- `conversation_tags`: conversation tags used by filtering and routing.
- `conversation_assignments`: assignment history, reason, source, responsible
  user, team, and timestamps.
- `omnichannel_teams`: organization teams and availability mode.
- `omnichannel_team_members`: team membership and availability status.
- `conversation_queues`: organization queues, routing strategy, SLA settings,
  and status.

### Automation Records

Add:

- `handoff_rules`: organization-owned ordered rules with JSON conditions,
  combination mode, destination queue or team, active flag, and timestamps.
- `handoff_events`: conversation transfer event, matched rules, reason,
  previous and next assignment, and timestamps.
- `channel_webhook_events`: idempotent inbound event log by connection and
  external event ID.
- `outbound_message_runs`: traceable dispatch attempts, n8n state, retry count,
  protected error text, and timestamps.
- `scheduling_requests`: contact, conversation, requested time windows,
  adapter state, external reference, and timestamps.
- `ai_message_runs`: conversation and message links, logical provider, logical
  model, tokens, estimated cost, latency, fallback, protected error text, and
  timestamps.

### Knowledge Records

Add:

- `knowledge_sources`: organization document, URL, or manual-answer source,
  review status, retention metadata, and timestamps.
- `knowledge_entries`: source-derived or manually written content fragments,
  review state, and timestamps.
- `knowledge_publications`: immutable publication record with content snapshot
  and timestamps.

### Configuration Records

Add:

- `omnichannel_settings`: organization service mode, retention policy,
  anonymization settings, CRM sync filters, SLA defaults, and widget options.
- `webchat_widgets`: organization widget identity, revocable public token hash,
  allowed origins, consent copy, initial-form configuration, and timestamps.

Existing records remain the source of truth for:

- organizations, memberships, roles, permissions, contracts, and modules;
- CRM pipelines, stages, leads, tasks, interactions, and automation executions;
- clients and projects;
- Supabase Auth users;
- Supabase Storage metadata and policies.

## Channels

### WhatsApp

WhatsApp uses the generic inbound and outbound contracts. The initial delivery
includes simulator payloads, webhook processing, logs, and outbound n8n queue
records. Provider credentials are configured in a separate provider-connection
slice without changing inbox UI or domain records.

### Instagram

Instagram follows the same adapter boundary and initial simulator strategy.
Provider-specific identifiers remain protected metadata.

### Email

Email follows the same adapter boundary and initial simulator strategy.
Threading identifiers remain protected metadata.

### Webchat

Webchat is functional in the first delivery. A customer embeds a generated
snippet on a website. The widget loads organization configuration through a
revocable public token, validates the allowed origin, shows consent and the
initial form, creates or resumes a conversation, sends and receives messages,
uploads permitted attachments, and allows human transfer.

## Handoff Rule Engine

Rules are organization-owned, ordered, configurable, and independently
testable. A rule stores JSON conditions and a combination mode.

Supported conditions include:

- explicit request for a human;
- low AI confidence;
- configurable critical words;
- manual operator command;
- lead qualification;
- purchase intent;
- scheduling intent;
- operating hours;
- SLA breach or near breach;
- sentiment;
- repeated contact;
- channel;
- tag;
- queue;
- current responsible user.

Supported routing outcomes include:

- destination queue;
- destination team;
- lead owner;
- available team member;
- fixed responsible user;
- supervisor review queue.

Every automatic or manual handoff creates an immutable event with its matched
rules and reason.

## CRM Synchronization

CRM synchronization is automatic by default and configurable by organization.

The bridge:

1. finds or creates a contact from channel identity;
2. evaluates filters that exclude irrelevant contacts;
3. finds or creates a lead when applicable;
4. links contact, conversation, and lead;
5. updates summary, qualification, score, tags, source, responsible user,
   follow-up tasks, scheduling requests, and CRM interaction history;
6. records synchronization metadata for auditing.

Conversation records never replace CRM records. CRM remains the commercial
source of truth.

## Service Modes

Each organization configures:

- `automatic`: the engine may enqueue outbound responses automatically;
- `assisted`: the engine creates suggestions that require human approval.

Operators can transfer any conversation to a human manually. Handoff rules can
also override automatic mode.

## Scheduling

The module records scheduling intent and requested time windows. A
provider-neutral outbound run invokes n8n when a scheduling integration is
configured. Provider-specific calendar connectors remain outside this slice.

## Knowledge Workflow

Knowledge sources may be documents, URLs, or manual answers.

The workflow is:

1. create or import source as `draft`;
2. edit generated or manual entries;
3. submit source for review;
4. approve and publish an immutable publication snapshot;
5. expose only published content to the service engine.

Draft and review content must never influence automatic answers.

## Retention And Privacy

Each organization receives a default 12-month message retention policy and a
separate attachment retention policy. Settings support future anonymization and
cleanup jobs.

This slice stores retention deadlines and exposes configuration surfaces. It
does not execute automated cleanup. Public widget access is limited to its
configured organization and allowed origins.

## Internal YUX Experience

Replace `/whatsapp-ai` with `/omnichannel`.

The internal workspace includes:

- cross-organization inbox;
- filters for organization, channel, queue, team, responsible user, status,
  SLA, tag, and handoff state;
- conversation history and attachments;
- AI summary, classification, confidence, cost, and latency;
- linked CRM lead and client;
- manual message, assume, assign, reassign, handoff, retry, and mode commands;
- team and queue administration;
- handoff-rule administration;
- knowledge-source review and publication;
- widget configuration and snippet display;
- inbound, outbound, AI, and synchronization logs;
- channel simulators.

## Client Portal Experience

Replace `/portal/whatsapp-ai` with `/portal/omnichannel`.

The contracted client workspace includes:

- own-organization inbox;
- conversation operation and assignment;
- permitted team, queue, and handoff-rule administration;
- knowledge-source editing, review, and publication;
- widget configuration and snippet display;
- operational metrics;
- simulator access where enabled for onboarding.

The portal never exposes:

- other organizations;
- protected provider metadata;
- protected errors;
- YUX-only notes;
- internal YUX costs and margin data.

## Webhook And Edge Boundaries

Add provider-neutral Edge Function boundaries:

- `receive-channel-event`: validates adapter event input, stores idempotent
  event, creates or updates contact and conversation, stores inbound message,
  runs CRM synchronization, and evaluates service mode and handoff.
- `dispatch-outbound-message`: validates authorized outbound runs and dispatches
  external-channel payloads to n8n.
- `process-ai-message`: loads authorized context and published knowledge,
  invokes n8n or a future worker, records traceable generation metadata, and
  stores automatic response or assisted suggestion.
- `submit-webchat-event`: validates widget token and origin, receives webchat
  actions, and returns prospect-safe conversation state.
- `retry-outbound-message`: retries failed dispatch without duplicating
  successful external events.

External channel webhooks must remain provider-neutral. n8n maps real provider
payloads into the YUX contract.

## Failure Handling

Inbound failures:

- preserve idempotent event metadata;
- mark processing failure without duplicating messages;
- allow protected retry.

Outbound failures:

- retain queued message and outbound run;
- record attempt count and protected error;
- allow retry without duplicating successful dispatches.

AI failures:

- record provider-neutral metadata and protected errors;
- use fallback or assisted mode according to organization settings;
- never lose inbound messages.

CRM synchronization failures:

- preserve conversation operation;
- record sync failure;
- allow retry without duplicating leads or history entries.

## Authorization And RLS

Internal YUX users supervise all organizations.

Client portal users access records only when:

- membership belongs to the target client organization;
- active contract enables `whatsapp_ai`;
- role permissions allow the requested operation.

Public webchat:

- authenticates with a revocable hashed widget token;
- validates allowed origins;
- accesses only one organization widget configuration;
- never receives protected errors, costs, internal metadata, or other
  conversations.

Every public table enables RLS. Privileged functions remain under `private`.
Browser code receives only publishable keys.

## Testing And Verification

Add pure-rule tests for:

- webhook idempotency;
- handoff rule combination and ordering;
- automatic and assisted service modes;
- queue routing outcomes;
- CRM contact filtering and lead-upsert decisions;
- retention deadline calculation;
- knowledge publication eligibility;
- AI cost calculation;
- widget allowed-origin validation.

Add SQL probes for:

- all new public tables with RLS enabled;
- internal cross-organization supervision;
- portal own-organization access;
- cross-organization denial;
- module-disabled denial;
- widget token hashing and revocation;
- webhook event idempotency;
- protected cost and error visibility;
- published-only knowledge access.

Add browser smoke tests for:

- internal inbox and conversation operation;
- portal inbox isolation;
- automatic and assisted modes;
- handoff and reassignment;
- CRM lead creation or update;
- knowledge publication;
- widget consent, form, conversation, attachment metadata, and handoff;
- simulator inbound and outbound flows.

## Delivery Sequence

Implement this slice in dependency order:

1. pure domain rules and types;
2. operation, automation, knowledge, configuration, and RLS schema;
3. typed service layer;
4. provider-neutral webhook and simulator boundaries;
5. inbox, handoff, teams, queues, knowledge, and metrics surfaces;
6. functional webchat widget;
7. CRM synchronization;
8. remote migrations, Edge Function deployment, and focused verification.
