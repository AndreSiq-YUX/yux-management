# YUX Marketing Studio Phase 2: Organic Content And Calendar

Goal: turn the Marketing Studio foundation into an operational organic content and editorial calendar workspace, using the existing `content_items`, `content_versions`, `content_reviews`, and `editorial_calendar_items` tables.

Scope:

- organic content list with filters, editor state and status controls;
- content versions and version comparison metadata;
- review queue with approve, request changes and reject decisions;
- editorial calendar list/month-friendly data model;
- portal-safe approval surface for clients;
- typed service mappers and mutations for versions, reviews and calendar items;
- pure rules for editorial transitions, approval decisions, calendar readiness and portal sanitization;
- focused tests for rules, service and internal/portal workspaces.

Out of scope:

- LangGraph worker and YUX Agent Harness;
- RAG, embeddings and knowledge base indexing;
- Radar/Jina source ingestion;
- real AI writing/review generation;
- WordPress or social publishing execution;
- campaign creative generation.

Implementation order:

1. Extend domain types and pure rules for versions, reviews and calendar.
2. Extend `marketingStudioService` with mappers, reads and mutations.
3. Upgrade internal workspace with content, calendar and approval operations.
4. Upgrade portal workspace with client approval/comment surface.
5. Validate with focused tests, type-check and build.
