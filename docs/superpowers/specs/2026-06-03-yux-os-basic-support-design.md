# YUX OS Basic Support Design

## Objective

Deliver the first usable support module for YUX OS with shared ticket data,
an internal YUX operations view, and a filtered client portal view.

## Approved Scope

The initial support module is contract-based ticketing:

- clients open tickets from `/portal/support`;
- clients add follow-up messages and read YUX replies for their active contract;
- internal YUX users manage tickets from `/support`;
- internal YUX users update ticket status, priority, assignee notes, and replies;
- every ticket belongs to a client and contract, with optional project linkage;
- RLS limits portal users to active contracts where the `support` module is enabled.

## Ticket Model

`support_tickets` stores the operational record:

- `organization_id`;
- `client_id`;
- `contract_id`;
- optional `project_id`;
- `subject`;
- `category`;
- `priority`;
- `status`;
- `sla_due_at`;
- `last_message_at`;
- `resolved_at`;
- `closed_at`;
- `internal_notes`;
- timestamps.

`support_messages` stores the conversation:

- `ticket_id`;
- `author_type`;
- `body`;
- `is_internal`;
- timestamps.

## Statuses

- `open`;
- `in_progress`;
- `waiting_client`;
- `resolved`;
- `closed`.

Resolved and closed tickets remain visible in both views.

## Portal Boundary

Portal users can create tickets and non-internal messages for their active
contract. They can read ticket metadata and public messages, but they must not
see `internal_notes` or internal-only messages.

## Internal Boundary

Internal users can read and manage all support tickets and messages. This slice
does not implement advanced assignment workflows, but it keeps fields ready for
future operational ownership.

## Out of Scope

- WhatsApp or omnichannel conversion into tickets;
- attachments;
- knowledge base or FAQ;
- advanced business-hour SLA calendars;
- email notifications;
- customer satisfaction surveys.

## Verification

Implementation must include:

- pure support rules tests for summary, SLA state, and portal sanitization;
- service tests for Supabase row mapping and mutation payloads;
- component tests for internal and portal workflows;
- Supabase migration and probe script for tables, policies, grants, helpers,
  module metadata, and client role permission;
- full frontend tests, type-check, build, and shared Supabase function tests.
