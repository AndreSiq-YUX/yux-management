# Project saving fixes — 2026-10-23

Task assignees were entered as free text although the database requires a user UUID. Task and phase writes also passed empty optional fields through to typed database columns, while phase updates omitted the budget. The task form now offers registered users, and validated API payloads distinguish omitted fields from explicit clears. Invalid references and date ranges return a validation response instead of a database error.

The review also fixes lost alert preferences, zero values, date display in Brazil, the empty-project progress spinner, duplicate task submissions, and tab resets after saving. Archive/unarchive flags stay consistent, and copies start active with cleared actual costs and completion counters. Forms retain drafts after failed writes and fit mobile screens.

## Verification

- Backend suite: 1,509 passed, 126 existing skipped tests; production compilation passed.
- Frontend suite: 1,204 passed, plus four new regression tests covering failed drafts, duplicate submissions, phase budget/date edits, alert persistence and empty-project progress. Production compilation and bundle budget passed.
- Lint baseline passed (544 errors / 25 warnings within the existing baseline). One redundant semicolon in an existing Radar test was removed to clear a pre-existing per-rule lint violation; its test suite passed.
- PostgreSQL 17 integration: six passing tests exercise project create/edit, tasks, phases, date clearing, zero budgets/hours, reference validation, visibility and account isolation, status/progress/notes/alert reloads, archive/unarchive/copy/delete, deliverable edits, manual timeline updates and client approval decisions.
- Real browser-to-API-to-database checks passed in Chrome at 1440×1000 and 390×844. The browser exercised task create/edit/complete, phase create/edit, delivery creation and approval requests, timeline updates, progress application, alert persistence after reload and recovery from a simulated failed save. No uncaught browser errors occurred. Browser plugin unavailable; local Playwright used installed Chrome.
- All test records were confined to an isolated local database. No external paid providers were called.

## Database and rollback

Migration `0239_project_notification_rules.sql` adds one JSONB column to projects for the existing in-app alert switches. These switches control alerts shown in the project interface; they do not activate outbound email or messaging.

Redeploy the preceding compatible application revision if necessary. Keep the additive column and its saved preferences during rollback; no existing project data needs to be deleted.
