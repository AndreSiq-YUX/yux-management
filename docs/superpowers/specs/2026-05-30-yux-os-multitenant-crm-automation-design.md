# YUX OS Multitenant CRM Automation Design

## Objective

Deliver a usable multi-organization CRM for YUX and contracted clients. The CRM must support configurable pipelines, daily lead operation, editable follow-up sequences, and traceable n8n webhook executions without coupling the application to WhatsApp or email providers.

## Scope

This slice includes:

- configurable pipelines and ordered stages per organization;
- organization ownership for leads;
- lead CRUD, score, source, assignee, expected value, and stage movement;
- commercial interactions and internal follow-up tasks;
- editable automation sequences with WhatsApp, email, and internal task steps;
- enrollment of leads into sequences;
- webhook dispatch through a protected backend boundary;
- execution logs, attempts, failures, and manual retry;
- internal YUX CRM and client portal CRM surfaces;
- RLS by organization membership and contracted CRM access.

This slice does not include commercial diagnostics, proposals, conversion into contracts or projects, provider credentials, direct provider SDKs, or a visual workflow editor.

## Architecture

### Organization Boundary

Every CRM record belongs to an organization. The YUX organization owns the internal commercial pipeline. Each client organization can own independent pipelines and leads when its active contract enables the CRM module.

Database policies remain authoritative:

- internal YUX users can access the YUX organization and administer client CRM contexts;
- client members can access only their organizations;
- client CRM access additionally requires an active contract with the CRM module enabled.

### Pipeline Model

Pipelines are configurable records, not hardcoded enums. Each pipeline owns ordered stages with labels, colors, win/loss flags, and active state. An organization receives a default commercial pipeline that can later be extended by blueprints.

Existing lead stage values remain available during migration but application workflows use stage records after the backfill.

### Follow-Up Model

A sequence is an editable ordered list of steps:

- `whatsapp`;
- `email`;
- `internal_task`.

Each step defines delay, template content, and active state. A lead enrollment records its current position, next execution time, status, and pause state. Users can pause, resume, reschedule, edit the next action, and assume manual handling.

### Automation Boundary

External messaging is dispatched through a protected server-side function that sends a normalized event to an n8n webhook. Provider credentials stay outside the browser and outside CRM tables.

Each execution records:

- organization;
- lead and enrollment;
- action type;
- normalized payload;
- status;
- attempt count;
- last error;
- request and completion timestamps.

Failed executions can be retried manually. Internal tasks are persisted directly and do not depend on n8n availability.

## Data Model

### New Tables

`crm_pipelines`

- organization reference;
- name, description, default flag, active flag;
- audit timestamps.

`crm_pipeline_stages`

- pipeline reference;
- key, name, color, order index;
- win/loss flags and active flag;
- audit timestamps.

`crm_tasks`

- organization and lead references;
- title, description, status, due date, assignee;
- optional sequence enrollment reference;
- audit timestamps.

`crm_sequences`

- organization reference;
- name, description, active flag;
- audit timestamps.

`crm_sequence_steps`

- sequence reference;
- action type, delay, subject, body, active flag, order index;
- audit timestamps.

`crm_sequence_enrollments`

- organization, sequence, and lead references;
- status, current step, next execution time;
- manual override details;
- audit timestamps.

`automation_executions`

- organization, lead, enrollment, and step references;
- action, payload, status, attempt count, last error;
- timing fields and audit timestamp.

### Existing Tables To Extend

`leads`

- add `organization_id`;
- add `pipeline_id`;
- add `stage_id`;
- add `next_follow_up_at`;
- retain legacy `stage` while migration and compatibility code remain necessary.

`interactions`

- add `organization_id`;
- retain its existing lead or client reference constraint.

## Application

### Shared CRM Workspace

Build a reusable CRM workspace receiving the active organization context and permission mode. It powers:

- internal route `/leads`;
- client portal route `/portal/crm`.

The workspace includes:

- pipeline selector;
- Kanban stages with lead cards;
- lead creation and editing;
- stage movement;
- lead detail drawer or modal;
- interaction history;
- commercial tasks;
- sequence enrollment and manual controls;
- automation execution status and retry.

### Client Portal

The portal exposes CRM only when enabled by the active contract and membership permissions. Client users operate their own pipeline; they never see YUX leads or another client's records.

### Internal YUX View

Internal users default to the YUX organization. The service layer accepts an explicit organization context to support later administration of client CRM environments without weakening RLS.

## Data Flow

1. A user opens the CRM workspace for an authorized organization.
2. The workspace loads pipelines, stages, leads, tasks, sequences, and recent automation executions.
3. The user creates a lead or moves it between stages.
4. The user may enroll the lead into a follow-up sequence.
5. A scheduler or manual action creates the next automation execution.
6. Internal tasks are persisted locally; external actions are posted server-side to n8n.
7. The execution status and error are stored for visibility and retry.
8. Manual edits update the enrollment without deleting execution history.

## Error Handling

- Reject CRM reads and writes outside the active organization membership boundary.
- Reject client CRM access when the active contract does not enable the CRM module.
- Reject stages from a different pipeline or organization.
- Reject enrollments combining records from different organizations.
- Preserve execution history after failures.
- Show actionable UI errors while preserving entered lead and sequence data.
- Keep external webhook failures visible and manually retryable.

## Testing

Focused verification covers:

- stage ordering and pipeline ownership;
- enrollment next-action rules;
- manual pause, reschedule, and takeover controls;
- RLS for YUX users, own-client access, disabled-module denial, and cross-client denial;
- execution logging and retry;
- internal task persistence independent of webhooks;
- type checking and production build;
- browser smoke flows for YUX CRM and client portal CRM.

## Implementation Order

1. Add schema, backfill, constraints, and RLS.
2. Add pure domain rules and typed service operations.
3. Build the reusable CRM workspace and internal route.
4. Add sequence controls, execution logs, and retry boundary.
5. Enable the client portal CRM route.
6. Validate Supabase policies, automated checks, and browser flows.

