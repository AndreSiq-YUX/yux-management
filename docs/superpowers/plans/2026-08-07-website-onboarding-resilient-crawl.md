# Website Onboarding Resilient Crawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Analyze more than ten useful pages and keep producing grounded, editable company suggestions when individual Agent Harness batches fail.

**Architecture:** Replace the one-level, ten-page crawl with a bounded recursive same-origin crawl capped at 50 pages. Send discovered pages to the Agent Harness in small character-bounded batches, recursively isolate failed batches, merge grounded suggestions and preserve safe provider errors for operations without exposing secrets to the browser.

**Tech Stack:** TypeScript, Fastify, BullMQ, Vitest, Python 3.12, FastAPI, unittest, React/Vite.

## Global Constraints

- Preserve SSRF protection and crawl only the requested public hostname or its already-supported dominant canonical alias.
- Default to 30 pages and enforce a hard maximum of 50 pages.
- Never send more than three pages or 60,000 characters in one extraction request.
- Suggestions must continue to require literal evidence from their source page.
- A failed page/batch may degrade coverage, but must not discard successful batches.

---

### Task 1: Recursive bounded website discovery

**Files:**
- Modify: `backend/src/modules/company-intelligence/website-discovery.ts`
- Modify: `backend/tests/website-discovery.test.ts`

**Interfaces:**
- Consumes: `discoverCompanyWebsite(inputUrl, { maxPages, concurrency, readPage, resolveHost })`.
- Produces: the same return contract with recursively discovered `pages` and accurate `failedPages`.

- [x] **Step 1: Write the failing test**

```ts
it('discovers useful links found on child pages until the configured limit', async () => {
  const result = await discoverCompanyWebsite('https://example.com', { maxPages: 4, readPage })
  expect(result.pages.map(page => page.url)).toContain('https://example.com/cases/cliente-a')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/website-discovery.test.ts`
Expected: FAIL because only homepage links are queued.

- [x] **Step 3: Implement bounded breadth-first discovery**

```ts
const queued = rankSameOriginLinks(root, homepage.links)
while (queued.length && attempted < maxPages - 1) {
  const result = await readPage(queued.shift()!)
  enqueueUnseen(rankSameOriginLinks(root, result.links))
}
```

- [x] **Step 4: Run the focused test**

Run: `npm test -- --run tests/website-discovery.test.ts`
Expected: PASS.

### Task 2: Resilient Agent Harness batching

**Files:**
- Modify: `backend/src/modules/company-intelligence/runtime-curation.ts`
- Modify: `backend/src/jobs/handlers/company-intelligence.ts`
- Modify: `backend/tests/knowledge-curation-client.test.ts`

**Interfaces:**
- Consumes: tenant scope and discovered website pages.
- Produces: `extractCompanyProfileInBatches(env, input)` returning merged `suggestions`, warnings, provider, model, successful batch count and failed page URLs.

- [x] **Step 1: Write failing batch-isolation tests**

```ts
expect(fetch).toHaveBeenCalledTimes(2)
expect(result.suggestions).toHaveLength(2)
expect(result.warnings).toContain('website_batch_failed:https://example.com/b')
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/knowledge-curation-client.test.ts`
Expected: FAIL because the client currently sends one request.

- [x] **Step 3: Add character-bounded batches and recursive failure isolation**

```ts
export async function extractCompanyProfileInBatches(env: AppEnv, input: WebsiteExtractionInput) {
  const results = await extractBatches(splitWebsitePages(input.pages), input)
  return mergeWebsiteExtractions(results)
}
```

- [x] **Step 4: Run focused backend tests**

Run: `npm test -- --run tests/knowledge-curation-client.test.ts tests/website-discovery.test.ts`
Expected: PASS.

### Task 3: Runtime error normalization

**Files:**
- Modify: `backend/src/lib/agent-runtime-client.ts`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/knowledge_intelligence.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_knowledge_intelligence.py`

**Interfaces:**
- Consumes: provider responses and HTTP error bodies.
- Produces: normalized numeric scores and safe error codes such as `agent_runtime_502:website_extraction_failed`.

- [x] **Step 1: Add tests for malformed confidence and runtime error bodies**

```python
self.assertEqual(result["suggestions"][0]["confidence"], 0.0)
```

- [x] **Step 2: Run tests to verify failure**

Run: `python -m unittest tests.test_knowledge_intelligence -v`
Expected: FAIL when confidence is an object or non-numeric string.

- [x] **Step 3: Normalize model output and log unexpected runtime exceptions**

```python
def _score(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value or 0)))
    except (TypeError, ValueError):
        return 0.0
```

- [x] **Step 4: Run Python tests**

Run: `python -m unittest discover -s tests -v`
Expected: PASS.

### Task 4: Raise the configurable page limit and validate the rendered flow

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/modules/company-intelligence/routes.ts`
- Modify: `frontend/src/services/companyIntelligenceService.ts`
- Modify: `docker-compose.dokploy.yml`
- Modify: `docs/company-intelligence-operations.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes: optional `maxPages` from the website-onboarding request.
- Produces: default 30 and hard maximum 50 consistently in frontend, API, worker and deployment configuration.

- [x] **Step 1: Update defaults and bounds**

```ts
const DEFAULT_WEBSITE_MAX_PAGES = 30
const HARD_WEBSITE_MAX_PAGES = 50
```

- [x] **Step 2: Run all automated checks**

Run: backend/frontend `npm test` and `npm run build`; Python `python -m unittest discover -s tests -v`.
Expected: PASS.

- [ ] **Step 3: Deploy and repeat the Browser interaction**

Interaction: Empresa/Perfil → Analisar site → wait for completion.
Expected: more than ten pages may be listed, successful suggestions remain editable, and no generic `agent_runtime_500` is rendered.

- [x] **Step 4: Commit and push**

```bash
git commit -m "fix(company-intelligence): make website extraction resilient"
git push origin codex/company-intelligence-active-prospecting
```
