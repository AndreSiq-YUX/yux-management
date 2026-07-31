# YUX OS Platform Design

## Goal

Build YUX OS as a single modular platform used internally by YUX and exposed to clients through a filtered portal. The platform must support CRM, projects, delivery workflows, proposals, reporting, support, finance, automations, contracted modules, and sector blueprints without requiring separate products for each niche.

## Strategic Direction

YUX OS is not a generic SaaS marketplace and not a set of disconnected tools. It is a central operational system for the agency, with modular client-facing capabilities. Services start as modules, repeated delivery patterns become blueprints, and only validated blueprints may later become independent products.

Independent products such as YUXQuant, SensaMap, or future vertical SaaS products are explicitly out of scope for this implementation cycle.

## Product Layers

### Layer 1: Base Platform

The base platform is mandatory for every client and every internal user. It includes:

- authentication;
- organizations and client accounts;
- users;
- roles and permissions;
- internal workspace;
- client portal;
- clients;
- contracts and packages;
- module activation;
- projects;
- tasks;
- deliveries;
- approvals;
- files and documents;
- basic finance;
- support;
- notifications;
- reports.

### Layer 2: Activatable Modules

Modules are capabilities that can be enabled per package, contract, organization, or client. Initial modules:

- CRM;
- Leads;
- Projects and delivery;
- Proposals;
- WhatsApp IA;
- Campaigns and Ads;
- BI and ROI;
- Automations;
- Agenda;
- Support;
- Documents;
- Finance;
- Intelligent reports.

The first implementation does not need every module to be feature-complete, but the database, navigation, permission model, and service boundaries must be ready for modules from the start.

### Layer 3: Sector Blueprints

Blueprints are reusable configurations for niches such as clinics, real estate, car dealerships, schools, e-commerce, agencies, consultancies, tourism, and B2B industry.

A blueprint can define:

- active modules;
- pipeline stages;
- custom fields;
- prompts;
- automation templates;
- message templates;
- dashboards;
- reports;
- onboarding checklists;
- default tasks;
- proposal templates.

Blueprints should initially be implemented as configuration and database records, not as separate apps.

### Layer 4: Independent Products

Independent products are not part of this implementation. They may be extracted later only after a blueprint proves repeated commercial demand.

## Core User Experiences

### Internal YUX OS

The internal YUX view is the operational command center. It must support:

- lead capture and qualification;
- commercial pipeline;
- diagnostics;
- proposals;
- follow-up;
- client management;
- project management;
- task management;
- delivery tracking;
- approvals;
- campaigns and ROI;
- automations;
- finance;
- support;
- reports;
- account history.

### Portal YUX

The client portal is not a separate product. It is a restricted view of the same platform. Clients see only what their contract, modules, role, and permissions allow.

The portal must support:

- project status;
- pending tasks;
- approvals;
- files;
- documents;
- contracts;
- invoices;
- reports;
- support;
- delivery history;
- contracted modules.

The same client portal can be simple for small packages and broad for larger contracts.

## Architecture Principles

### Single Platform, Modular Capability

All functionality should be modeled as part of one platform. Modules are activated, not forked. This avoids rebuilding authentication, permissions, navigation, and client identity for each service line.

### Configuration Before Duplication

Sector-specific behavior should first be represented as configuration. A clinic and a real estate agency may have different stages, fields, templates, and dashboards, but they should share the same platform primitives.

### Frontend Does Not Own Business Logic

The React frontend is the interface. It should not own integration logic, automation orchestration, AI processing, long-running jobs, or direct webhook workflows.

### Supabase as Operational Data Core

Supabase remains the operational database, auth provider, and RLS layer for the current platform. The frontend consumes Supabase through typed services, not scattered direct queries.

### Backend and Workers for Heavy Logic

n8n, WhatsApp IA, Ads sync, AI agents, report generation, and long-running workflows must eventually run behind a backend or worker layer. n8n is an invisible orchestration engine, not the client-facing product.

Recommended long-term flow:

`Vercel frontend -> Supabase Auth/DB/RLS -> Backend/Workers -> n8n/integrations/AI providers`

## Implementation Order

The system should be planned as a complete platform but implemented by dependency order:

1. Data foundation for organizations, accounts, users, roles, permissions, contracts, packages, modules, and blueprints.
2. Navigation and access control that can switch between internal YUX OS and client portal views.
3. Core operational modules: clients, leads, CRM, projects, tasks, deliveries, approvals, and support.
4. Commercial modules: diagnostics, proposals, follow-up, package recommendations, and ROI calculator.
5. Client portal surfaces for projects, approvals, files, reports, contracts, invoices, and support.
6. Basic finance and reporting.
7. Blueprint configuration and application flow.
8. Integration readiness for n8n, WhatsApp IA, Ads sync, BI, and AI reports.

This order avoids rebuilding permissions, navigation, contracts, and module activation later.

## Data Model Direction

The next schema should introduce or formalize these concepts:

- `organizations`: internal YUX organization and future client organizations.
- `profiles` or `users`: application profile linked to Supabase Auth.
- `roles`: named roles such as owner, admin, manager, operator, client_admin, client_user.
- `permissions`: granular actions used by navigation and RLS.
- `memberships`: user membership in an organization with role.
- `clients`: commercial client records managed by YUX.
- `contracts`: active relationship between YUX and a client.
- `packages`: commercial package definitions.
- `modules`: available platform capabilities.
- `contract_modules`: modules enabled for a contract.
- `blueprints`: sector templates.
- `blueprint_modules`: modules enabled by a blueprint.
- `custom_fields`: configurable fields by blueprint/module/entity.
- `pipelines` and `pipeline_stages`: CRM and delivery flow configuration.
- `leads`: commercial opportunities.
- `projects`: delivery projects.
- `tasks`: internal or client-visible tasks.
- `deliverables`: delivery items that can require approval.
- `approvals`: approval workflow records.
- `documents` and `files`: metadata for uploaded assets.
- `support_tickets`: client support and service requests.
- `invoices` or `billing_items`: basic finance records.
- `reports`: generated or saved report snapshots.
- `automation_runs`: execution log for n8n/backend automations.
- `integration_connections`: external accounts and sync metadata.

Existing tables should be migrated toward this model rather than duplicated.

## Module Activation Rules

Every module must declare:

- module key;
- display name;
- internal route availability;
- portal route availability;
- required permissions;
- whether it is base, optional, or internal-only;
- whether it can be enabled by package, contract, or blueprint.

Menus and routes should be derived from module activation and permissions. Components should not hardcode package assumptions.

## Permissions Direction

Permissions should answer two questions:

1. Can this user access this area?
2. Can this user perform this action on this record?

Initial roles:

- `yux_owner`: full internal access.
- `yux_admin`: internal management access.
- `yux_operator`: operational access to assigned work.
- `client_admin`: client-side access to contract modules and team members.
- `client_user`: limited client portal access.

RLS can begin coarse during local development, but the model must be compatible with record-level restrictions.

## Module Scope

### CRM and Leads

The CRM module manages leads, pipeline stages, source, score, responsible user, follow-ups, notes, tasks, and conversion into clients or projects.

### Projects and Delivery

The delivery module manages projects, phases, tasks, deadlines, owners, deliverables, approvals, files, and timeline history.

### Proposals

The proposal module manages diagnostics, recommended package, scope, price, PDF output, WhatsApp message, and follow-up email.

### WhatsApp IA

The WhatsApp IA module manages conversations, qualification status, handoff, knowledge base references, scheduling metadata, summaries, and service metrics. Actual messaging and AI processing should be handled by backend/n8n workers.

### Campaigns and ROI

The campaigns module manages Google Ads and Meta Ads metrics, investment, leads, CPL, ROAS, recommendations, monthly reporting, and performance alerts. External sync should not run in the frontend.

### BI and Reports

The BI module manages dashboards, report snapshots, before/after indicators, estimated savings, ROI, recommendations, and recurring report generation.

### Automations

The automations module tracks workflows available to a contract, execution logs, statuses, errors, and ownership. n8n remains behind the scenes.

### Support

Support manages client requests, status, priority, assigned user, conversation history, attachments, and SLA-style tracking.

### Finance

Finance starts basic: contracts, recurring fees, invoices, payment status, project billing, and retainers. Advanced billing automation is later.

## UI Direction

The UI should distinguish internal and client modes clearly:

- internal sidebar for YUX operations;
- portal sidebar or simplified navigation for clients;
- shared components for cards, tables, filters, status badges, approvals, files, and timelines;
- module-aware menus;
- dashboard cards driven by available modules.

Operational screens should favor dense, scannable layouts over marketing-style pages.

## Error Handling and Observability

The platform should standardize:

- typed service responses;
- user-facing toast messages for recoverable errors;
- console logging only for development diagnostics;
- automation run logs for n8n/backend tasks;
- sync status fields for external integrations;
- audit-style history for sensitive workflow events.

## Testing and Verification Direction

Each implementation phase should preserve:

- `npm run type-check`;
- `npm run build`;
- focused unit tests for pure mapping/config logic when introduced;
- browser verification for major UI/navigation changes;
- migration review before applying remote database changes.

## Out of Scope for the First Integrated Implementation

- Separate SaaS products.
- Full production deployment.
- Payment gateway automation.
- Full security hardening.
- Complete AI agent runtime.
- Complete Ads OAuth flow.
- White-label productization.

These are future phases after the modular platform foundation exists.

## Success Criteria

The integrated foundation is successful when:

- YUX can manage clients, leads, projects, tasks, proposals, modules, packages, and blueprints from one internal system.
- A client can log in and see only the portal areas enabled by their contract.
- Menus and routes respond to module activation.
- Blueprints can preconfigure modules and workflows without creating a new app.
- Future n8n, WhatsApp IA, Ads, BI, and AI features have clear integration points.
- The project continues to pass local type-check and build verification.
