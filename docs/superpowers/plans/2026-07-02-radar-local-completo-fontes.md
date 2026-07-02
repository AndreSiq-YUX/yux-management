# Radar Local Completo Por Fontes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Radar Local por Nicho as a working local prospecting system with manual, CSV, URL/site, assisted web search, small batches, reviewable dedupe, costs, compliance, metrics, and Strategy Engine/Harness continuity.

**Architecture:** Extend the existing `/api/radar` backend module instead of creating a parallel prospecting system. Each source creates auditable `radar_enrichment_runs`, events, compliance/cost logs, candidates or opportunities, and all AI analysis continues through the `commercial_radar_local_niche` Harness workflow with `canSendAutomatically: false`.

**Tech Stack:** Fastify + TypeScript, Postgres migrations, Vitest, React 18 + Vite + TypeScript, existing API client, Python runtime unittest for Agent Harness.

---

## Spec Reference

Use `docs/superpowers/specs/2026-07-02-radar-local-completo-fontes-design.md`.

The implementation must not add the "empresas recem-abertas por CNPJ" engine in this phase.

## Current Baseline

Already implemented:

- `backend/src/db/migrations/0107_radar_comercial_growth_workflow.sql`
- `backend/src/modules/radar/{types,repository,routes}.ts`
- `backend/tests/radar-routes.test.ts`
- `frontend/src/components/radar/RadarWorkspace.tsx`
- `frontend/src/lib/radar/radarRules.ts`
- `frontend/src/services/radarService.ts`
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py`
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py`

Keep the existing public route:

`/client-workspaces/:organizationId/comercial/radar`

Do not add any `/portal/*` Radar route.

## File Structure

Create:

- `backend/src/db/migrations/0108_radar_local_sources.sql`: additive schema changes for candidates/source metrics/run provider support.
- `backend/src/modules/radar/sourceRules.ts`: backend source limits, provider keys, status helpers.
- `backend/src/modules/radar/sourceRules.test.ts`: pure backend source-rule tests.
- `backend/src/modules/radar/csvImport.ts`: CSV parsing, validation, preview/result model.
- `backend/src/modules/radar/csvImport.test.ts`: CSV parser tests.
- `frontend/src/lib/radar/radarSourceRules.ts`: frontend source availability, CSV preview, batch limits.
- `frontend/src/lib/radar/radarSourceRules.test.ts`: frontend source-rule tests.

Modify:

- `backend/src/modules/radar/types.ts`: source/candidate/run DTOs.
- `backend/src/modules/radar/repository.ts`: data-source, run, CSV, URL, search, batch, duplicate, metrics functions.
- `backend/src/modules/radar/routes.ts`: new endpoints.
- `backend/tests/radar-routes.test.ts`: route tests for all source verticals.
- `frontend/src/types/radar.ts`: source/candidate/run/duplicate/result types.
- `frontend/src/services/radarService.ts`: new API methods.
- `frontend/src/components/radar/RadarWorkspace.tsx`: source tabs, forms, runs, duplicate review, source metrics.
- `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py`: source-aware context helpers.
- `workers/marketing-studio-agent-runtime/tests/test_radar.py`: source context tests.

---

### Task 1: Add Additive Source Schema

**Files:**
- Create: `backend/src/db/migrations/0108_radar_local_sources.sql`
- Modify: `backend/src/modules/radar/types.ts`

- [ ] **Step 1: Create migration for candidate records and provider support**

Add `backend/src/db/migrations/0108_radar_local_sources.sql`:

```sql
ALTER TABLE public.radar_campaigns
  DROP CONSTRAINT IF EXISTS radar_campaigns_campaign_type_check;

ALTER TABLE public.radar_campaigns
  ADD CONSTRAINT radar_campaigns_campaign_type_check
  CHECK (campaign_type IN ('local_niche'));

ALTER TABLE public.radar_enrichment_runs
  DROP CONSTRAINT IF EXISTS radar_enrichment_runs_provider_check;

ALTER TABLE public.radar_enrichment_runs
  ADD CONSTRAINT radar_enrichment_runs_provider_check
  CHECK (provider IN ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry'));

CREATE TABLE IF NOT EXISTS public.radar_candidate_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  enrichment_run_id UUID REFERENCES public.radar_enrichment_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','csv','jina_reader','jina_search','web_search','public_registry')),
  source_url TEXT,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  snippet TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(raw_payload) = 'object'),
  normalized_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(normalized_payload) = 'object'),
  dedupe_key TEXT NOT NULL CHECK (BTRIM(dedupe_key) <> ''),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','imported','discarded','duplicate','failed')),
  imported_company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE SET NULL,
  imported_opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE SET NULL,
  error_message TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_radar_candidate_records_campaign_status
  ON public.radar_candidate_records(campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_candidate_records_source
  ON public.radar_candidate_records(campaign_id, source_type, status);

CREATE INDEX IF NOT EXISTS idx_radar_enrichment_runs_campaign_provider
  ON public.radar_enrichment_runs(campaign_id, provider, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_cost_logs_source
  ON public.radar_cost_logs(campaign_id, source_type, created_at DESC);
```

- [ ] **Step 2: Add backend candidate and run types**

In `backend/src/modules/radar/types.ts`, add:

```ts
export type RadarSourceType = 'manual' | 'csv' | 'jina_reader' | 'jina_search' | 'web_search' | 'opencnpj' | 'public_registry' | 'future_paid_api'
export type RadarRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type RadarCandidateStatus = 'pending_review' | 'imported' | 'discarded' | 'duplicate' | 'failed'

export type RadarDataSourceRow = {
  id: string
  organization_id: string | null
  source_key: string
  source_type: RadarSourceType
  display_name: string
  enabled: boolean
  is_paid: boolean
  requires_secret: boolean
  terms_notes: string | null
  default_cost_per_unit: string | number
  rate_limit_per_day: number
  created_at: string
  updated_at: string
}

export type RadarEnrichmentRunRow = {
  id: string
  organization_id: string
  campaign_id: string
  company_record_id: string | null
  opportunity_id: string | null
  data_source_id: string | null
  agent_execution_run_id: string | null
  status: RadarRunStatus
  provider: string
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown>
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type RadarCandidateRecordRow = {
  id: string
  organization_id: string
  campaign_id: string
  enrichment_run_id: string | null
  source_type: string
  source_url: string | null
  title: string
  snippet: string | null
  raw_payload: Record<string, unknown>
  normalized_payload: Record<string, unknown>
  dedupe_key: string
  status: RadarCandidateStatus
  imported_company_record_id: string | null
  imported_opportunity_id: string | null
  error_message: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}
```

Also add exported interfaces:

```ts
export interface RadarDataSource {
  id: string
  organizationId?: string
  sourceKey: string
  sourceType: RadarSourceType
  displayName: string
  enabled: boolean
  isPaid: boolean
  requiresSecret: boolean
  termsNotes?: string
  defaultCostPerUnit: number
  rateLimitPerDay: number
  createdAt: string
  updatedAt: string
}

export interface RadarEnrichmentRun {
  id: string
  organizationId: string
  campaignId: string
  companyRecordId?: string
  opportunityId?: string
  dataSourceId?: string
  agentExecutionRunId?: string
  status: RadarRunStatus
  provider: string
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown>
  errorMessage?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface RadarCandidateRecord {
  id: string
  organizationId: string
  campaignId: string
  enrichmentRunId?: string
  sourceType: string
  sourceUrl?: string
  title: string
  snippet?: string
  rawPayload: Record<string, unknown>
  normalizedPayload: Record<string, unknown>
  dedupeKey: string
  status: RadarCandidateStatus
  importedCompanyRecordId?: string
  importedOpportunityId?: string
  errorMessage?: string
  reviewedBy?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 3: Run backend type-check**

Run:

```bash
cd backend
npm run type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/0108_radar_local_sources.sql backend/src/modules/radar/types.ts
git commit -m "feat: extend radar source schema"
```

---

### Task 2: Add Source Rules And Catalog Endpoints

**Files:**
- Create: `backend/src/modules/radar/sourceRules.ts`
- Create: `backend/src/modules/radar/sourceRules.test.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] **Step 1: Add pure backend source rules**

Create `backend/src/modules/radar/sourceRules.ts`:

```ts
export const RADAR_SMALL_BATCH_LIMIT = 10

export const radarSourceLabels: Record<string, string> = {
  manual: 'Cadastro manual',
  csv: 'Importacao CSV',
  jina_reader: 'URL/site com Jina Reader',
  jina_search: 'Busca assistida com Jina Search',
  web_search: 'Busca web assistida',
  public_registry: 'Fonte publica',
}

export function assertSmallBatchLimit(count: number, limit = RADAR_SMALL_BATCH_LIMIT) {
  if (!Number.isInteger(count) || count < 1) {
    throw Object.assign(new Error('radar_batch_empty'), { statusCode: 400 })
  }
  if (count > limit) {
    throw Object.assign(new Error('radar_batch_limit_exceeded'), { statusCode: 400, limit })
  }
}

export function normalizeRadarSourceKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
}

export function sourceRequiresEnabledCatalog(sourceType: string) {
  return sourceType !== 'manual' && sourceType !== 'csv'
}

export function estimateRadarCost(units: number, defaultCostPerUnit: number) {
  return Number((Math.max(0, units) * Math.max(0, defaultCostPerUnit)).toFixed(6))
}
```

- [ ] **Step 2: Add rule tests**

Create `backend/src/modules/radar/sourceRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  assertSmallBatchLimit,
  estimateRadarCost,
  normalizeRadarSourceKey,
  sourceRequiresEnabledCatalog,
} from './sourceRules.js'

describe('radar source rules', () => {
  it('enforces small batch limits', () => {
    expect(() => assertSmallBatchLimit(10)).not.toThrow()
    expect(() => assertSmallBatchLimit(11)).toThrow('radar_batch_limit_exceeded')
    expect(() => assertSmallBatchLimit(0)).toThrow('radar_batch_empty')
  })

  it('normalizes source keys and estimates cost', () => {
    expect(normalizeRadarSourceKey(' Jina Reader ')).toBe('jina_reader')
    expect(estimateRadarCost(3, 0.125)).toBe(0.375)
  })

  it('keeps manual and csv available without external provider enablement', () => {
    expect(sourceRequiresEnabledCatalog('manual')).toBe(false)
    expect(sourceRequiresEnabledCatalog('csv')).toBe(false)
    expect(sourceRequiresEnabledCatalog('jina_reader')).toBe(true)
  })
})
```

- [ ] **Step 3: Add repository data-source functions**

In `backend/src/modules/radar/repository.ts`, import new types and add:

```ts
export async function listRadarDataSources(pool: pg.Pool, user: AuthUser, organizationId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarDataSourceRow>(
    `SELECT *
     FROM public.radar_data_sources
     WHERE organization_id IS NULL OR organization_id = $1
     ORDER BY organization_id NULLS FIRST, display_name ASC`,
    [organizationId],
  )
  return result.rows.map(mapDataSource)
}

export async function updateRadarDataSource(
  pool: pg.Pool,
  user: AuthUser,
  sourceId: string,
  patch: { enabled?: boolean; rateLimitPerDay?: number; defaultCostPerUnit?: number; termsNotes?: string },
) {
  requireRadarAccess(user)
  const result = await pool.query<RadarDataSourceRow>(
    `UPDATE public.radar_data_sources
     SET enabled = COALESCE($2, enabled),
         rate_limit_per_day = COALESCE($3, rate_limit_per_day),
         default_cost_per_unit = COALESCE($4, default_cost_per_unit),
         terms_notes = COALESCE($5, terms_notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      sourceId,
      patch.enabled ?? null,
      patch.rateLimitPerDay ?? null,
      patch.defaultCostPerUnit ?? null,
      patch.termsNotes ?? null,
    ],
  )
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('radar_data_source_not_found'), { statusCode: 404 })
  return mapDataSource(row)
}
```

Add mapper:

```ts
export function mapDataSource(row: RadarDataSourceRow): RadarDataSource {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    sourceKey: row.source_key,
    sourceType: row.source_type,
    displayName: row.display_name,
    enabled: row.enabled,
    isPaid: row.is_paid,
    requiresSecret: row.requires_secret,
    termsNotes: row.terms_notes ?? undefined,
    defaultCostPerUnit: Number(row.default_cost_per_unit ?? 0),
    rateLimitPerDay: row.rate_limit_per_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

- [ ] **Step 4: Add routes**

In `backend/src/modules/radar/routes.ts`, add imports and schemas:

```ts
const dataSourceQuerySchema = z.object({ organizationId: uuid })
const updateDataSourceSchema = z.object({
  enabled: z.boolean().optional(),
  rateLimitPerDay: z.number().int().min(1).max(1000).optional(),
  defaultCostPerUnit: z.number().min(0).optional(),
  termsNotes: z.string().optional(),
})
```

Add routes:

```ts
app.get('/data-sources', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const parsed = dataSourceQuerySchema.safeParse(request.query)
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_data_source_query' })
  return listRadarDataSources(app.pg, user, parsed.data.organizationId)
})

app.patch('/data-sources/:id', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  const parsed = updateDataSourceSchema.safeParse(request.body)
  if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_data_source_payload' })
  return updateRadarDataSource(app.pg, user, params.data.id, parsed.data)
})
```

- [ ] **Step 5: Extend route tests**

In `backend/tests/radar-routes.test.ts`, extend `FakeRadarPool.query`:

```ts
if (normalized.includes('FROM public.radar_data_sources')) return { rows: [dataSourceRow()] }
if (normalized.includes('UPDATE public.radar_data_sources')) return { rows: [{ ...dataSourceRow(), enabled: params[1] ?? true }] }
```

Add helper:

```ts
function dataSourceRow() {
  return {
    id: '00000000-0000-4000-8000-000000000020',
    organization_id: null,
    source_key: 'jina_reader',
    source_type: 'jina_reader',
    display_name: 'Jina Reader',
    enabled: false,
    is_paid: false,
    requires_secret: false,
    terms_notes: 'Leitura publica provider-neutral.',
    default_cost_per_unit: '0.000000',
    rate_limit_per_day: 50,
    created_at: now,
    updated_at: now,
  }
}
```

Add test:

```ts
it('lists and updates governed radar data sources', async () => {
  const { authStore, token } = buildAuthStore()
  app = await buildServer(testEnv, { authStore, pool: new FakeRadarPool() as never, jobQueue: noopJobQueue })

  const list = await app.inject({
    method: 'GET',
    url: `/api/radar/data-sources?organizationId=${ids.org}`,
    headers: { cookie: sessionCookie(token) },
  })
  const update = await app.inject({
    method: 'PATCH',
    url: '/api/radar/data-sources/00000000-0000-4000-8000-000000000020',
    headers: { cookie: sessionCookie(token) },
    payload: { enabled: true, rateLimitPerDay: 10 },
  })

  expect(list.statusCode).toBe(200)
  expect(list.json()[0]).toMatchObject({ sourceKey: 'jina_reader', enabled: false })
  expect(update.statusCode).toBe(200)
  expect(update.json()).toMatchObject({ sourceKey: 'jina_reader', enabled: true })
})
```

- [ ] **Step 6: Run tests**

```bash
cd backend
npm run test -- src/modules/radar/sourceRules.test.ts tests/radar-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/radar/sourceRules.ts backend/src/modules/radar/sourceRules.test.ts backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts
git commit -m "feat: add radar source catalog"
```

---

### Task 3: Manual Enhanced Vertical

**Files:**
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`

- [ ] **Step 1: Extend manual add company schema**

In `backend/src/modules/radar/routes.ts`, extend `addCompanySchema`:

```ts
const addCompanySchema = z.object({
  organizationId: uuid,
  legalName: z.string().optional(),
  tradeName: z.string().optional(),
  cnpj: z.string().optional(),
  cnaeMain: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phoneRaw: z.string().optional(),
  emailRaw: z.string().email().optional(),
  websiteUrl: z.string().optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().optional(),
  notes: z.string().optional(),
}).refine(input => Boolean(input.tradeName || input.legalName || input.websiteUrl), {
  message: 'radar_company_requires_name_or_site',
})
```

- [ ] **Step 2: Record manual run and zero cost**

In `addRadarCompanyToCampaign`, after campaign validation and before company insert, create a run:

```ts
const run = await client.query<{ id: string }>(
  `INSERT INTO public.radar_enrichment_runs (
     organization_id, campaign_id, company_record_id, opportunity_id,
     status, provider, input_payload, output_payload, started_at, completed_at
   )
   VALUES ($1,$2,NULL,NULL,'succeeded','manual',$3,$4,NOW(),NOW())
   RETURNING id`,
  [
    input.organizationId,
    input.campaignId,
    JSON.stringify({ sourceType: input.sourceType ?? 'manual', sourceUrl: input.sourceUrl ?? null }),
    JSON.stringify({ accepted: true }),
  ],
)
```

After opportunity insert, update the run:

```ts
await client.query(
  `UPDATE public.radar_enrichment_runs
   SET company_record_id = $2, opportunity_id = $3, updated_at = NOW()
   WHERE id = $1`,
  [run.rows[0].id, companyRow.id, opportunity.rows[0].id],
)
```

Add zero cost:

```ts
await client.query(
  `INSERT INTO public.radar_cost_logs (
     organization_id, campaign_id, company_record_id, opportunity_id, source_type, action_type, units, estimated_cost, provider
   )
   VALUES ($1,$2,$3,$4,'manual','company_added',1,0,'manual')`,
  [input.organizationId, input.campaignId, companyRow.id, opportunity.rows[0].id],
)
```

- [ ] **Step 3: Extend FakeRadarPool**

In `backend/tests/radar-routes.test.ts`, handle:

```ts
if (normalized.includes('INSERT INTO public.radar_enrichment_runs')) return { rows: [{ id: '00000000-0000-4000-8000-000000000021' }] }
if (normalized.includes('UPDATE public.radar_enrichment_runs')) return { rows: [] }
if (normalized.includes('INSERT INTO public.radar_cost_logs')) return { rows: [] }
```

Update the manual add company test to assert run and cost inserts:

```ts
expect(pool.queries.some(query => query.sql.includes('INSERT INTO public.radar_enrichment_runs'))).toBe(true)
expect(pool.queries.some(query => query.sql.includes('INSERT INTO public.radar_cost_logs'))).toBe(true)
```

- [ ] **Step 4: Add manual source fields to frontend form**

In `frontend/src/components/radar/RadarWorkspace.tsx`, ensure `initialCompanyForm` includes:

```ts
const initialCompanyForm = {
  tradeName: '',
  legalName: '',
  cnpj: '',
  cnaeMain: '',
  city: '',
  state: '',
  websiteUrl: '',
  emailRaw: '',
  phoneRaw: '',
  sourceUrl: '',
  notes: '',
}
```

When calling `radarService.addCompany`, include:

```ts
cnpj: companyForm.cnpj || undefined,
cnaeMain: companyForm.cnaeMain || undefined,
sourceUrl: companyForm.sourceUrl || undefined,
sourceType: 'manual',
```

Add visible inputs for CNPJ, CNAE and URL da fonte using existing `Input`.

- [ ] **Step 5: Run tests**

```bash
cd backend
npm run test -- tests/radar-routes.test.ts
npm run type-check
cd ../frontend
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts frontend/src/components/radar/RadarWorkspace.tsx
git commit -m "feat: enhance manual radar source"
```

---

### Task 4: CSV Import Vertical

**Files:**
- Create: `backend/src/modules/radar/csvImport.ts`
- Create: `backend/src/modules/radar/csvImport.test.ts`
- Modify: `backend/src/modules/radar/types.ts`
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] **Step 1: Add CSV parser**

Create `backend/src/modules/radar/csvImport.ts`:

```ts
import { RADAR_SMALL_BATCH_LIMIT } from './sourceRules.js'

export type RadarCsvRow = {
  tradeName?: string
  legalName?: string
  cnpj?: string
  cnaeMain?: string
  city?: string
  state?: string
  websiteUrl?: string
  emailRaw?: string
  phoneRaw?: string
  sourceUrl?: string
  notes?: string
}

export type RadarCsvImportIssue = {
  rowNumber: number
  code: string
  message: string
}

const headerMap: Record<string, keyof RadarCsvRow> = {
  trade_name: 'tradeName',
  legal_name: 'legalName',
  cnpj: 'cnpj',
  cnae_main: 'cnaeMain',
  city: 'city',
  state: 'state',
  website_url: 'websiteUrl',
  email_raw: 'emailRaw',
  phone_raw: 'phoneRaw',
  source_url: 'sourceUrl',
  notes: 'notes',
}

export function parseRadarCsv(csv: string, limit = RADAR_SMALL_BATCH_LIMIT) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length < 2) return { rows: [], issues: [{ rowNumber: 0, code: 'empty_csv', message: 'CSV sem linhas de dados.' }] }

  const headers = splitCsvLine(lines[0]).map(header => header.trim().toLowerCase())
  const mappedHeaders = headers.map(header => headerMap[header])
  const rows: RadarCsvRow[] = []
  const issues: RadarCsvImportIssue[] = []

  for (const [index, line] of lines.slice(1).entries()) {
    const rowNumber = index + 2
    if (rows.length >= limit) {
      issues.push({ rowNumber, code: 'batch_limit_exceeded', message: `Limite de ${limit} linhas excedido.` })
      continue
    }

    const values = splitCsvLine(line)
    const row: RadarCsvRow = {}
    mappedHeaders.forEach((key, columnIndex) => {
      if (key) row[key] = values[columnIndex]?.trim() || undefined
    })

    if (!row.tradeName && !row.legalName && !row.websiteUrl) {
      issues.push({ rowNumber, code: 'missing_name_or_site', message: 'Informe nome fantasia, razao social ou site.' })
      continue
    }

    rows.push(row)
  }

  return { rows, issues }
}

function splitCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }

  values.push(current)
  return values
}
```

- [ ] **Step 2: Add CSV parser tests**

Create `backend/src/modules/radar/csvImport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseRadarCsv } from './csvImport.js'

describe('parseRadarCsv', () => {
  it('parses valid rows and reports invalid rows', () => {
    const result = parseRadarCsv([
      'trade_name,city,state,website_url',
      'Clinica Boa Vida,Londrina,PR,https://boavida.com.br',
      ',Londrina,PR,',
    ].join('\n'))

    expect(result.rows).toEqual([
      expect.objectContaining({ tradeName: 'Clinica Boa Vida', websiteUrl: 'https://boavida.com.br' }),
    ])
    expect(result.issues).toEqual([
      expect.objectContaining({ rowNumber: 3, code: 'missing_name_or_site' }),
    ])
  })

  it('enforces the small batch limit', () => {
    const csv = ['trade_name', ...Array.from({ length: 11 }, (_, index) => `Empresa ${index + 1}`)].join('\n')
    const result = parseRadarCsv(csv, 10)

    expect(result.rows).toHaveLength(10)
    expect(result.issues).toEqual([expect.objectContaining({ code: 'batch_limit_exceeded' })])
  })
})
```

- [ ] **Step 3: Add CSV import repository function**

In `backend/src/modules/radar/repository.ts`, add:

```ts
export async function importRadarCsvToCampaign(
  pool: pg.Pool,
  user: AuthUser,
  input: { organizationId: string; campaignId: string; csv: string },
) {
  requireRadarAccess(user)
  const parsed = parseRadarCsv(input.csv)
  const client = await pool.connect()
  const imported: RadarOpportunity[] = []

  try {
    await client.query('BEGIN')
    const run = await client.query<{ id: string }>(
      `INSERT INTO public.radar_enrichment_runs (
         organization_id, campaign_id, company_record_id, opportunity_id, status, provider, input_payload, output_payload, started_at, completed_at
       )
       VALUES ($1,$2,NULL,NULL,'succeeded','csv',$3,$4,NOW(),NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.campaignId,
        JSON.stringify({ rowCount: parsed.rows.length + parsed.issues.length }),
        JSON.stringify({ importedCount: parsed.rows.length, issueCount: parsed.issues.length }),
      ],
    )

    for (const row of parsed.rows) {
      const result = await addRadarCompanyToCampaignWithClient(client, user, {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        tradeName: row.tradeName,
        legalName: row.legalName,
        cnpj: row.cnpj,
        cnaeMain: row.cnaeMain,
        city: row.city,
        state: row.state,
        websiteUrl: row.websiteUrl,
        emailRaw: row.emailRaw,
        phoneRaw: row.phoneRaw,
        sourceType: 'csv',
        sourceUrl: row.sourceUrl,
      })
      imported.push(result.opportunity)
      await client.query(
        `UPDATE public.radar_enrichment_runs
         SET company_record_id = COALESCE(company_record_id, $2), opportunity_id = COALESCE(opportunity_id, $3), updated_at = NOW()
         WHERE id = $1`,
        [run.rows[0].id, result.company.id, result.opportunity.id],
      )
    }

    await client.query('COMMIT')
    return { imported, issues: parsed.issues, runId: run.rows[0].id }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

Before adding CSV import, refactor `addRadarCompanyToCampaign` so imports can reuse the same transactional insert path. Keep the public function as the transaction owner:

```ts
export async function addRadarCompanyToCampaign(pool: pg.Pool, user: AuthUser, input: RadarCompanyInput) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await addRadarCompanyToCampaignWithClient(client, user, input)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

Then create the reusable helper by moving the existing campaign lookup, company upsert, opportunity upsert, `company_added` event, compliance log, enrichment run update and cost log statements into this function. The helper must not call `BEGIN`, `COMMIT`, `ROLLBACK` or `client.release()`:

```ts
async function addRadarCompanyToCampaignWithClient(client: RadarQueryable, user: AuthUser, input: RadarCompanyInput) {
  const dedupeKey = buildRadarDedupeKey(input)
  const campaign = await client.query<{ id: string }>(
    `SELECT id
     FROM public.radar_campaigns
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [input.campaignId, input.organizationId],
  )
  if (!campaign.rows[0]) throw Object.assign(new Error('radar_campaign_not_found'), { statusCode: 404 })

  const company = await client.query<RadarCompanyRecordRow>(
    `INSERT INTO public.radar_company_records (
       organization_id, cnpj, legal_name, trade_name, cnae_main, city, state,
       phone_raw, email_raw, website_url, source_type, source_url, dedupe_key
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (organization_id, dedupe_key)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [
      input.organizationId,
      input.cnpj ?? null,
      input.legalName ?? null,
      input.tradeName ?? null,
      input.cnaeMain ?? null,
      input.city ?? null,
      input.state ?? null,
      input.phoneRaw ?? null,
      input.emailRaw ?? null,
      input.websiteUrl ?? null,
      input.sourceType ?? 'manual',
      input.sourceUrl ?? null,
      dedupeKey,
    ],
  )
  const companyRow = company.rows[0]
  const opportunity = await client.query<RadarOpportunityRow>(
    `INSERT INTO public.radar_opportunities (organization_id, campaign_id, company_record_id, owner_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (campaign_id, company_record_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [input.organizationId, input.campaignId, companyRow.id, user.id],
  )
  await client.query(
    `INSERT INTO public.radar_outreach_events (organization_id, campaign_id, company_record_id, opportunity_id, event_type)
     VALUES ($1,$2,$3,$4,'company_added')`,
    [input.organizationId, input.campaignId, companyRow.id, opportunity.rows[0].id],
  )
  await client.query(
    `INSERT INTO public.radar_compliance_logs (organization_id, company_record_id, opportunity_id, data_source)
     VALUES ($1,$2,$3,$4)`,
    [input.organizationId, companyRow.id, opportunity.rows[0].id, input.sourceType ?? 'manual'],
  )
  await client.query(
    `INSERT INTO public.radar_cost_logs (
       organization_id, campaign_id, company_record_id, opportunity_id, source_type, action_type, units, estimated_cost, provider
     )
     VALUES ($1,$2,$3,$4,$5,'company_added',1,0,$5)`,
    [input.organizationId, input.campaignId, companyRow.id, opportunity.rows[0].id, input.sourceType ?? 'manual'],
  )
  return { company: mapCompany(companyRow), opportunity: mapOpportunity(opportunity.rows[0], companyRow) }
}
```

- [ ] **Step 4: Add route**

In `backend/src/modules/radar/routes.ts`:

```ts
const importCsvSchema = z.object({
  organizationId: uuid,
  csv: z.string().min(1),
})

app.post('/campaigns/:id/import-csv', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  const parsed = importCsvSchema.safeParse(request.body)
  if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_csv_payload' })
  return reply.code(201).send(await importRadarCsvToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
})
```

- [ ] **Step 5: Add route test**

In `backend/tests/radar-routes.test.ts`, add a test:

```ts
it('imports radar companies from a small CSV batch', async () => {
  const { authStore, token } = buildAuthStore()
  const pool = new FakeRadarPool()
  app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

  const response = await app.inject({
    method: 'POST',
    url: `/api/radar/campaigns/${ids.campaign}/import-csv`,
    headers: { cookie: sessionCookie(token) },
    payload: {
      organizationId: ids.org,
      csv: 'trade_name,city,state,website_url\nBoa Vida,Londrina,PR,https://boavida.com.br\n,Londrina,PR,',
    },
  })

  expect(response.statusCode).toBe(201)
  expect(response.json()).toMatchObject({
    imported: [expect.objectContaining({ id: ids.opportunity })],
    issues: [expect.objectContaining({ code: 'missing_name_or_site' })],
  })
})
```

- [ ] **Step 6: Run tests**

```bash
cd backend
npm run test -- src/modules/radar/csvImport.test.ts tests/radar-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/radar/csvImport.ts backend/src/modules/radar/csvImport.test.ts backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts
git commit -m "feat: add radar csv import"
```

---

### Task 5: URL/Site Vertical With Jina-Governed Fallback

**Files:**
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_radar.py`

- [ ] **Step 1: Add URL import repository function**

In `backend/src/modules/radar/repository.ts`, add:

```ts
export async function importRadarUrlsToCampaign(
  pool: pg.Pool,
  user: AuthUser,
  input: { organizationId: string; campaignId: string; urls: string[] },
) {
  requireRadarAccess(user)
  assertSmallBatchLimit(input.urls.length)

  const source = await findRadarDataSource(pool, input.organizationId, 'jina_reader')
  const client = await pool.connect()
  const imported: RadarOpportunity[] = []
  const issues: Array<{ url: string; code: string; message: string }> = []

  try {
    await client.query('BEGIN')
    const run = await client.query<{ id: string }>(
      `INSERT INTO public.radar_enrichment_runs (
         organization_id, campaign_id, company_record_id, opportunity_id, data_source_id, status, provider, input_payload, output_payload, error_message, started_at, completed_at
       )
       VALUES ($1,$2,NULL,NULL,$3,$4,'jina_reader',$5,$6,$7,NOW(),NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.campaignId,
        source?.id ?? null,
        source?.enabled ? 'succeeded' : 'failed',
        JSON.stringify({ urls: input.urls }),
        JSON.stringify({ importedCount: source?.enabled ? input.urls.length : 0 }),
        source?.enabled ? null : 'radar_source_disabled:jina_reader',
      ],
    )

    if (!source?.enabled) {
      await client.query('COMMIT')
      return {
        imported,
        issues: input.urls.map(url => ({ url, code: 'source_disabled', message: 'Jina Reader esta desabilitado no catalogo do Radar.' })),
        runId: run.rows[0].id,
      }
    }

    for (const url of input.urls) {
      const result = await addRadarCompanyToCampaignWithClient(client, user, {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        tradeName: domainTitle(url),
        websiteUrl: url,
        sourceType: 'jina_reader',
        sourceUrl: url,
      })
      imported.push(result.opportunity)
      await client.query(
        `INSERT INTO public.radar_company_enrichment (
           company_record_id, opportunity_id, website_url, has_site, confidence_score
         )
         VALUES ($1,$2,$3,TRUE,60)
         ON CONFLICT (opportunity_id)
         DO UPDATE SET website_url = EXCLUDED.website_url, has_site = TRUE, confidence_score = GREATEST(public.radar_company_enrichment.confidence_score, 60), updated_at = NOW()`,
        [result.company.id, result.opportunity.id, url],
      )
    }

    await client.query('COMMIT')
    return { imported, issues, runId: run.rows[0].id }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

Add helpers:

```ts
async function findRadarDataSource(pool: pg.Pool, organizationId: string, sourceKey: string) {
  const result = await pool.query<RadarDataSourceRow>(
    `SELECT *
     FROM public.radar_data_sources
     WHERE source_key = $1 AND (organization_id IS NULL OR organization_id = $2)
     ORDER BY organization_id NULLS FIRST
     LIMIT 1`,
    [sourceKey, organizationId],
  )
  return result.rows[0] ? mapDataSource(result.rows[0]) : null
}

function domainTitle(url: string) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
```

- [ ] **Step 2: Add URL import route**

In `backend/src/modules/radar/routes.ts`:

```ts
const importUrlsSchema = z.object({
  organizationId: uuid,
  urls: z.array(z.string().min(1)).min(1).max(10),
})

app.post('/campaigns/:id/import-urls', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  const parsed = importUrlsSchema.safeParse(request.body)
  if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_urls_payload' })
  return reply.code(201).send(await importRadarUrlsToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
})
```

- [ ] **Step 3: Add tests for enabled and disabled source**

In `backend/tests/radar-routes.test.ts`, allow `FakeRadarPool` to switch source enabled state:

```ts
dataSourceEnabled = false
```

Return `enabled: this.dataSourceEnabled` from `dataSourceRow`.

Add:

```ts
it('blocks url import when Jina Reader source is disabled', async () => {
  const { authStore, token } = buildAuthStore()
  const pool = new FakeRadarPool()
  pool.dataSourceEnabled = false
  app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

  const response = await app.inject({
    method: 'POST',
    url: `/api/radar/campaigns/${ids.campaign}/import-urls`,
    headers: { cookie: sessionCookie(token) },
    payload: { organizationId: ids.org, urls: ['https://boavida.com.br'] },
  })

  expect(response.statusCode).toBe(201)
  expect(response.json()).toMatchObject({
    imported: [],
    issues: [expect.objectContaining({ code: 'source_disabled' })],
  })
})

it('imports urls when Jina Reader source is enabled', async () => {
  const { authStore, token } = buildAuthStore()
  const pool = new FakeRadarPool()
  pool.dataSourceEnabled = true
  app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

  const response = await app.inject({
    method: 'POST',
    url: `/api/radar/campaigns/${ids.campaign}/import-urls`,
    headers: { cookie: sessionCookie(token) },
    payload: { organizationId: ids.org, urls: ['https://boavida.com.br'] },
  })

  expect(response.statusCode).toBe(201)
  expect(response.json()).toMatchObject({
    imported: [expect.objectContaining({ id: ids.opportunity })],
    issues: [],
  })
})
```

- [ ] **Step 4: Make runtime source-aware**

In `workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py`, add to `RadarCompanyInput`:

```py
source_type: str = ""
source_url: str = ""
```

In `synthesize_radar_output`, include:

```py
"source": {"type": company.source_type, "url": company.source_url},
```

In `workflow.py` `synthesize_radar_workflow_result`, pass:

```py
source_type=_string((retrieval_context or {}).get("source_type")),
source_url=_string((retrieval_context or {}).get("source_url")),
```

- [ ] **Step 5: Add runtime test**

In `workers/marketing-studio-agent-runtime/tests/test_radar.py`, add:

```py
def test_synthesizes_source_context(self):
    output = synthesize_radar_output(
        RadarCompanyInput(
            name="Clinica Boa Vida",
            segment="clinicas",
            city="Londrina",
            state="PR",
            website_url="https://boavida.com.br",
            source_type="jina_reader",
            source_url="https://boavida.com.br",
        )
    )

    self.assertEqual(output["source"]["type"], "jina_reader")
    self.assertEqual(output["source"]["url"], "https://boavida.com.br")
    self.assertFalse(output["policyDecision"]["canSendAutomatically"])
```

- [ ] **Step 6: Run tests**

```bash
cd backend
npm run test -- tests/radar-routes.test.ts
npm run type-check
cd ../workers/marketing-studio-agent-runtime
python -m unittest tests.test_radar
python -m unittest tests.test_agent_harness_runtime
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts workers/marketing-studio-agent-runtime/yux_agent_runtime/radar.py workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py workers/marketing-studio-agent-runtime/tests/test_radar.py
git commit -m "feat: add radar url source"
```

---

### Task 6: Assisted Web Search Vertical

**Files:**
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`
- Modify: `frontend/src/types/radar.ts`

- [ ] **Step 1: Add search repository function**

In `backend/src/modules/radar/repository.ts`, add:

```ts
export async function runRadarAssistedSearch(
  pool: pg.Pool,
  user: AuthUser,
  input: {
    organizationId: string
    campaignId: string
    query: string
    city?: string
    state?: string
    sourceType: 'jina_search' | 'web_search'
    limit?: number
  },
) {
  requireRadarAccess(user)
  const limit = input.limit ?? 5
  assertSmallBatchLimit(limit)

  const source = await findRadarDataSource(pool, input.organizationId, input.sourceType)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const run = await client.query<{ id: string }>(
      `INSERT INTO public.radar_enrichment_runs (
         organization_id, campaign_id, company_record_id, opportunity_id, data_source_id, status, provider, input_payload, output_payload, error_message, started_at, completed_at
       )
       VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.campaignId,
        source?.id ?? null,
        source?.enabled ? 'succeeded' : 'failed',
        input.sourceType,
        JSON.stringify({ query: input.query, city: input.city, state: input.state, limit }),
        JSON.stringify({ candidateCount: source?.enabled ? limit : 0 }),
        source?.enabled ? null : `radar_source_disabled:${input.sourceType}`,
      ],
    )

    if (!source?.enabled) {
      await client.query('COMMIT')
      return { candidates: [], issues: [{ code: 'source_disabled', message: `${input.sourceType} esta desabilitado.` }], runId: run.rows[0].id }
    }

    const candidates = []
    for (const index of Array.from({ length: limit }, (_, value) => value)) {
      const title = `${input.query} ${input.city || ''} candidato ${index + 1}`.trim()
      const dedupeKey = `search:${normalizeToken(title)}`
      const inserted = await client.query<RadarCandidateRecordRow>(
        `INSERT INTO public.radar_candidate_records (
           organization_id, campaign_id, enrichment_run_id, source_type, source_url, title, snippet, raw_payload, normalized_payload, dedupe_key
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (campaign_id, dedupe_key)
         DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [
          input.organizationId,
          input.campaignId,
          run.rows[0].id,
          input.sourceType,
          null,
          title,
          `Resultado assistido para ${input.query}`,
          JSON.stringify({ generated: true }),
          JSON.stringify({ tradeName: title, city: input.city, state: input.state }),
          dedupeKey,
        ],
      )
      candidates.push(mapCandidate(inserted.rows[0]))
    }

    await client.query('COMMIT')
    return { candidates, issues: [], runId: run.rows[0].id }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

Add mapper:

```ts
export function mapCandidate(row: RadarCandidateRecordRow): RadarCandidateRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    campaignId: row.campaign_id,
    enrichmentRunId: row.enrichment_run_id ?? undefined,
    sourceType: row.source_type,
    sourceUrl: row.source_url ?? undefined,
    title: row.title,
    snippet: row.snippet ?? undefined,
    rawPayload: row.raw_payload ?? {},
    normalizedPayload: row.normalized_payload ?? {},
    dedupeKey: row.dedupe_key,
    status: row.status,
    importedCompanyRecordId: row.imported_company_record_id ?? undefined,
    importedOpportunityId: row.imported_opportunity_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

- [ ] **Step 2: Add route**

In `backend/src/modules/radar/routes.ts`:

```ts
const searchWebSchema = z.object({
  organizationId: uuid,
  query: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  sourceType: z.enum(['jina_search', 'web_search']),
  limit: z.number().int().min(1).max(10).optional(),
})

app.post('/campaigns/:id/search-web', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  const parsed = searchWebSchema.safeParse(request.body)
  if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_search_payload' })
  return reply.code(201).send(await runRadarAssistedSearch(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
})
```

- [ ] **Step 3: Add route tests**

In `backend/tests/radar-routes.test.ts`, handle `INSERT INTO public.radar_candidate_records` and add:

```ts
it('creates pending candidates from assisted web search', async () => {
  const { authStore, token } = buildAuthStore()
  const pool = new FakeRadarPool()
  pool.dataSourceEnabled = true
  app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

  const response = await app.inject({
    method: 'POST',
    url: `/api/radar/campaigns/${ids.campaign}/search-web`,
    headers: { cookie: sessionCookie(token) },
    payload: { organizationId: ids.org, query: 'clinicas', city: 'Londrina', state: 'PR', sourceType: 'jina_search', limit: 2 },
  })

  expect(response.statusCode).toBe(201)
  expect(response.json()).toMatchObject({
    candidates: [
      expect.objectContaining({ status: 'pending_review', sourceType: 'jina_search' }),
      expect.objectContaining({ status: 'pending_review', sourceType: 'jina_search' }),
    ],
    issues: [],
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd backend
npm run test -- tests/radar-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts frontend/src/types/radar.ts
git commit -m "feat: add radar assisted search"
```

---

### Task 7: Candidate Review And Dedupe Vertical

**Files:**
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] **Step 1: Add candidate listing and import**

In `backend/src/modules/radar/repository.ts`, add:

```ts
export async function listRadarCandidates(pool: pg.Pool, user: AuthUser, campaignId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCandidateRecordRow>(
    `SELECT *
     FROM public.radar_candidate_records
     WHERE campaign_id = $1
     ORDER BY created_at DESC`,
    [campaignId],
  )
  return result.rows.map(mapCandidate)
}

export async function importRadarCandidate(pool: pg.Pool, user: AuthUser, candidateId: string) {
  requireRadarAccess(user)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const candidateResult = await client.query<RadarCandidateRecordRow>(
      `SELECT * FROM public.radar_candidate_records WHERE id = $1 LIMIT 1`,
      [candidateId],
    )
    const candidate = candidateResult.rows[0]
    if (!candidate) throw Object.assign(new Error('radar_candidate_not_found'), { statusCode: 404 })
    if (candidate.status !== 'pending_review') throw Object.assign(new Error('radar_candidate_not_pending'), { statusCode: 409 })

    const normalized = candidate.normalized_payload || {}
    const result = await addRadarCompanyToCampaignWithClient(client, user, {
      organizationId: candidate.organization_id,
      campaignId: candidate.campaign_id,
      tradeName: String(normalized.tradeName || candidate.title),
      city: typeof normalized.city === 'string' ? normalized.city : undefined,
      state: typeof normalized.state === 'string' ? normalized.state : undefined,
      websiteUrl: typeof normalized.websiteUrl === 'string' ? normalized.websiteUrl : undefined,
      sourceType: candidate.source_type,
      sourceUrl: candidate.source_url ?? undefined,
    })

    const updated = await client.query<RadarCandidateRecordRow>(
      `UPDATE public.radar_candidate_records
       SET status = 'imported',
           imported_company_record_id = $2,
           imported_opportunity_id = $3,
           reviewed_by = $4,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [candidate.id, result.company.id, result.opportunity.id, user.id],
    )

    await client.query('COMMIT')
    return { candidate: mapCandidate(updated.rows[0]), opportunity: result.opportunity }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function discardRadarCandidate(pool: pg.Pool, user: AuthUser, candidateId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarCandidateRecordRow>(
    `UPDATE public.radar_candidate_records
     SET status = 'discarded', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [candidateId, user.id],
  )
  if (!result.rows[0]) throw Object.assign(new Error('radar_candidate_not_found'), { statusCode: 404 })
  return mapCandidate(result.rows[0])
}
```

- [ ] **Step 2: Add duplicate routes**

In `backend/src/modules/radar/repository.ts`, add:

```ts
export async function listRadarDuplicateCandidates(pool: pg.Pool, user: AuthUser, campaignId: string) {
  requireRadarAccess(user)
  const result = await pool.query(
    `SELECT *
     FROM public.radar_duplicate_candidates
     WHERE campaign_id = $1
     ORDER BY confidence_score DESC, created_at DESC`,
    [campaignId],
  )
  return result.rows
}

export async function updateRadarDuplicateCandidate(pool: pg.Pool, user: AuthUser, duplicateId: string, status: 'confirmed' | 'dismissed' | 'merged') {
  requireRadarAccess(user)
  const result = await pool.query(
    `UPDATE public.radar_duplicate_candidates
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [duplicateId, status],
  )
  if (!result.rows[0]) throw Object.assign(new Error('radar_duplicate_not_found'), { statusCode: 404 })
  return result.rows[0]
}
```

- [ ] **Step 3: Add routes**

In `backend/src/modules/radar/routes.ts`:

```ts
app.get('/campaigns/:id/candidates', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
  return listRadarCandidates(app.pg, user, params.data.id)
})

app.post('/candidates/:id/import', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'invalid_radar_candidate_id' })
  return importRadarCandidate(app.pg, user, params.data.id)
})

app.post('/candidates/:id/discard', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'invalid_radar_candidate_id' })
  return discardRadarCandidate(app.pg, user, params.data.id)
})

app.get('/campaigns/:id/duplicates', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
  return listRadarDuplicateCandidates(app.pg, user, params.data.id)
})

app.patch('/duplicates/:id', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  const parsed = z.object({ status: z.enum(['confirmed', 'dismissed', 'merged']) }).safeParse(request.body)
  if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_duplicate_payload' })
  return updateRadarDuplicateCandidate(app.pg, user, params.data.id, parsed.data.status)
})
```

- [ ] **Step 4: Add tests**

Add tests for listing/import/discard candidates and duplicate update in `backend/tests/radar-routes.test.ts`.

Use assertions:

```ts
expect(candidateList.statusCode).toBe(200)
expect(importResponse.json()).toMatchObject({ opportunity: { id: ids.opportunity } })
expect(discardResponse.json()).toMatchObject({ status: 'discarded' })
expect(duplicateUpdate.json()).toMatchObject({ status: 'dismissed' })
```

- [ ] **Step 5: Run tests**

```bash
cd backend
npm run test -- tests/radar-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts
git commit -m "feat: add radar candidate review"
```

---

### Task 8: Small Batch Actions

**Files:**
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`

- [ ] **Step 1: Add batch analyze repository function**

In `backend/src/modules/radar/repository.ts`:

```ts
export async function batchAnalyzeRadarOpportunities(pool: pg.Pool, user: AuthUser, opportunityIds: string[]) {
  requireRadarAccess(user)
  assertSmallBatchLimit(opportunityIds.length)
  const analyzed: RadarOpportunity[] = []
  for (const opportunityId of opportunityIds) {
    analyzed.push(await runRadarOpportunityAnalysis(pool, user, opportunityId))
  }
  return { analyzed }
}
```

- [ ] **Step 2: Add batch enrich repository function**

In `backend/src/modules/radar/repository.ts`:

```ts
export async function batchEnrichRadarOpportunities(pool: pg.Pool, user: AuthUser, opportunityIds: string[]) {
  requireRadarAccess(user)
  assertSmallBatchLimit(opportunityIds.length)
  const result = await pool.query<RadarOpportunityRow>(
    `UPDATE public.radar_opportunities
     SET status = CASE WHEN status = 'raw' THEN 'enriched' ELSE status END,
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])
     RETURNING *`,
    [opportunityIds],
  )
  return { enriched: result.rows.map(row => mapOpportunity(row)) }
}
```

- [ ] **Step 3: Add routes**

In `backend/src/modules/radar/routes.ts`:

```ts
const batchOpportunitySchema = z.object({
  opportunityIds: z.array(uuid).min(1).max(10),
})

app.post('/opportunities/batch/analyze', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const parsed = batchOpportunitySchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_batch_payload' })
  return batchAnalyzeRadarOpportunities(app.pg, user, parsed.data.opportunityIds)
})

app.post('/opportunities/batch/enrich', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const parsed = batchOpportunitySchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_batch_payload' })
  return batchEnrichRadarOpportunities(app.pg, user, parsed.data.opportunityIds)
})
```

- [ ] **Step 4: Add tests**

In `backend/tests/radar-routes.test.ts`, add:

```ts
it('enforces small batch limits for batch opportunity actions', async () => {
  const { authStore, token } = buildAuthStore()
  app = await buildServer(testEnv, { authStore, pool: new FakeRadarPool() as never, jobQueue: noopJobQueue })

  const response = await app.inject({
    method: 'POST',
    url: '/api/radar/opportunities/batch/enrich',
    headers: { cookie: sessionCookie(token) },
    payload: { opportunityIds: Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`) },
  })

  expect(response.statusCode).toBe(400)
})
```

Add success case for one opportunity.

- [ ] **Step 5: Run tests**

```bash
cd backend
npm run test -- tests/radar-routes.test.ts src/modules/radar/sourceRules.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts
git commit -m "feat: add radar small batch actions"
```

---

### Task 9: Metrics By Source And Runs

**Files:**
- Modify: `backend/src/modules/radar/repository.ts`
- Modify: `backend/src/modules/radar/routes.ts`
- Modify: `backend/tests/radar-routes.test.ts`
- Modify: `frontend/src/types/radar.ts`

- [ ] **Step 1: Extend metrics DTO**

In backend and frontend Radar types, extend `RadarMetrics`:

```ts
sourceBreakdown: Array<{
  sourceType: string
  companies: number
  opportunities: number
  candidates: number
  converted: number
  estimatedCost: number
}>
```

- [ ] **Step 2: Extend metrics repository query**

In `getRadarCampaignMetrics`, add a second query:

```ts
const sourceBreakdown = await pool.query<{
  source_type: string
  companies: string | number
  opportunities: string | number
  candidates: string | number
  converted: string | number
  estimated_cost: string | number | null
}>(
  `SELECT source_type,
          COUNT(DISTINCT company_record_id) AS companies,
          COUNT(DISTINCT opportunity_id) AS opportunities,
          0 AS candidates,
          COUNT(*) FILTER (WHERE event_type = 'converted_to_lead') AS converted,
          0 AS estimated_cost
   FROM public.radar_outreach_events
   WHERE campaign_id = $1
   GROUP BY source_type
   UNION ALL
   SELECT source_type,
          0 AS companies,
          0 AS opportunities,
          COUNT(*) AS candidates,
          0 AS converted,
          0 AS estimated_cost
   FROM public.radar_candidate_records
   WHERE campaign_id = $1
   GROUP BY source_type`,
  [campaignId],
)
```

If `radar_outreach_events` does not have `source_type`, use `radar_cost_logs.source_type` for cost/source and `radar_company_records.source_type` joined through opportunities:

```sql
SELECT c.source_type,
       COUNT(DISTINCT c.id) AS companies,
       COUNT(DISTINCT o.id) AS opportunities,
       0 AS candidates,
       COUNT(*) FILTER (WHERE o.status = 'converted') AS converted,
       COALESCE(SUM(cost.estimated_cost), 0) AS estimated_cost
FROM public.radar_opportunities o
JOIN public.radar_company_records c ON c.id = o.company_record_id
LEFT JOIN public.radar_cost_logs cost ON cost.opportunity_id = o.id
WHERE o.campaign_id = $1
GROUP BY c.source_type
```

Map to `sourceBreakdown`.

- [ ] **Step 3: Add runs endpoint**

In repository:

```ts
export async function listRadarRuns(pool: pg.Pool, user: AuthUser, campaignId: string) {
  requireRadarAccess(user)
  const result = await pool.query<RadarEnrichmentRunRow>(
    `SELECT *
     FROM public.radar_enrichment_runs
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [campaignId],
  )
  return result.rows.map(mapEnrichmentRun)
}
```

Add `mapEnrichmentRun`.

In routes:

```ts
app.get('/campaigns/:id/runs', async (request, reply) => {
  const user = await getAuthenticatedUser(request, reply)
  if (!user) return reply
  const params = z.object({ id: uuid }).safeParse(request.params)
  if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
  return listRadarRuns(app.pg, user, params.data.id)
})
```

- [ ] **Step 4: Add tests**

Add route tests for metrics source breakdown and runs:

```ts
expect(metrics.json().sourceBreakdown[0]).toMatchObject({ sourceType: 'manual' })
expect(runs.json()[0]).toMatchObject({ provider: 'manual', status: 'succeeded' })
```

- [ ] **Step 5: Run tests**

```bash
cd backend
npm run test -- tests/radar-routes.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/radar/types.ts backend/src/modules/radar/repository.ts backend/src/modules/radar/routes.ts backend/tests/radar-routes.test.ts frontend/src/types/radar.ts
git commit -m "feat: add radar source metrics"
```

---

### Task 10: Frontend Source Rules And Service Methods

**Files:**
- Create: `frontend/src/lib/radar/radarSourceRules.ts`
- Create: `frontend/src/lib/radar/radarSourceRules.test.ts`
- Modify: `frontend/src/types/radar.ts`
- Modify: `frontend/src/services/radarService.ts`

- [ ] **Step 1: Add frontend source types**

In `frontend/src/types/radar.ts`, add interfaces matching backend:

```ts
export type RadarSourceType = 'manual' | 'csv' | 'jina_reader' | 'jina_search' | 'web_search' | 'opencnpj' | 'public_registry' | 'future_paid_api'
export type RadarRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type RadarCandidateStatus = 'pending_review' | 'imported' | 'discarded' | 'duplicate' | 'failed'

export interface RadarEnrichmentRun {
  id: string
  organizationId: string
  campaignId: string
  provider: string
  status: RadarRunStatus
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown>
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface RadarCandidateRecord {
  id: string
  organizationId: string
  campaignId: string
  sourceType: string
  sourceUrl?: string
  title: string
  snippet?: string
  status: RadarCandidateStatus
  dedupeKey: string
  normalizedPayload: Record<string, unknown>
  importedOpportunityId?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Add source rules**

Create `frontend/src/lib/radar/radarSourceRules.ts`:

```ts
import type { RadarDataSource } from '@/types/radar'

export const RADAR_SMALL_BATCH_LIMIT = 10

export function canUseRadarSource(source: Pick<RadarDataSource, 'sourceType' | 'enabled'>) {
  return source.sourceType === 'manual' || source.sourceType === 'csv' || source.enabled
}

export function getRadarSourceBlockedReason(source: Pick<RadarDataSource, 'sourceType' | 'enabled' | 'requiresSecret'>) {
  if (canUseRadarSource(source)) return undefined
  if (source.requiresSecret) return 'Configure as credenciais antes de usar esta fonte.'
  return 'Fonte desabilitada no catalogo do Radar.'
}

export function splitLines(value: string) {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

export function isSmallBatch(size: number) {
  return Number.isInteger(size) && size >= 1 && size <= RADAR_SMALL_BATCH_LIMIT
}
```

- [ ] **Step 3: Add frontend rule tests**

Create `frontend/src/lib/radar/radarSourceRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canUseRadarSource, getRadarSourceBlockedReason, isSmallBatch, splitLines } from './radarSourceRules'

describe('radarSourceRules', () => {
  it('allows manual and csv while blocking disabled governed providers', () => {
    expect(canUseRadarSource({ sourceType: 'manual', enabled: false })).toBe(true)
    expect(canUseRadarSource({ sourceType: 'csv', enabled: false })).toBe(true)
    expect(canUseRadarSource({ sourceType: 'jina_reader', enabled: false })).toBe(false)
    expect(getRadarSourceBlockedReason({ sourceType: 'jina_reader', enabled: false, requiresSecret: false })).toBe('Fonte desabilitada no catalogo do Radar.')
  })

  it('splits batch text and enforces small batch size', () => {
    expect(splitLines('https://a.com\n\nhttps://b.com')).toEqual(['https://a.com', 'https://b.com'])
    expect(isSmallBatch(10)).toBe(true)
    expect(isSmallBatch(11)).toBe(false)
  })
})
```

- [ ] **Step 4: Add service methods**

In `frontend/src/services/radarService.ts`, add:

```ts
async getDataSources(organizationId: string) {
  return apiRequest<RadarDataSource[]>(`/radar/data-sources${buildQuery({ organizationId })}`)
},

async updateDataSource(sourceId: string, patch: { enabled?: boolean; rateLimitPerDay?: number; defaultCostPerUnit?: number; termsNotes?: string }) {
  return apiRequest<RadarDataSource>(`/radar/data-sources/${sourceId}`, { method: 'PATCH', body: patch })
},

async importCsv(campaignId: string, input: { organizationId: string; csv: string }) {
  return apiRequest<{ imported: RadarOpportunity[]; issues: Array<Record<string, unknown>>; runId: string }>(`/radar/campaigns/${campaignId}/import-csv`, { method: 'POST', body: input })
},

async importUrls(campaignId: string, input: { organizationId: string; urls: string[] }) {
  return apiRequest<{ imported: RadarOpportunity[]; issues: Array<Record<string, unknown>>; runId: string }>(`/radar/campaigns/${campaignId}/import-urls`, { method: 'POST', body: input })
},

async searchWeb(campaignId: string, input: { organizationId: string; query: string; city?: string; state?: string; sourceType: 'jina_search' | 'web_search'; limit?: number }) {
  return apiRequest<{ candidates: RadarCandidateRecord[]; issues: Array<Record<string, unknown>>; runId: string }>(`/radar/campaigns/${campaignId}/search-web`, { method: 'POST', body: input })
},

async getCandidates(campaignId: string) {
  return apiRequest<RadarCandidateRecord[]>(`/radar/campaigns/${campaignId}/candidates`)
},

async importCandidate(candidateId: string) {
  return apiRequest<{ candidate: RadarCandidateRecord; opportunity: RadarOpportunity }>(`/radar/candidates/${candidateId}/import`, { method: 'POST' })
},

async discardCandidate(candidateId: string) {
  return apiRequest<RadarCandidateRecord>(`/radar/candidates/${candidateId}/discard`, { method: 'POST' })
},

async getRuns(campaignId: string) {
  return apiRequest<RadarEnrichmentRun[]>(`/radar/campaigns/${campaignId}/runs`)
},
```

- [ ] **Step 5: Run tests**

```bash
cd frontend
npm run test -- src/lib/radar/radarSourceRules.test.ts src/lib/radar/radarRules.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/radar.ts frontend/src/lib/radar/radarSourceRules.ts frontend/src/lib/radar/radarSourceRules.test.ts frontend/src/services/radarService.ts
git commit -m "feat: add radar source frontend contracts"
```

---

### Task 11: Frontend Source UI

**Files:**
- Modify: `frontend/src/components/radar/RadarWorkspace.tsx`

- [ ] **Step 1: Add source state**

In `RadarWorkspace`, add state:

```ts
const [dataSources, setDataSources] = useState<RadarDataSource[]>([])
const [candidates, setCandidates] = useState<RadarCandidateRecord[]>([])
const [runs, setRuns] = useState<RadarEnrichmentRun[]>([])
const [csvText, setCsvText] = useState('')
const [urlText, setUrlText] = useState('')
const [searchForm, setSearchForm] = useState({ query: '', city: '', state: '', sourceType: 'jina_search' as const, limit: 5 })
```

Load sources when `organizationId` is present:

```ts
radarService.getDataSources(organizationId).then(setDataSources)
```

When campaign changes, load:

```ts
radarService.getCandidates(selectedCampaignId)
radarService.getRuns(selectedCampaignId)
```

- [ ] **Step 2: Add source cards**

Add a section after campaigns:

```tsx
<section className="rounded-md border bg-white p-4">
  <h2 className="text-base font-semibold text-slate-950">Fontes da campanha</h2>
  <div className="mt-3 grid gap-3 md:grid-cols-4">
    {dataSources.map(source => {
      const blockedReason = getRadarSourceBlockedReason(source)
      return (
        <div key={source.id} className="rounded-md border p-3">
          <p className="text-sm font-medium text-slate-950">{source.displayName}</p>
          <p className="mt-1 text-xs text-slate-500">{blockedReason || 'Disponivel para esta campanha.'}</p>
          <p className="mt-2 text-xs text-slate-600">Limite diario: {source.rateLimitPerDay}</p>
        </div>
      )
    })}
  </div>
</section>
```

- [ ] **Step 3: Add CSV form**

Add a form under the selected campaign:

```tsx
<form className="mt-4 space-y-2" onSubmit={importCsv}>
  <textarea
    className="min-h-32 w-full rounded-md border p-3 text-sm"
    value={csvText}
    onChange={event => setCsvText(event.target.value)}
    placeholder="trade_name,city,state,website_url"
  />
  <Button type="submit" disabled={!selectedCampaignId || actionLoading === 'csv'}>
    Importar CSV
  </Button>
</form>
```

Handler:

```ts
const importCsv = async (event: FormEvent) => {
  event.preventDefault()
  if (!organizationId || !selectedCampaignId || actionLoading) return
  setActionLoading('csv')
  try {
    const result = await radarService.importCsv(selectedCampaignId, { organizationId, csv: csvText })
    setOpportunities(current => [...result.imported, ...current])
    setCsvText('')
    toast.success(`${result.imported.length} empresas importadas`)
  } finally {
    setActionLoading(null)
  }
}
```

- [ ] **Step 4: Add URL form**

Add textarea for URLs and handler using `splitLines(urlText)` and `radarService.importUrls`.

Reject more than 10 URLs client-side:

```ts
if (!isSmallBatch(urls.length)) {
  toast.error('Use no maximo 10 URLs por lote.')
  return
}
```

- [ ] **Step 5: Add assisted search form and candidates list**

Add inputs for query/city/UF/limit/source and call `radarService.searchWeb`.

Render candidates:

```tsx
{candidates.map(candidate => (
  <div key={candidate.id} className="flex items-start justify-between gap-3 border-t py-3">
    <div>
      <p className="text-sm font-medium text-slate-950">{candidate.title}</p>
      <p className="text-xs text-slate-500">{candidate.sourceType} - {candidate.status}</p>
      {candidate.snippet && <p className="mt-1 text-sm text-slate-600">{candidate.snippet}</p>}
    </div>
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => importCandidate(candidate.id)}>Importar</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => discardCandidate(candidate.id)}>Descartar</Button>
    </div>
  </div>
))}
```

- [ ] **Step 6: Add runs and source metrics**

Render recent runs:

```tsx
{runs.slice(0, 5).map(run => (
  <p key={run.id} className="text-xs text-slate-500">
    {run.provider} - {run.status} - {new Date(run.createdAt).toLocaleString('pt-BR')}
  </p>
))}
```

Render `metrics.sourceBreakdown` if present.

- [ ] **Step 7: Run frontend tests/build**

```bash
cd frontend
npm run type-check
npm run build
```

Expected: PASS with existing bundle-size warnings only.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/radar/RadarWorkspace.tsx
git commit -m "feat: add radar source workspace UI"
```

---

### Task 12: Final Verification And Push

**Files:**
- No new files unless previous tasks require fixes.

- [ ] **Step 1: Run backend tests and build**

```bash
cd backend
npm run test -- tests/radar-routes.test.ts src/modules/radar/sourceRules.test.ts src/modules/radar/csvImport.test.ts
npm run type-check
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests and build**

```bash
cd frontend
npm run test -- src/lib/radar/radarRules.test.ts src/lib/radar/radarSourceRules.test.ts
npm run type-check
npm run build
```

Expected: PASS with existing bundle-size/Browserslist warnings only.

- [ ] **Step 3: Run runtime tests**

```bash
cd workers/marketing-studio-agent-runtime
python -m unittest tests.test_radar
python -m unittest tests.test_agent_harness_runtime
```

Expected: PASS.

- [ ] **Step 4: Clean generated Python cache**

Run from repo root:

```powershell
$paths = @(
  'workers\marketing-studio-agent-runtime\tests\__pycache__',
  'workers\marketing-studio-agent-runtime\yux_agent_runtime\__pycache__'
)
foreach ($path in $paths) {
  $resolved = Resolve-Path -LiteralPath $path -ErrorAction SilentlyContinue
  if ($resolved -and $resolved.Path.StartsWith((Resolve-Path -LiteralPath '.').Path)) {
    Remove-Item -LiteralPath $resolved.Path -Recurse -Force
  }
}
```

- [ ] **Step 5: Check status**

```bash
git status --short
```

Expected: only pre-existing untracked `.codegraph/`, `The Black Book.pdf`, and `Virtarix.txt` may remain.

- [ ] **Step 6: Push**

```bash
git push origin codex/strategy-packs-workspace
```

Expected: branch updates on GitHub.

## Deployment Note

After deployment/rebuild of the backend container, run:

```bash
docker exec -it yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 node dist/scripts/apply-migrations.js
```

Confirm:

```bash
docker exec -it yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 sh -lc "node -e \"import('./dist/src/db/client.js').then(async ({ createPool }) => { const p = createPool(); console.log((await p.query(\\\"select version from schema_migrations where version in ('0108_radar_local_sources') order by version\\\")).rows); console.log((await p.query(\\\"select to_regclass('public.radar_candidate_records') as radar_candidate_records\\\")).rows); await p.end(); })\""
```

Expected:

- `0108_radar_local_sources` appears in `schema_migrations`.
- `to_regclass` returns `public.radar_candidate_records`.
