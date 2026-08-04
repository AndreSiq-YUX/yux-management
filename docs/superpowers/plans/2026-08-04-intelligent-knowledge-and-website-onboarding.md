# Intelligent Knowledge and Website Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform uploaded documents and company websites into precise, evidence-backed, semantically searchable organization knowledge, while letting the user review suggested profile, brand and product data before it changes live company context.

**Architecture:** Preserve every original file and raw extraction as the audit source. Build a staged worker pipeline that performs deterministic cleanup, LLM curation into evidence-backed atomic facts, Jina passage embeddings and explicit human publication. A separate same-origin website discovery run reads a bounded set of high-value pages through Jina Reader, produces provenance-bearing suggestions and applies only user-selected fields.

**Tech Stack:** Fastify/TypeScript, Postgres JSONB vectors, Redis/BullMQ, Python FastAPI Agent Harness, OpenRouter structured generation, Jina Reader and `jina-embeddings-v3`, React/Vite, Vitest and pytest.

## Global Constraints

- Never discard or overwrite the original file or raw extracted text; curated content is a derived layer with source evidence.
- Never publish LLM output automatically. External agents receive only explicitly published knowledge.
- Every curated fact and profile suggestion must identify an exact evidence excerpt and source locator.
- Reject an LLM fact when its normalized evidence excerpt cannot be found in the raw source.
- Keep all reads and writes scoped by `organization_id`; client and contract IDs are additional guards, not replacements.
- Website discovery is same-origin, respects a hard page limit, rejects private/local network targets and does not execute browser JavaScript.
- Use `jina-embeddings-v3` with `retrieval.passage` for stored chunks and `retrieval.query` for user/agent queries; allow an environment override without changing stored model metadata.
- Store embeddings in the existing `marketing_knowledge_chunks.embedding` JSONB field so production does not require pgvector.
- Retrieval must remain usable when Jina or OpenRouter is unavailable: keyword/FTS fallback stays active and the UI shows the degraded processing state.
- Existing raw knowledge, Radar, Marketing Studio, automations and WhatsApp callers continue to use one central `CustomerContextService`.

---

## File structure

### Database and backend

- Create `backend/src/db/migrations/0126_intelligent_knowledge_pipeline.sql`: processing state, curated chunk metadata, website discovery runs and field suggestions.
- Create `backend/src/modules/company-intelligence/knowledge-cleanup.ts`: deterministic boilerplate removal, duplicate paragraph detection and stable source locators.
- Create `backend/src/modules/company-intelligence/jina-embeddings.ts`: typed Jina passage/query embedding client with batching and retries.
- Create `backend/src/modules/company-intelligence/runtime-curation.ts`: typed client for the Agent Runtime curation/extraction endpoints.
- Create `backend/src/modules/company-intelligence/website-discovery.ts`: safe URL normalization, same-origin link prioritization and bounded crawl orchestration.
- Modify `backend/src/modules/company-intelligence/text-extraction.ts`: return located raw sections instead of anonymous strings only.
- Modify `backend/src/modules/company-intelligence/repository.ts`: persist raw, curated, embedded and website suggestion states transactionally.
- Modify `backend/src/modules/company-intelligence/routes.ts`: curation review, website discovery, polling and selected suggestion application endpoints.
- Modify `backend/src/jobs/handlers/company-intelligence.ts`: staged extraction, cleanup, curation and embedding pipeline.
- Modify `backend/src/jobs/queue.ts` and `backend/src/worker.ts`: website discovery job registration.
- Modify `backend/src/config/env.ts`, `backend/.env.example` and `docker-compose.dokploy.yml`: Jina/curation settings.

### Agent runtime

- Create `workers/marketing-studio-agent-runtime/yux_agent_runtime/knowledge_intelligence.py`: structured LLM curation and company field extraction.
- Create `workers/marketing-studio-agent-runtime/yux_agent_runtime/embedding.py`: query embedding adapter used by centralized retrieval.
- Modify `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`: authenticated internal curation and website extraction endpoints.
- Modify `workers/marketing-studio-agent-runtime/yux_agent_runtime/customer_context.py`: hybrid semantic/keyword retrieval over published curated chunks.
- Modify `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_factory.py`: inject Jina embedding and knowledge intelligence services.

### Frontend

- Create `frontend/src/components/company-intelligence/KnowledgeProcessingDetails.tsx`: stage, quality, discarded content and embedding diagnostics.
- Create `frontend/src/components/company-intelligence/WebsiteOnboardingDialog.tsx`: URL entry, crawl progress, suggestions/diff and selective apply.
- Modify `frontend/src/components/company-intelligence/KnowledgeLibrary.tsx`: raw-versus-curated preview and fact approval controls.
- Modify `frontend/src/components/company-intelligence/CompanyProfileForm.tsx`: “Preencher pelo site” entry point.
- Modify `frontend/src/pages/client-portal/company/PortalCompanyProfilePage.tsx`: website run polling and profile refresh.
- Modify `frontend/src/services/companyIntelligenceService.ts` and `frontend/src/types/companyIntelligence.ts`: new contracts.

---

### Task 1: Add durable processing and provenance schema

**Files:**
- Create: `backend/src/db/migrations/0126_intelligent_knowledge_pipeline.sql`
- Create: `backend/tests/intelligent-knowledge-schema.test.ts`

**Interfaces:**
- Produces `knowledge_intelligence_runs`, `company_intelligence_suggestions` and curated metadata on `marketing_knowledge_chunks`.
- Existing `knowledge_entries.body` remains the raw full-text audit copy.

- [ ] **Step 1: Write the failing schema test**

```ts
expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.knowledge_intelligence_runs')
expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.company_intelligence_suggestions')
expect(sql).toContain('ADD COLUMN IF NOT EXISTS chunk_kind')
expect(sql).toContain('ADD COLUMN IF NOT EXISTS evidence_excerpt')
expect(sql).toContain('ADD COLUMN IF NOT EXISTS embedding_model')
```

- [ ] **Step 2: Run the test and verify failure**

Run from `backend`: `npm test -- tests/intelligent-knowledge-schema.test.ts`

Expected: failure because migration `0126_intelligent_knowledge_pipeline.sql` does not exist.

- [ ] **Step 3: Create the migration**

Add to `marketing_knowledge_chunks`:

```sql
ALTER TABLE public.marketing_knowledge_chunks
  ADD COLUMN IF NOT EXISTS chunk_kind TEXT NOT NULL DEFAULT 'raw'
    CHECK (chunk_kind IN ('raw','curated_fact','curated_summary')),
  ADD COLUMN IF NOT EXISTS source_locator TEXT,
  ADD COLUMN IF NOT EXISTS evidence_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS curation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (curation_status IN ('pending','approved','rejected','not_required')),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER,
  ADD COLUMN IF NOT EXISTS content_hash TEXT;
```

Create `knowledge_intelligence_runs` with organization/client/contract/source/document IDs, `run_kind`, `status`, `stage`, `progress`, provider/model, input/output hashes, metrics JSONB, error and timestamps. Create `company_intelligence_suggestions` with run ID, field path, current/suggested JSONB values, evidence excerpt, source URL, confidence, selected state and application audit columns. Add tenant/status indexes and updated-at triggers.

- [ ] **Step 4: Run schema and migration-order tests**

Run: `npm test -- tests/intelligent-knowledge-schema.test.ts tests/migrations.test.ts`

Expected: all pass and `0126` sorts after `0125`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/0126_intelligent_knowledge_pipeline.sql backend/tests/intelligent-knowledge-schema.test.ts
git commit -m "feat: add intelligent knowledge processing schema"
```

---

### Task 2: Preserve located raw text and remove deterministic noise

**Files:**
- Create: `backend/src/modules/company-intelligence/knowledge-cleanup.ts`
- Modify: `backend/src/modules/company-intelligence/text-extraction.ts`
- Create: `backend/tests/knowledge-cleanup.test.ts`
- Modify: `backend/tests/company-intelligence-file-storage.test.ts`

**Interfaces:**
- Produces `LocatedSection { locator: string; heading?: string; body: string }`.
- Produces `CleanKnowledgeResult { rawBody: string; cleanSections: LocatedSection[]; removed: RemovedBlock[]; metrics: CleanupMetrics }`.

- [ ] **Step 1: Write cleanup tests**

Test repeated headers/footers, duplicate navigation, cookie banners, empty sections, phone/e-mail preservation, and deterministic locator stability. Assert that legal/compliance text is tagged low-priority rather than silently removed.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/knowledge-cleanup.test.ts tests/company-intelligence-file-storage.test.ts`

Expected: missing `cleanKnowledgeSections` and located extraction types.

- [ ] **Step 3: Extend extraction without losing the original**

```ts
export type LocatedSection = {
  locator: string
  heading?: string
  body: string
}

export type ExtractedKnowledge = {
  title: string
  body: string
  sections: LocatedSection[]
  chunks: Array<{ title?: string; body: string; tokenCount: number; sourceLocator: string }>
}
```

For TXT/Markdown/DOCX use stable paragraph ranges such as `paragraphs:12-18`. For PDF use page locators when the parser exposes page boundaries; otherwise use paragraph ranges and record `locatorPrecision: 'paragraph'` in metrics.

- [ ] **Step 4: Implement conservative cleanup**

Normalize Unicode/whitespace, hash normalized paragraphs, remove exact duplicates after the first occurrence, classify navigation/cookie boilerplate by deterministic patterns, and retain a removal ledger with hashes and reasons. Never classify product, pricing, warranty, legal, safety, contact or FAQ blocks as removable solely because they are short.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/knowledge-cleanup.test.ts tests/company-intelligence-file-storage.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/company-intelligence/text-extraction.ts backend/src/modules/company-intelligence/knowledge-cleanup.ts backend/tests
git commit -m "feat: preserve provenance during knowledge cleanup"
```

---

### Task 3: Curate long documents with evidence-backed LLM facts

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/knowledge_intelligence.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_knowledge_intelligence.py`
- Create: `backend/src/modules/company-intelligence/runtime-curation.ts`
- Create: `backend/tests/knowledge-curation-client.test.ts`

**Interfaces:**
- Produces runtime `POST /knowledge/curate`.
- Consumes batches of located sections and returns `summary`, `facts`, `discarded` and `warnings`.

- [ ] **Step 1: Write runtime contract tests**

```python
self.assertEqual(result["facts"][0]["statement"], "A empresa atende em todo o Brasil.")
self.assertEqual(result["facts"][0]["source_locator"], "page:3")
self.assertIn(result["facts"][0]["evidence_excerpt"], raw_text)
```

Cover hallucinated evidence rejection, duplicate fact collapse, conflicting claims retained with warnings, maximum fact length, forbidden instructions inside source text and empty/noisy batches.

- [ ] **Step 2: Run pytest and verify failure**

Run: `python -m pytest tests/test_knowledge_intelligence.py -q`

Expected: missing knowledge intelligence service.

- [ ] **Step 3: Implement structured curation**

Define:

```python
class CuratedFact(BaseModel):
    statement: str
    category: Literal["company", "brand", "product", "service", "audience", "process", "faq", "proof", "policy", "compliance", "contact", "other"]
    evidence_excerpt: str
    source_locator: str
    confidence: float = Field(ge=0, le=1)
    usefulness: float = Field(ge=0, le=1)
    agent_profiles: list[str] = []
    sensitivity: Literal["public", "internal", "restricted"] = "public"
```

Use `OpenRouterClient` with temperature `0`, JSON-only output and an instruction that source text is untrusted data. Batch at no more than 12,000 input characters. Validate every evidence excerpt against the source after Unicode/whitespace normalization. Reject invalid facts instead of repairing their evidence.

- [ ] **Step 4: Expose the authenticated runtime endpoint**

`POST /knowledge/curate` must require the runtime token, validate organization/client/contract scope, cap sections and total characters, estimate credits server-side and return sanitized structured output.

- [ ] **Step 5: Implement the backend client**

Use the existing `invokeAgentRuntime` transport. Validate the response with Zod and return a typed domain error when runtime curation is unavailable. Do not silently label mechanical chunks as LLM-curated.

- [ ] **Step 6: Run runtime and backend tests**

Run:

```bash
python -m pytest tests/test_knowledge_intelligence.py tests/test_api_credits.py -q
npm test -- tests/knowledge-curation-client.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add workers/marketing-studio-agent-runtime backend/src/modules/company-intelligence/runtime-curation.ts backend/tests/knowledge-curation-client.test.ts
git commit -m "feat: curate knowledge into grounded facts"
```

---

### Task 4: Generate Jina passage embeddings and activate hybrid retrieval

**Files:**
- Create: `backend/src/modules/company-intelligence/jina-embeddings.ts`
- Create: `backend/tests/jina-embeddings.test.ts`
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/embedding.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/customer_context.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_factory.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_store.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_customer_context.py`

**Interfaces:**
- Backend: `embedPassages(texts: string[]): Promise<JinaEmbeddingBatch>`.
- Runtime: `embed_query(query: str) -> list[float] | None`.
- Retrieval: hybrid score over approved, published, tenant-safe chunks.

- [ ] **Step 1: Write provider and retrieval tests**

Mock `POST https://api.jina.ai/v1/embeddings`. Assert passage requests use `task: 'retrieval.passage'`, query requests use `task: 'retrieval.query'`, `normalized: true`, configured dimensions, retryable 429 handling and no API key leakage in errors. Assert semantic matches outrank keyword-only matches but blocked/internal sources remain excluded.

- [ ] **Step 2: Run tests and verify failure**

Run backend Jina tests and `python -m pytest tests/test_customer_context.py -q`.

Expected: missing embedding clients and unchanged keyword-only ranking.

- [ ] **Step 3: Implement the backend Jina client**

Send batches to `/v1/embeddings` using model `JINA_EMBEDDING_MODEL` defaulting to `jina-embeddings-v3`, `embedding_type: 'float'`, `normalized: true`, `task: 'retrieval.passage'`. Cap batch tokens/entries, retry 429/5xx with bounded exponential backoff, and validate that every returned vector has the expected dimension.

- [ ] **Step 4: Implement runtime query embeddings**

Use the same model and dimensions with `retrieval.query`. Cache query embeddings in memory for five minutes keyed by model plus normalized query hash. Return `None` on provider unavailability so keyword retrieval continues.

- [ ] **Step 5: Implement hybrid retrieval**

Load at most 500 published candidate chunks for the organization after visibility/profile filtering. Score:

```text
0.60 * cosine_similarity
+ 0.25 * normalized_keyword_overlap
+ 0.10 * quality_score
+ 0.05 * recency_score
```

Prefer `curated_fact` and `curated_summary`; use `raw` only when a document has no approved curated chunks. Return source IDs, chunk IDs, locators, embedding model and score breakdown in the trace.

- [ ] **Step 6: Run tests**

Run backend and runtime retrieval tests. Expected: semantic ranking passes, tenant isolation passes, and provider outage falls back to keywords.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/company-intelligence/jina-embeddings.ts backend/tests/jina-embeddings.test.ts workers/marketing-studio-agent-runtime
git commit -m "feat: add semantic company knowledge retrieval"
```

---

### Task 5: Orchestrate extraction, curation and embedding in the worker

**Files:**
- Modify: `backend/src/jobs/handlers/company-intelligence.ts`
- Modify: `backend/src/modules/company-intelligence/repository.ts`
- Modify: `backend/src/modules/company-intelligence/routes.ts`
- Create: `backend/tests/intelligent-knowledge-pipeline.test.ts`

**Interfaces:**
- Produces stages `extracting`, `cleaning`, `curating`, `embedding`, `ready_for_review`, `degraded` and `failed`.
- Produces curated facts in existing `marketing_knowledge_chunks` and raw text in `knowledge_entries`.

- [ ] **Step 1: Write pipeline tests**

Cover a 100-page-equivalent document, deterministic cleanup, multiple LLM batches, fact evidence validation, embedding batching, duplicate facts, provider failures, idempotent retry and no automatic publication.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/intelligent-knowledge-pipeline.test.ts`

Expected: current handler stops after mechanical chunking.

- [ ] **Step 3: Persist raw extraction before provider calls**

In one transaction upsert `knowledge_entries.body` with raw normalized text and raw chunks with locators. Store cleanup metrics and removed-block ledger in run metrics. This guarantees recovery if external providers fail.

- [ ] **Step 4: Curate and persist facts**

Call the runtime for each bounded batch, verify evidence again in TypeScript, deduplicate by normalized statement hash and insert `curated_fact` chunks as `pending`. Insert one `curated_summary` chunk. Store category, usefulness, sensitivity and agent profile hints in metadata.

- [ ] **Step 5: Embed curated chunks**

Call Jina in batches and update `embedding`, `embedding_model`, `embedding_dimensions` and content hash. If embedding fails, set the run to `degraded`, retain curated facts and allow keyword retrieval after review.

- [ ] **Step 6: Expose review data**

Add `GET /knowledge/:documentId/processing` and `PATCH /knowledge/:documentId/chunks/:chunkId` for approving/rejecting individual facts. Publication must require at least one approved curated chunk when curation succeeded; degraded raw-only documents remain publishable only after an explicit warning confirmation.

- [ ] **Step 7: Run backend tests and build**

Run:

```bash
npm test -- tests/intelligent-knowledge-pipeline.test.ts tests/company-intelligence-routes.test.ts
npm run type-check
npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/jobs/handlers/company-intelligence.ts backend/src/modules/company-intelligence backend/tests
git commit -m "feat: orchestrate intelligent document ingestion"
```

---

### Task 6: Discover a company website and produce reviewable suggestions

**Files:**
- Create: `backend/src/modules/company-intelligence/website-discovery.ts`
- Modify: `backend/src/modules/company-intelligence/routes.ts`
- Modify: `backend/src/jobs/handlers/company-intelligence.ts`
- Modify: `backend/src/jobs/queue.ts`
- Modify: `backend/src/worker.ts`
- Create: `backend/tests/website-discovery.test.ts`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/knowledge_intelligence.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_knowledge_intelligence.py`

**Interfaces:**
- Produces `POST /organizations/:organizationId/website-onboarding`.
- Produces `GET /website-onboarding/:runId` and `POST /website-onboarding/:runId/apply`.
- Produces runtime `POST /knowledge/extract-company-profile`.

- [ ] **Step 1: Write safe crawl tests**

Mock a homepage with same-origin about/services/contact/FAQ links plus external, login, image, query-loop and private-IP links. Assert only prioritized same-origin HTML pages are selected, each canonical URL is visited once, concurrency is at most three and total pages never exceeds the requested limit (default 10, maximum 20).

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/website-discovery.test.ts`

Expected: website discovery service/endpoints do not exist.

- [ ] **Step 3: Implement URL safety and prioritization**

Reject non-HTTP(S), credentials in URLs, localhost, private/link-local IP ranges and DNS answers that resolve privately. Normalize host, ports, fragments and trailing slashes. Prioritize path terms for about/company, services/products, cases/portfolio, FAQ, contact and policies; deprioritize blog pagination and exclude login, cart, search and assets.

- [ ] **Step 4: Read bounded pages through Jina Reader**

Use `readJinaUrl` for the homepage, extract links, then read selected pages with concurrency three. Store per-page URL, title, content hash, success/error and discovered-at timestamp in run metrics. Concatenate located page sections into one draft website knowledge source; do not publish it automatically.

- [ ] **Step 5: Extract structured company suggestions**

The runtime endpoint returns suggestions for:

```text
profile.legalName, profile.tradeName, profile.description, profile.industry,
profile.positioning, profile.differentiators, profile.emails, profile.phones,
profile.address, profile.businessHours, profile.serviceRegions,
profile.socialLinks, brand.toneOfVoice, brand.persona,
brand.brandVoiceSummary, brand.vocabularyDo, brand.priorityTopics,
products[].name, products[].description, products[].valueProposition
```

Each suggestion carries current value, suggested value, exact evidence, source URL and confidence. The model must not infer forbidden topics, compliance rules, prices or guarantees unless explicitly supported by the site.

- [ ] **Step 6: Apply only selected suggestions**

In one transaction lock the run, validate organization/client/contract, update selected profile/brand fields without blanking unselected fields, upsert selected products, mark suggestions applied with user/time and leave the website knowledge source in review.

- [ ] **Step 7: Run backend/runtime tests**

Run website discovery tests and knowledge intelligence pytest. Expected: all pass, including cross-tenant apply rejection.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/company-intelligence backend/src/jobs backend/src/worker.ts backend/tests workers/marketing-studio-agent-runtime
git commit -m "feat: add intelligent website onboarding"
```

---

### Task 7: Build document intelligence and website onboarding UX

**Files:**
- Create: `frontend/src/components/company-intelligence/KnowledgeProcessingDetails.tsx`
- Create: `frontend/src/components/company-intelligence/WebsiteOnboardingDialog.tsx`
- Create: `frontend/src/components/company-intelligence/WebsiteOnboardingDialog.test.tsx`
- Modify: `frontend/src/components/company-intelligence/KnowledgeLibrary.tsx`
- Modify: `frontend/src/components/company-intelligence/CompanyProfileForm.tsx`
- Modify: `frontend/src/pages/client-portal/company/PortalCompanyProfilePage.tsx`
- Modify: `frontend/src/services/companyIntelligenceService.ts`
- Modify: `frontend/src/types/companyIntelligence.ts`

**Interfaces:**
- Consumes Task 5 processing/fact review endpoints and Task 6 website run endpoints.
- Produces a review-first user journey with no hidden overwrites.

- [ ] **Step 1: Write interaction tests**

Test starting from a site URL, progress polling, failed-page visibility, before/after field diff, select all/individual suggestions, apply, profile refresh, raw/curated knowledge tabs, fact approval/rejection and degraded provider warnings.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/components/company-intelligence/WebsiteOnboardingDialog.test.tsx`

Expected: missing components and service methods.

- [ ] **Step 3: Add “Preencher pelo site”**

Place the action next to Save in Company Profile. Default the URL from `websiteUrl`, explain the maximum page count and show the exact pages processed. Poll every three seconds only while the run is queued/running.

- [ ] **Step 4: Build the suggestion diff**

Group suggestions into Company, Brand and Products. Show current value, suggestion, confidence, evidence excerpt and clickable source URL. Default-select only confidence `>= 0.75`; never default-select overwrites of a non-empty field when confidence is lower than `0.90`.

- [ ] **Step 5: Build document processing details**

Show extraction/cleanup/curation/embedding stages, raw versus curated tabs, retained/discarded counts, provider/model, embedding state and individual fact controls. Keep Publish separate and disabled until review requirements are met.

- [ ] **Step 6: Run frontend checks**

Run:

```bash
npm test -- src/components/company-intelligence/WebsiteOnboardingDialog.test.tsx
npm run type-check
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/company-intelligence frontend/src/pages/client-portal/company frontend/src/services/companyIntelligenceService.ts frontend/src/types/companyIntelligence.ts
git commit -m "feat: add website-assisted company onboarding"
```

---

### Task 8: Production configuration, observability and end-to-end acceptance

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `docker-compose.dokploy.yml`
- Modify: `docs/company-intelligence-operations.md`
- Modify: `docs/implementation-status.md`
- Create: `backend/tests/intelligent-knowledge-e2e.test.ts`

**Interfaces:**
- Produces deployable configuration and a repeatable production acceptance checklist.

- [ ] **Step 1: Add explicit configuration**

Document and wire:

```text
KNOWLEDGE_CURATION_ENABLED=true
KNOWLEDGE_CURATION_MAX_BATCH_CHARS=12000
KNOWLEDGE_WEBSITE_MAX_PAGES=10
JINA_EMBEDDING_MODEL=jina-embeddings-v3
JINA_EMBEDDING_DIMENSIONS=1024
```

Continue using server-side `JINA_API_KEY`, `OPENROUTER_API_KEY`, `YUX_AGENT_RUNTIME_URL` and `YUX_AGENT_RUNTIME_TOKEN`. Never expose them to the frontend.

- [ ] **Step 2: Add processing metrics**

Log run/source/document IDs, stage durations, raw/clean/curated character counts, retained/discarded fact counts, embedding batch size, provider/model and sanitized errors. Do not log raw document content, evidence text or credentials.

- [ ] **Step 3: Write the end-to-end test**

Mock Jina Reader, OpenRouter and Jina Embeddings. Submit a noisy long document and a site, assert raw preservation, evidence-backed facts, vectors, explicit publication, profile suggestions, selected apply, semantic retrieval and organization isolation.

- [ ] **Step 4: Run all verification**

```bash
cd backend && npm test && npm run type-check && npm run build
cd ../frontend && npm test && npm run type-check && npm run build
cd ../workers/marketing-studio-agent-runtime && python -m pytest -q
```

Expected: all suites pass.

- [ ] **Step 5: Execute the production canary**

Upload one noisy PDF, review raw and curated outputs, reject one fact, publish, ask an agent a semantic paraphrase absent from the source keywords, verify evidence trace, onboard a site with 5–10 pages, apply selected fields, and verify a second organization cannot retrieve any imported text.

- [ ] **Step 6: Update truthful documentation**

State that LLM curation and Jina semantic retrieval are active only when their provider keys are configured. Document keyword fallback, review gates, supported locators, crawl limits, cost controls and recovery/retry behavior.

- [ ] **Step 7: Commit**

```bash
git add backend frontend workers docker-compose.dokploy.yml docs
git commit -m "docs: operationalize intelligent company knowledge"
```

---

## Self-review

- Spec coverage: large document cleanup, LLM usefulness filtering, raw preservation, evidence, embeddings, hybrid RAG, website navigation, automatic suggestions, selective profile/brand/product filling, human review, tenant isolation and downstream agents are all covered.
- Data model: raw source stays in `knowledge_entries`; derived retrieval units stay in the existing `marketing_knowledge_chunks`, avoiding a duplicate knowledge store.
- Failure behavior: OpenRouter failure preserves raw chunks; Jina failure preserves curated keyword-searchable facts; neither condition silently publishes content.
- Type consistency: `organizationId`, `clientId`, `contractId`, `sourceId`, `documentId` and `runId` remain the tenant tuple across API, jobs and runtime.
- Scope control: the first release uses bounded same-origin Reader discovery and JSONB cosine ranking; browser execution, unrestricted crawling, pgvector and a separate vector database are intentionally excluded.
