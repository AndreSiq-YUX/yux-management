# YUX OS Commercial Proposals and Conversion Design

## Objective

Complete the commercial cycle after CRM by delivering structured diagnostics,
AI-assisted proposal drafts, immutable proposal versions, prospect and client
approval surfaces, and automatic conversion into operational records.

This slice must connect the CRM, packages, contracts, projects, and blueprint
foundations without coupling the frontend to AI providers, email providers, or
WhatsApp providers.

## Scope

This slice includes:

- commercial diagnostics linked to leads;
- reusable proposal templates;
- price rules with minimum, recommended, and maximum values;
- AI-assisted proposal draft generation with template fallback;
- editable draft scope, items, messages, package, modules, and price;
- immutable proposal versions after each send;
- public secure approval links for prospects;
- authenticated portal approval for existing clients;
- approve, reject, or request-adjustments decisions with comments;
- automatic and idempotent conversion into client, contract, and project;
- initial project setup from a sector blueprint when available;
- package project presets as the fallback when no blueprint applies;
- traceable AI generation and conversion failures.

This slice does not include:

- signed final PDF output;
- electronic signatures;
- payment processing;
- visual document editors;
- autonomous commercial agents;
- direct WhatsApp or email delivery.

## Architecture

The proposal module is a vertical commercial slice shared by CRM, contracts,
projects, and the client portal.

### Database Records

Add:

- `commercial_diagnostics`: structured qualification and commercial context for
  a lead.
- `proposal_templates`: reusable scope and message templates associated with a
  package and optionally a blueprint.
- `proposal_price_rules`: allowed minimum, recommended, and maximum values for a
  package or additional item.
- `proposals`: mutable negotiation record linked to a lead and optionally an
  existing client.
- `proposal_items`: editable items for the proposal draft currently under
  preparation.
- `proposal_versions`: immutable snapshot of scope, items, messages, selected
  package, modules, blueprint, recurrence, and final price each time a proposal
  is sent.
- `proposal_decisions`: approve, reject, or request-adjustments decisions linked
  to the exact proposal version reviewed by the recipient.
- `proposal_access_tokens`: revocable and expiring public prospect access tokens
  stored only as hashes.
- `ai_generation_runs`: traceable AI draft generation attempts, sanitized input
  summary, provider-neutral result metadata, fallback status, and error text.
- `proposal_conversion_runs`: traceable conversion attempts, outcome, created
  record IDs, and error text.
- `package_project_presets`: fallback project phase and task presets by package.
- `blueprint_project_presets`: sector-specific project phase and task presets by
  blueprint.

Existing tables remain the source of truth for:

- leads and CRM interactions;
- clients;
- packages and package modules;
- blueprints and blueprint modules;
- contracts and contract modules;
- projects, project phases, and project tasks.

### Backend Boundaries

Add a protected Supabase Edge Function for AI-assisted draft generation. It
accepts a proposal draft ID, loads the authorized lead diagnostic, package,
blueprint, and price rules, and returns validated editable content.

Provider credentials remain in Edge Function secrets. When no AI provider is
configured or generation fails, the Edge Function creates a usable template-
based draft and records a fallback result in `ai_generation_runs`.

Add a transactional database function for proposal conversion. A valid approval
invokes the conversion through a protected backend boundary. Successful
transactions are idempotent and store their result in `proposal_conversion_runs`.
When the transaction fails, the backend boundary records a failed conversion run
after rollback so the error remains traceable without preserving partial
operational records.

The AI boundary can draft content only. It cannot create contracts, clients, or
projects.

## Operational Workflow

### Internal YUX Experience

Replace the `/proposals` placeholder with an operational queue filtered by
status, responsible user, lead, package, and date.

A proposal can start from the CRM lead workspace or from the proposal queue.

The internal flow is:

1. Create or review the lead commercial diagnostic.
2. Select a package, optional additional items, and an optional sector
   blueprint.
3. Request an AI-assisted draft.
4. Review and edit scope, items, WhatsApp text, follow-up email text, modules,
   recurrence, and suggested price.
5. Save the mutable draft.
6. Send the proposal. Sending freezes an immutable version and creates a secure
   access link.
7. Review recipient decisions and version history.
8. When adjustments are requested, continue editing the negotiation draft and
   send a new immutable version.
9. When approved, show the automatically created client, contract, and project
   references.

### CRM Lead Experience

Add a commercial surface to lead details with:

- latest diagnostic summary;
- linked proposals and statuses;
- current sent version;
- latest recipient decision;
- conversion outcome;
- command to start a proposal from the lead.

### Public Prospect Experience

Expose a public route backed by a secure hashed access token. The recipient sees
only the sent immutable version and can:

- approve;
- reject with an optional comment;
- request adjustments with a required comment.

The public token does not create an authenticated application session and does
not expose internal navigation or data from any other proposal.

### Authenticated Portal Experience

Add a contracted client proposal route that lists proposals associated with the
current client. Existing clients can review the same immutable version and
submit the same three decisions through portal authorization.

## Price Rules

AI-generated pricing must remain within registered price rules:

- `minimum_value`;
- `recommended_value`;
- `maximum_value`.

The AI suggestion is editable. A manually entered value outside the configured
range requires an explicit internal override reason stored with the draft and
snapshot in the sent version.

Additional items can have their own ranges. The proposal total is validated
before sending.

## Versioning

Draft content remains mutable until sending.

Each send operation creates an immutable `proposal_versions` snapshot. Recipient
decisions always reference a specific immutable version.

Only the currently sent pending version can receive a new decision. Previously
sent versions remain readable in internal history but cannot be approved,
rejected, or changed.

A request for adjustments changes the proposal negotiation status and allows a
new draft revision. Sending the revision creates the next immutable version.

## Automatic Conversion

A valid approval invokes automatic conversion immediately.

The conversion transaction:

1. Reuses the linked client when the proposal belongs to an existing client.
2. For a prospect, creates a client from the lead and writes
   `leads.converted_to_client_id`.
3. Creates a contract with the approved package, value, recurrence, selected
   modules, and proposal provenance.
4. Creates a project in `planning`.
5. Applies blueprint phases and tasks when a blueprint is associated with the
   approved version and has project presets.
6. Applies package phase and task presets when no applicable blueprint preset
   exists.
7. Stores the generated client, contract, and project IDs in the proposal and
   conversion run.
8. Adds CRM history describing the successful conversion.

If any step fails, the transaction rolls back. The protected backend boundary
then records a failed conversion run outside the reverted transaction. The
proposal remains approved and internal users can retry conversion. Repeated
conversion calls return the already-created records and never create duplicates.

## Authorization and RLS

Internal YUX users with proposal permissions can manage diagnostics, templates,
price rules, proposal drafts, versions, tokens, generation runs, and conversion
runs.

Client portal members can read proposals and versions linked to their own client
only when the proposals module is enabled in their active contract. They can
create decisions only for a currently sent pending version linked to their
client.

Public decisions use a protected Edge Function or database RPC that validates:

- token hash;
- token expiration;
- revocation status;
- proposal version status;
- decision eligibility.

Public access never relies on a raw token stored in the database.

## Failure Handling

AI generation failures:

- create `ai_generation_runs` failure metadata;
- use a proposal template fallback;
- return a usable editable draft;
- show the fallback state to internal users.

Conversion failures:

- rollback all generated operational records;
- create or update a failed `proposal_conversion_runs` record after rollback;
- display the failure internally;
- provide an idempotent retry command.

Recipient decision failures:

- reject expired, revoked, stale, or already-decided versions;
- keep the public response generic;
- keep detailed error information in protected logs.

## Testing and Verification

Add pure-rule tests for:

- price range validation and override requirements;
- immutable sent version behavior;
- current-version decision eligibility;
- package versus blueprint project preset selection;
- idempotent conversion outcomes.

Add SQL probes for:

- internal proposal management;
- cross-client RLS rejection;
- contracted portal proposal visibility;
- disabled-module portal rejection;
- hashed token decision eligibility;
- transaction rollback on conversion failure;
- idempotent successful conversion.

Add browser smoke tests for:

- internal proposal creation and AI fallback editing;
- send and version history;
- public prospect decision;
- authenticated client portal decision;
- approved prospect conversion references.

Preserve:

- `npm test`;
- `npm run type-check`;
- `npm run build`;
- focused lint for touched files;
- Supabase security and performance advisor review.
