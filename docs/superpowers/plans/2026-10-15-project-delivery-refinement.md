# Project delivery refinement implementation plan

> **For agentic workers:** Execute the tasks natively in this session; preserve unrelated working-tree changes.

**Goal:** Make internal delivery management and client project tracking usable against the current Fastify/Postgres backend.

**Architecture:** Keep internal workspace routes restricted. Add a dedicated membership-scoped portal snapshot and decision endpoint, reuse record mappers, and perform approval transitions in transactions. Extend existing React surfaces with editing, deadlines, clear states and safe asynchronous loading.

**Tech Stack:** Fastify, PostgreSQL, Zod, React 18, TypeScript, existing shadcn components, Vitest and Playwright.

**Spec:** Existing delivery requirements in `docs/superpowers/specs/2026-05-30-yux-os-project-delivery-approvals-design.md`; replace its obsolete Supabase transport with the current backend.

## Global constraints

- Preserve explicit client visibility and organization membership boundaries.
- Preserve approval history; require comments for adjustments and rejection.
- Preserve entered data after errors and unrelated existing changes.
- No production deployment or database migration is required for these route and UI changes.

## Review focus

- Partial updates retain omitted description, phase, date and URL.
- Other organizations cannot read project details or decide approvals.
- Hidden targets and internal updates never appear in portal snapshots.
- Concurrent submissions cannot create duplicate pending requests or decide a completed request.
- Switching projects or organization while loading cannot display stale details.

### Task 1: Correct delivery mutations and scoped portal access

**Files:** `backend/src/modules/project-delivery/{validation,routes}.ts`, `backend/src/modules/workspace/routes.ts`, `backend/src/server.ts`, `backend/tests/project-delivery-routes.test.ts`.

**Interfaces:** Portal list takes organizationId; details take organizationId and projectId; decisions take organizationId, projectId, approvalId, decision and comment. All return camelCase domain records using existing mappers.

- [x] Add regression tests for partial updates, scoped reads, hidden records, decision validation, transactions and duplicate requests.
- [x] Validate delivery input and preserve omitted patch fields.
- [x] Create approval requests atomically with visible target updates and actor identity.
- [x] Add portal snapshots filtered by client ownership and explicit visibility; append decisions and synchronize target status transactionally.
- [x] Run focused backend tests and type checking.

### Task 2: Complete internal delivery editing

**Files:** `frontend/src/components/projects/ProjectDeliveryManager.tsx`, `frontend/src/lib/projects/deliveryPresentation.ts`, `frontend/src/components/projects/ProjectDeliveryManager.test.tsx`.

**Interfaces:** Consume existing backendDataService CRUD; edit includes title, description, URL, phase, deadline, visibility and status.

- [x] Verify retained data and duplicate-submit protection with component tests.
- [x] Add create/edit form, phase and deadline controls, published/internal badges, approval counts and dated history.
- [x] Add recoverable loading/error/empty states and mutation locks.

### Task 3: Reliable client project tracking

**Files:** `frontend/src/services/projectDeliveryService.ts`, `frontend/src/pages/client-portal/PortalProjectsPage.tsx`, `frontend/src/pages/client-portal/PortalProjectsPage.test.tsx`.

**Interfaces:** Consume scoped portal routes; render only the latest project/organization snapshot.

- [x] Test request races, context switching, retry, comments and decision refresh.
- [x] Replace internal service calls, show translated statuses, deadlines, pending counts, artifact links and dated history.
- [x] Validate types, production build and focused tests.
- [x] Verify desktop/mobile rendering and create/edit/approve interactions with Playwright; record backend integration limitations accurately.

## Verification result

Completed with 29 backend and 24 frontend tests passing, backend type checking, frontend production build and bundle budget, and targeted frontend lint. Browser checks used Playwright with installed Chrome because the Browser plugin was not available. API responses were controlled fixtures; desktop 1440x1000 and mobile 390x844 passed without runtime errors or horizontal overflow. Live PostgreSQL integration remains unverified: local PostgreSQL/Redis integration services and Docker are unavailable. No deployment was performed.

Additional integration: scoped approval summaries now use one consolidated request without the previous 20-project cap; approval links open the corresponding project and tab. Automatic delivery creation, publication, and approval-request events are recorded transactionally, with a check to avoid duplicating legacy trigger events. Calendar dates retain their original day. Deliverables with pending approvals are protected against edits until the client decides.
