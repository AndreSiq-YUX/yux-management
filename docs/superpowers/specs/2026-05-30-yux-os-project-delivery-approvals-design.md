# YUX OS Project Delivery And Approvals Design

## Objective

Complete the project delivery vertical slice by extending the existing projects, phases, and tasks foundation with client-visible tasks, deliverables, reusable approvals, and a filtered activity timeline. The internal YUX OS and the client portal must use the same source of truth while exposing different levels of detail.

## Scope

This slice includes:

- task visibility controls for the client portal;
- deliverables linked to projects and optionally to phases;
- generic approval requests reusable by future documents and creative assets;
- final client decisions with preserved history;
- automatic project events and manual timeline updates;
- internal project management surfaces;
- a functional client portal projects area;
- focused tests, Supabase validation, and browser smoke verification.

This slice does not include document storage, creative asset management, multiple sequential approvers, notifications, deployment, or a broad security audit.

## Design Decisions

### Approval Model

Approvals are generic from the start. An approval request identifies its target with `target_type` and `target_id`, so future modules can reuse the same workflow without replacing a deliverable-specific schema.

The initial workflow has one current final decision per request:

- `APPROVED`;
- `CHANGES_REQUESTED`;
- `REJECTED`.

Each submitted decision records the actor, comment, and timestamp in an append-only history. A later decision supersedes the current outcome without deleting earlier records.

### Visibility Model

Internal users manage all records. Client users can only access records belonging to their active client context.

Tasks are shown in the portal only when `is_client_visible = true`. Deliverables and timeline entries follow the same explicit visibility principle. Approval requests are visible to the client only when they belong to a visible target within the client's project.

### Timeline Model

The project timeline stores:

- automatic events for relevant state changes;
- manual internal updates;
- manual client-visible updates.

Automatic events cover deliverable creation, approval submission, client decision, and relevant status changes. Internal-only events remain hidden from the portal.

## Data Model

### Existing Tables To Extend

`project_tasks`

- add `is_client_visible boolean not null default false`.

### New Tables

`project_deliverables`

- project and optional phase reference;
- title, description, status, due date, delivery date;
- optional external URL for the delivered artifact;
- explicit client visibility;
- audit timestamps and creator.

`approval_requests`

- project reference;
- typed target reference using `target_type` and `target_id`;
- title, instructions, status, submission timestamp;
- requester and audit timestamps.

`approval_decisions`

- approval request reference;
- decision, comment, actor, timestamp;
- append-only history.

`project_timeline_entries`

- project reference;
- entry type, title, body;
- optional structured metadata;
- automatic or manual origin;
- explicit client visibility;
- creator and timestamp.

Database constraints and RLS policies must enforce ownership boundaries. Application queries must still filter by client context as defense in depth.

## Internal Application

The existing project details experience gains focused tabs:

- tasks;
- deliverables;
- approvals;
- timeline.

Internal users can:

- mark tasks as visible or internal;
- create and update deliverables;
- submit a deliverable or future typed target for client approval;
- inspect approval status and decision history;
- add timeline updates and choose whether clients can see them.

The existing project, phase, and task CRUD remains in place and is extended instead of rebuilt.

## Client Portal

The placeholder portal projects route becomes a functional client view.

Clients can:

- list their projects;
- inspect progress and phases;
- view client-visible tasks;
- view client-visible deliverables;
- inspect pending and historical approval requests;
- approve, request adjustments, or reject with a required comment for non-approval decisions;
- view client-visible timeline entries.

The portal never exposes internal task details, internal timeline updates, or projects belonging to another client.

## Data Flow

1. An internal user creates or updates a project task or deliverable.
2. Client visibility determines whether it appears in the portal.
3. An internal user submits a target for approval.
4. The system creates an approval request and an automatic timeline event.
5. The client submits a decision.
6. The system appends a decision record, updates the request's current status, and records a client-visible timeline event.
7. Internal and portal screens refresh from Supabase using their permitted filters.

## Error Handling

- Reject approval submissions for missing or inaccessible targets.
- Reject client decisions for approval requests outside the active client context.
- Require a comment for `CHANGES_REQUESTED` and `REJECTED`.
- Show actionable UI errors without discarding entered form data.
- Keep database policies authoritative even if a frontend filter is omitted.

## Testing

Focused verification covers:

- approval decision validation and status transitions;
- task and timeline visibility mapping;
- service queries and mutations;
- type checking and production build;
- Supabase migration execution and advisor checks;
- RLS probes for internal access, own-client access, and cross-client denial;
- browser smoke tests for internal project details and the client portal flow.

## Implementation Order

1. Add the migration and RLS rules.
2. Add frontend types, mapping, and service methods.
3. Extend the internal project details UI.
4. Replace the portal projects placeholder.
5. Verify database boundaries and the end-to-end browser flow.

