# YUX OS Project Delivery And Approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete projects workflow for internal users and clients with visible tasks, deliverables, reusable approvals, and a filtered timeline.

**Architecture:** Extend the existing Supabase project tables and reuse the current internal project details modal. Add focused domain types and service methods, then build one internal delivery panel and one client portal page against the same RLS-protected records.

**Tech Stack:** PostgreSQL and RLS on Supabase, React 18, TypeScript, Vite, Vitest, Tailwind CSS, shadcn/ui.

---

### Task 1: Database schema and authorization

**Files:**
- Create: `supabase/migrations/20260601070000_project_delivery_approvals.sql`

- [ ] **Step 1: Add schema changes**

Add `project_tasks.is_client_visible`, `project_deliverables`, `approval_requests`, `approval_decisions`, and `project_timeline_entries`. Use constrained status values, foreign keys, timestamps, explicit visibility flags, and indexes for project and approval lookups.

- [ ] **Step 2: Add timeline trigger functions**

Create security-definer functions with fixed `search_path` to append automatic events for deliverable creation, approval submission, and approval decision insertion. The decision trigger must update the current approval request status without deleting earlier decisions.

- [ ] **Step 3: Add RLS policies**

Reuse the existing internal user and client membership predicates. Internal users manage all new tables. Client users read only their own project's visible records and may insert decisions only for visible approval requests belonging to their client.

- [ ] **Step 4: Apply and probe migration**

Apply the migration through Supabase, run advisor checks, and execute SQL probes for internal visibility, own-client visibility, and cross-client denial.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260601070000_project_delivery_approvals.sql
git commit -m "feat: add project delivery approval schema"
```

### Task 2: Domain types, validation, and Supabase service

**Files:**
- Modify: `frontend/src/types/project.ts`
- Create: `frontend/src/lib/projects/approvalRules.ts`
- Create: `frontend/src/lib/projects/approvalRules.test.ts`
- Modify: `frontend/src/services/supabaseService.ts`

- [ ] **Step 1: Write failing approval rule tests**

Cover accepted approvals without comments, rejected or change-request decisions requiring comments, and trimming blank comments.

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
cd frontend
npm test -- src/lib/projects/approvalRules.test.ts
```

Expected: fail because the approval rule module does not exist.

- [ ] **Step 3: Add domain types and minimal rules**

Define deliverable, approval request, approval decision, and timeline entry types. Implement a pure validation function returning an actionable message for invalid decisions.

- [ ] **Step 4: Add service mapping and mutations**

Add methods to list and mutate deliverables, list and submit approvals, list timeline entries, add manual timeline entries, and update task visibility. Keep row-to-domain mapping centralized in `supabaseService.ts`.

- [ ] **Step 5: Run focused tests and type checking**

```bash
cd frontend
npm test -- src/lib/projects/approvalRules.test.ts
npm run type-check
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/project.ts frontend/src/lib/projects frontend/src/services/supabaseService.ts
git commit -m "feat: add project delivery domain services"
```

### Task 3: Internal delivery workspace

**Files:**
- Create: `frontend/src/components/projects/ProjectDeliveryManager.tsx`
- Modify: `frontend/src/components/projects/ProjectDetailsModal.tsx`
- Modify: `frontend/src/components/projects/ProjectTaskManager.tsx`

- [ ] **Step 1: Add task visibility control**

Expose an internal toggle that updates `is_client_visible` for each task without changing existing task CRUD behavior.

- [ ] **Step 2: Build the delivery manager**

Add compact tabs for deliverables, approvals, and timeline. Support creating deliverables, sending a deliverable for approval, inspecting decision history, and adding public or internal timeline updates.

- [ ] **Step 3: Integrate with project details**

Add the delivery workspace as a focused tab in the existing modal and refresh its data after mutations.

- [ ] **Step 4: Run type checking**

```bash
cd frontend
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/projects
git commit -m "feat: add internal project delivery workspace"
```

### Task 4: Functional client portal projects area

**Files:**
- Create: `frontend/src/pages/client-portal/PortalProjectsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Build the portal projects page**

List the client's projects and show a selected project's progress, phases, public tasks, visible deliverables, approval requests, decision history, and public timeline. Keep the layout dense and operational.

- [ ] **Step 2: Add approval action**

Allow clients to approve, request adjustments, or reject. Preserve entered text after service errors and use the shared rule function before submission.

- [ ] **Step 3: Replace the placeholder route**

Map `/portal/projects` to `PortalProjectsPage`.

- [ ] **Step 4: Run type checking and production build**

```bash
cd frontend
npm run type-check
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/client-portal/PortalProjectsPage.tsx frontend/src/App.tsx
git commit -m "feat: add client portal projects workflow"
```

### Task 5: End-to-end verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run focused automated checks**

```bash
cd frontend
npm test
npm run type-check
npm run build
```

- [ ] **Step 2: Verify internal browser flow**

Open the local app, authenticate as an internal user, inspect project details, create a deliverable, submit it for approval, and add timeline updates.

- [ ] **Step 3: Verify client browser flow**

Authenticate as the demo client, open `/portal/projects`, confirm internal tasks and updates remain hidden, submit a decision, and verify its timeline event.

- [ ] **Step 4: Verify Supabase authorization**

Run final SQL probes and Supabase advisor checks. Confirm cross-client reads and writes are denied by RLS.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add <changed-files>
git commit -m "fix: harden project delivery workflow"
```

