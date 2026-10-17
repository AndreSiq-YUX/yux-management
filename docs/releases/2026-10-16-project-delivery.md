# Project delivery and client tracking — 2026-10-16

This release completes internal delivery editing and the client portal flow for tracking phases, tasks, artifact links, deadlines, approvals and dated updates. The portal uses organization-scoped endpoints rather than internal workspace routes. Approval creation and client decisions run in transactions, retain the actor and history, and protect artifacts against edits while a decision is pending.

The release was prepared from `42e9fd6` and rebased onto `e6466ac` from `main`, preserving the concurrent Radar rollout. Uncommitted WhatsApp work and the older source branch's unrelated commits are excluded. No new database migrations are introduced.

## Verification

- Backend: 214 test files, 1,082 passed tests, 13 existing skipped tests; type checking and production build passed.
- Frontend: 164 test files and 719 passed tests; lint baseline and production build/bundle budget passed.
- PostgreSQL 17 integration: a real isolated test database exercised create/edit, calendar dates, hidden artifacts, organization isolation, approval/comment validation, concurrent requests, adjustments, resubmission, final approval and immutable prior decisions. API requests used the `yux_api` service role and real cookie authentication.
- Desktop/mobile fixture-based browser checks from the implementation passed without runtime errors or horizontal overflow.
- The existing migration/image release manifest verifier passed. Its SHA-256 is `51503b4f10f80a727db833d7c4d503a234d52fb3786f718034fb160001db5bb3`.
- Production dependency audit has no high or critical findings. Three existing moderate backend findings and two existing moderate frontend findings remain; npm proposes breaking version changes for them. No forced downgrade or major frontend upgrade was applied.

Compatible backend dependency updates resolve the high-severity transitive finding and available Fastify/URI-parser fixes. Two existing Radar files receive only unused-import cleanup and polling through the already-existing latest-callback reference, so the inherited lint gate passes. The Radar component regression suite passed all 61 tests.

## Rollback

Redeploy the preceding compatible `main` revision (`e6466ac`) through Dokploy if post-deploy health checks fail. No database rollback is required for this release. Keep existing secrets, volumes, worker configuration and service identities intact.
