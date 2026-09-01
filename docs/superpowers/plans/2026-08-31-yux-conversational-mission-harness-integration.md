# YUX Conversational Mission + Existing Harness Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current form-first Mission intake with a durable conversation that uses the existing YUX Agent Harness for strategy and customer knowledge, then hands an explicit brief and frozen context to the existing Action Engine planner, approval flow and executor.

**Architecture:** Keep one Harness and one execution authority. Extend the existing `StrategyWorkflowEngine` with a typed Mission-intake workflow that reuses `StrategyRetrievalService`, `CustomerContextService`, global prompts, model routing, policies and traces. Persist conversation state in the Action Engine, where authoritative entitlements/live state are assembled and Harness-selected source references are verified before an immutable Mission context snapshot is created. Create the Action Mission only after the user confirms the brief, and reuse the current Mission Supervisor, compiler, approvals, Action Packs and executor.

**Tech Stack:** Python 3/FastAPI/Pydantic Harness, TypeScript/Fastify/PostgreSQL/BullMQ Action Engine, React/Vite frontend, Vitest/Testing Library/pytest, JSON Schema code generation.

**Spec:** `docs/superpowers/specs/2026-08-31-yux-conversational-mission-harness-integration-design.md`

## Global Constraints

- Do not create a new Harness, RAG store, planner, knowledge-ingestion pipeline or mutation-capable LLM agent.
- `CustomerContextService` and `StrategyRetrievalService` are the only knowledge selectors for Mission conversations.
- TypeScript may verify source publication, tenant, visibility and hashes, but must not independently rerank Harness-selected knowledge.
- Pydantic remains the Mission wire-contract source of truth; generated TypeScript and JSON Schema drift fail CI.
- The Harness proposes; the Action Engine authorizes, compiles, approves and executes.
- Existing Action Packs, compiler, approvals, Mission economics, resource claims, mutation leases and provider reconciliation remain authoritative.
- The user sees natural-language impact first; hashes live under technical proof.
- Every new write is tenant-scoped, idempotent where retried and covered by optimistic concurrency.
- Preserve existing Missions and the legacy intake endpoint until staged rollout is complete.
- Use additive migrations only. The next migration number is `0148`.
- Use `apply_patch` for edits and preserve unrelated untracked files.

---

## Task 1: Correct the current Mission feedback and workspace permission

**Files:**

- Modify: `frontend/src/pages/client-portal/PortalMissionDetailPage.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetailWorkspace.tsx`
- Modify: `frontend/src/lib/action-engine/missionRules.ts`
- Add: `frontend/src/pages/client-portal/PortalMissionDetailPage.test.tsx`
- Add: `frontend/src/components/action-engine/MissionDetail.test.tsx`

- [ ] **Step 1: Write the failing workspace-permission test**

Create `PortalMissionDetailPage.test.tsx` with an authenticated YUX admin viewing a client workspace whose local role is read-only. Assert that `MissionDetailWorkspace` receives `canWrite=true`. Mock only organization/workspace hooks and the detail component.

Run:

```powershell
cd frontend
npm test -- src/pages/client-portal/PortalMissionDetailPage.test.tsx
```

Expected: FAIL because the page calls `canManageMissions(role)` instead of `canManageMissionsInWorkspace(authenticatedRole, role)`.

- [ ] **Step 2: Fix workspace-aware detail permission**

Import both authenticated platform role and workspace role in `PortalMissionDetailPage.tsx`, then pass:

```ts
canWrite={canManageMissionsInWorkspace(authenticatedRole, role)}
```

Run the test again. Expected: PASS.

- [ ] **Step 3: Write failing owner-first empty-state tests**

In `MissionDetail.test.tsx`, cover a draft Mission without a plan and assert:

- it displays “Pedido recebido” and a plain next action;
- it does not display `supervisor_interpreted_outcome`;
- it does not render empty observed-results/economics/execution panels;
- an eligible user receives a single “Continuar pedido” action.

Expected: FAIL against the current cockpit.

- [ ] **Step 4: Implement the legacy-draft presentation**

Add user-facing outcome labels to `missionRules.ts`. In `MissionDetail.tsx`, derive a pre-plan state and render a compact status card. Gate artifact, metric, guardrail, execution and economics panels on actual plan/run data. Keep technical evidence available for existing planned Missions.

`MissionDetailWorkspace.tsx` should map “Continuar pedido” to the existing qualification/plan command only for the compatibility path. This button will later open the new conversation when Task 7 lands.

- [ ] **Step 5: Verify and commit**

```powershell
cd frontend
npm test -- src/pages/client-portal/PortalMissionDetailPage.test.tsx src/components/action-engine/MissionDetail.test.tsx
npm run type-check
git add src/pages/client-portal/PortalMissionDetailPage.tsx src/pages/client-portal/PortalMissionDetailPage.test.tsx src/components/action-engine/MissionDetail.tsx src/components/action-engine/MissionDetailWorkspace.tsx src/components/action-engine/MissionDetail.test.tsx src/lib/action-engine/missionRules.ts
git commit -m "fix: clarify pre-plan mission experience"
```

---

## Task 2: Extend the shared Mission wire contract for conversational turns

**Files:**

- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_contracts.py`
- Modify: `workers/marketing-studio-agent-runtime/scripts/export_mission_contracts.py`
- Modify: `contracts/mission-supervisor/v1/mission-wire.schema.json`
- Modify: `backend/scripts/generate-mission-wire-types.ts`
- Modify: `backend/src/modules/action-engine/generated/mission-wire.ts`
- Modify: `backend/src/modules/action-engine/mission-wire-validator.ts`
- Test: `workers/marketing-studio-agent-runtime/tests/test_mission_conversation_contract.py`
- Test: `backend/tests/mission-wire-contract.test.ts`

- [ ] **Step 1: Add failing Pydantic contract tests**

Define fixtures for a valid `MissionConversationTurnResponseWire` and invalid cases:

- more than three questions;
- duplicate question keys;
- unknown source-ref namespace;
- `ready_for_plan` with unresolved required missing items;
- a suggested capability outside `allowedCapabilityKeys`;
- raw hidden reasoning fields rejected through `extra="forbid"`.

Expected shape:

```py
class MissionConversationTurnResponseWire(StrictWireModel):
    schemaVersion: Literal[1]
    kind: Literal["message", "questions", "brief_confirmation", "blocked"]
    reply: str
    understood: dict[str, Any]
    questions: list[MissionConversationQuestionWire] = Field(default_factory=list, max_length=3)
    readiness: MissionContextReadinessWire
    brief: MissionBriefWire
    suggestedActions: list[MissionSuggestedActionWire] = Field(default_factory=list, max_length=8)
    sources: list[MissionSourceRefWire] = Field(default_factory=list, max_length=100)
    retrievalTraceId: str
    contextHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    usage: ModelUsageWire
```

Run:

```powershell
cd workers/marketing-studio-agent-runtime
python -m pytest tests/test_mission_conversation_contract.py -q
```

Expected: FAIL because the models do not exist.

- [ ] **Step 2: Implement Pydantic models and cross-field validation**

Add request/response, source-ref, readiness, brief, question and suggested-action models to `mission_contracts.py`. Use aliases consistent with the existing camelCase response wire. Enforce:

- namespaced refs `yux:`, `customer:` or `memory:`;
- at most three unique questions;
- no questions for `brief_confirmation`;
- no required missing item for `ready_for_plan`;
- source refs cited in known facts must exist in `sources`;
- structural fields remain `extra="forbid"`; a separate `validate_mission_conversation_response(response, request)` check rejects suggested capabilities outside the request envelope.

- [ ] **Step 3: Export schema and prove deterministic generation**

Update the schema exporter to include the new definitions in the existing `mission-wire.schema.json`. Generate twice and assert no second diff:

```powershell
cd workers/marketing-studio-agent-runtime
python scripts/export_mission_contracts.py
cd ../../backend
npm run generate:mission-contracts
$firstSchemaHash = (Get-FileHash ../contracts/mission-supervisor/v1/mission-wire.schema.json).Hash
$firstTypesHash = (Get-FileHash src/modules/action-engine/generated/mission-wire.ts).Hash
npm run generate:mission-contracts
if ((Get-FileHash ../contracts/mission-supervisor/v1/mission-wire.schema.json).Hash -ne $firstSchemaHash) { throw 'schema generation is not deterministic' }
if ((Get-FileHash src/modules/action-engine/generated/mission-wire.ts).Hash -ne $firstTypesHash) { throw 'type generation is not deterministic' }
```

The final command should be run after a second generation. Expected: no diff on the second run.

- [ ] **Step 4: Add TypeScript runtime validation tests**

Extend `mission-wire-validator.ts` with `validateMissionConversationTurnResponseWire`. Add the same valid and invalid fixtures to `mission-wire-contract.test.ts`, including `additionalProperties` rejection.

```powershell
cd backend
npm test -- tests/mission-wire-contract.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit the contract boundary**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_contracts.py workers/marketing-studio-agent-runtime/scripts/export_mission_contracts.py workers/marketing-studio-agent-runtime/tests/test_mission_conversation_contract.py contracts/mission-supervisor/v1/mission-wire.schema.json backend/scripts/generate-mission-wire-types.ts backend/src/modules/action-engine/generated/mission-wire.ts backend/src/modules/action-engine/mission-wire-validator.ts backend/tests/mission-wire-contract.test.ts
git commit -m "feat: define mission conversation wire contract"
```

---

## Task 3: Make the existing Harness the Mission knowledge-context owner

**Files:**

- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_factory.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/retrieval.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/customer_context.py`
- Add: `workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_conversation.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_mission_conversation.py`
- Test: `workers/marketing-studio-agent-runtime/tests/test_customer_context.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_retrieval.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_agent_harness_runtime.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_api_credits.py`

- [ ] **Step 1: Write failing retrieval-reuse tests**

Add a test that constructs the production `StrategyWorkflowEngine`, invokes a Mission conversation turn and asserts that the same run contains:

- approved YUX concept card/chunk IDs;
- the correct tenant company profile;
- contract-scoped active brand rules;
- active product/service fields: `target_audience`, `proof_points`, `objections`, `cta`;
- approved curated customer chunks;
- one retrieval trace ID and deterministic context hash.

Add negative cases for draft customer content, blocked agent profile, cross-tenant content and internal-only customer content in a client-visible turn.

Test both server-derived audiences. An `internal_operator` may receive named internal evidence according to policy. A `client_user` may be guided by permitted internal YUX doctrine but receives only the generic “Metodologia YUX” display projection and never raw internal content.

Expected: FAIL because no typed Mission conversation workflow exists and product summaries omit fields.

- [ ] **Step 2: Enrich existing `CustomerContextService` output**

Do not add a second customer retriever. Extend `_product_summary` into a safe structured product projection containing the existing table fields. Keep compatibility by retaining a concise display summary if current workflows depend on strings.

Add explicit context coverage keys:

```py
{
  "company": bool(company),
  "brand": bool(brand),
  "products": len(products),
  "customerKnowledge": len(context_items),
}
```

Do not infer consent, budget, provider connection or contract entitlement here.

- [ ] **Step 3: Activate Strategy embeddings through the existing retrieval service**

Extend `RuntimeStrategyKnowledgeStore` to join the latest matching rows from `yux_strategy_card_embeddings` and `yux_strategy_chunk_embeddings` into `embedding_values`. Pass one `QueryEmbeddingService` result into `retrieve_strategy_context()` for a turn. If Jina is unavailable, retain keyword ranking and record `embedding_status="unavailable"`; do not fail the conversation.

Tests must prove semantic ranking when embeddings exist and deterministic keyword fallback when they do not.

- [ ] **Step 4: Implement a thin Mission conversation adapter, not a new Harness**

Create `mission_conversation.py` with `MissionConversationWorkflow`. It must receive an already-built `StrategyWorkflowEngine` and call its existing retrieval, prompt, model, policy and trace machinery. Add a server-owned `mission_intake_conversation` output contract branch in `workflow.py`; do not accept arbitrary prompt instructions from the Action Engine.

The adapter responsibilities are only:

- compile bounded recent transcript + rolling summary + current brief into the user input;
- honor the server-derived `internal_operator|client_user` audience without allowing the model to change it;
- merge authoritative operational context as untrusted data;
- ask the existing Harness to produce the typed response;
- Pydantic-validate the response;
- normalize namespaced source refs and usage.

It must not plan a DAG, write Action Engine rows or call tools.

- [ ] **Step 5: Add the authenticated Harness endpoint**

Add `POST /missions/conversations/turn` in `api.py`. It must:

- call `validate_tenant()`;
- reserve credits server-side under `agent_runtime_mission_conversation_turn` when client/contract are present;
- invoke the lazily built existing workflow engine;
- return `422` for typed contract failure, `402` for insufficient credits and `503` for provider unavailability;
- return no raw provider payload.

- [ ] **Step 6: Verify Harness tests**

```powershell
cd workers/marketing-studio-agent-runtime
python -m pytest tests/test_customer_context.py tests/test_retrieval.py tests/test_mission_conversation.py tests/test_agent_harness_runtime.py tests/test_api_credits.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Harness integration**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_factory.py workers/marketing-studio-agent-runtime/yux_agent_runtime/workflow.py workers/marketing-studio-agent-runtime/yux_agent_runtime/retrieval.py workers/marketing-studio-agent-runtime/yux_agent_runtime/customer_context.py workers/marketing-studio-agent-runtime/yux_agent_runtime/mission_conversation.py workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py workers/marketing-studio-agent-runtime/tests
git commit -m "feat: connect mission intake to existing harness knowledge"
```

---

## Task 4: Persist durable Mission conversations and append-only messages

**Files:**

- Add: `backend/src/db/migrations/0148_mission_conversations.sql`
- Add: `backend/src/modules/action-engine/mission-conversations.ts`
- Modify: `backend/src/modules/action-engine/types.ts`
- Test: `backend/tests/mission-conversations-schema.test.ts`
- Test: `backend/tests/mission-conversations-repository.test.ts`

- [ ] **Step 1: Write failing migration contract tests**

Assert migration `0148` creates both tables, organization-scoped indexes, RLS policies, uniqueness on message sequence/client message ID and an append-only trigger for messages. Assert conversation states exactly match the spec.

```powershell
cd backend
npm test -- tests/mission-conversations-schema.test.ts
```

Expected: FAIL because migration `0148` does not exist.

- [ ] **Step 2: Add the additive migration**

Create `action_mission_conversations` and `action_mission_conversation_messages` as specified. Add:

- foreign keys to organization, contract, optional Mission and user;
- `version INTEGER NOT NULL DEFAULT 1`;
- JSON object checks for brief/readiness/payload;
- message source refs as JSON array;
- timestamps and `updated_at` trigger;
- append-only trigger that rejects update/delete on messages;
- RLS using `private.rls_can_access_organization(organization_id)`;
- no cascade from Mission to conversation.

- [ ] **Step 3: Write repository tests with a fake Queryable**

Cover:

- `createMissionConversation()` appends the first user message atomically;
- retry with the same idempotency key returns the same conversation;
- `appendUserConversationMessage()` enforces `expectedVersion` and `clientMessageId`;
- stale versions return `mission_conversation_version_conflict`;
- `completeAgentConversationTurn()` appends the agent response and changes state in one transaction;
- `attachMissionToConversation()` is idempotent and rejects a different Mission;
- every query includes organization scope.

- [ ] **Step 4: Implement repository and domain types**

Add explicit types:

```ts
export type MissionConversationStatus =
  | 'collecting_context' | 'awaiting_user' | 'brief_confirmation'
  | 'planning' | 'awaiting_plan_approval' | 'converted' | 'blocked' | 'cancelled'

export type MissionConversation = {
  id: string
  organizationId: string
  contractId?: string
  missionId?: string
  status: MissionConversationStatus
  title: string
  currentBrief: Record<string, unknown>
  contextReadiness: Record<string, unknown>
  version: number
  messages: MissionConversationMessage[]
}
```

Keep transaction ownership in callers consistent with `repository.ts` conventions.

- [ ] **Step 5: Verify and commit**

```powershell
cd backend
npm test -- tests/mission-conversations-schema.test.ts tests/mission-conversations-repository.test.ts
npm run type-check
git add src/db/migrations/0148_mission_conversations.sql src/modules/action-engine/mission-conversations.ts src/modules/action-engine/types.ts tests/mission-conversations-schema.test.ts tests/mission-conversations-repository.test.ts
git commit -m "feat: persist durable mission conversations"
```

---

## Task 5: Split authoritative operational context from Harness-owned knowledge context

**Files:**

- Modify: `backend/src/modules/action-engine/context-builder.ts`
- Add: `backend/src/modules/action-engine/mission-source-verifier.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `backend/src/modules/action-engine/types.ts`
- Test: `backend/tests/action-engine-context.test.ts`
- Add: `backend/tests/mission-source-verifier.test.ts`

- [ ] **Step 1: Replace current context tests with the intended boundary**

Write failing tests that require:

- `buildMissionOperationalContext()` returns modules, provider health, live state and capability manifest but performs no knowledge or YUX strategy selection query;
- `verifyMissionKnowledgeContext()` accepts only Harness-selected refs that still match tenant, publication/approval, profile visibility and content hash;
- strategy refs and customer refs share one namespaced allowed-source list;
- blocker correction links are mapped from a server-owned allowlist by validated category/key, never accepted as arbitrary model URLs;
- a changed, unpublished, foreign-tenant or blocked source fails verification;
- the final immutable hash includes verified knowledge + authoritative operational state.

Expected: FAIL because `context-builder.ts` currently selects/ranks knowledge itself.

- [ ] **Step 2: Refactor `context-builder.ts`**

Rename the current entry point to `buildMissionOperationalContext`. Retain:

- contract entitlement normalization;
- live baseline collection;
- capability manifest/catalog hash;
- approved Mission memory lookup only if memory remains Action Engine-owned.

Remove company, brand, product, customer knowledge and YUX strategy selection from this module.

- [ ] **Step 3: Implement source verification without reranking**

`mission-source-verifier.ts` receives exact Harness source refs and verifies them in bounded queries by IDs. It returns canonical, stable-sorted records with database-derived hashes. It must never change result order based on relevance or add unrequested sources.

In the same module, map known blocker keys to safe internal/portal route templates after actor/workspace resolution. Strip any Harness-provided URL that is not produced by this mapping.

For strategy items, compute/version from `updated_at` and content hash from the exact fields currently used by the Harness. For customer items, require published/approved state and profile visibility. Use the same `growth_strategist` profile key selected by the conversation contract.

- [ ] **Step 4: Extend context snapshot persistence additively**

Use the existing JSONB fields to store namespaced refs and retrieval metadata. Add `harnessRetrievalTraceId` and `harnessKnowledgeContextHash` to the canonical snapshot payload in `repository.ts`; do not add a migration unless a queryable scalar column is proven necessary.

- [ ] **Step 5: Verify no parallel knowledge selector remains in the Mission path**

```powershell
cd backend
npm test -- tests/action-engine-context.test.ts tests/mission-source-verifier.test.ts
npm run type-check
rg -n "knowledge_publications|yux_strategy_concept_cards" src/modules/action-engine/context-builder.ts
```

Expected: tests pass and the final search returns no matches.

- [ ] **Step 6: Commit context authority cleanup**

```powershell
git add src/modules/action-engine/context-builder.ts src/modules/action-engine/mission-source-verifier.ts src/modules/action-engine/repository.ts src/modules/action-engine/types.ts tests/action-engine-context.test.ts tests/mission-source-verifier.test.ts
git commit -m "refactor: make harness the mission knowledge selector"
```

---

## Task 6: Add asynchronous conversation processing and Action Engine APIs

**Files:**

- Modify: `backend/src/lib/agent-runtime-client.ts`
- Modify: `backend/src/jobs/queue.ts`
- Modify: `backend/src/worker.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Add: `backend/src/modules/action-engine/mission-conversation-schemas.ts`
- Test: `backend/tests/mission-conversation-runtime-client.test.ts`
- Test: `backend/tests/mission-conversation-handler.test.ts`
- Test: `backend/tests/action-engine-routes.test.ts`
- Test: `backend/tests/jobs.test.ts`

- [ ] **Step 1: Add failing runtime-client tests**

Test `invokeMissionConversationTurn()` for:

- correct `/missions/conversations/turn` path and bearer token;
- 60-second timeout;
- runtime validation through Task 2's generated contract;
- redacted provider error detail;
- no retry inside the HTTP client.

- [ ] **Step 2: Implement the typed client method**

Keep generic `invokeAgentRuntime()` intact for other workflows. Add a thin typed wrapper that validates the Harness response before returning it.

- [ ] **Step 3: Add the job name and failing handler tests**

Register `action-engine.processMissionConversation`. Test the handler sequence:

1. claim exact conversation version;
2. load bounded transcript and summary;
3. build authoritative operational context;
4. call Harness;
5. verify returned sources/hashes;
6. append agent message and update brief/readiness atomically;
7. move to `awaiting_user`, `brief_confirmation` or `blocked`;
8. retain accepted user message and set retryable error payload on transient failure;
9. skip stale/replayed jobs.

Also assert only one Harness call occurs for the same `(conversationId, version)`.

- [ ] **Step 4: Implement the handler**

Add `handleActionEngineProcessMissionConversation()`. Use the existing queue conventions and safe error codes. Record:

- latency and model usage;
- Harness run/trace ID;
- context hash;
- source refs;
- estimated AI cost when available.

Do not create a Mission in this handler unless processing an explicit brief-confirmation command.

- [ ] **Step 5: Add route tests**

Cover authenticated tenant-scoped behavior for:

- create conversation returns `202` and queued job ID;
- append message returns `202`;
- get conversation returns ordered messages;
- stale version returns `409`;
- cross-tenant read/write returns `403`/`404` according to existing conventions;
- cancel works only before execution;
- rate limits prevent conversation spam without losing accepted requests.

- [ ] **Step 6: Implement routes and request schemas**

Add the endpoints from the spec. Require `Idempotency-Key` on conversation creation and `clientMessageId` on message append. Keep user text length bounded to 8,000 characters and recent transcript sent to Harness bounded by count and characters.

- [ ] **Step 7: Verify and commit**

```powershell
cd backend
npm test -- tests/mission-conversation-runtime-client.test.ts tests/mission-conversation-handler.test.ts tests/action-engine-routes.test.ts tests/jobs.test.ts
npm run type-check
git add src/lib/agent-runtime-client.ts src/jobs/queue.ts src/worker.ts src/jobs/handlers/action-engine.ts src/modules/action-engine/routes.ts src/modules/action-engine/mission-conversation-schemas.ts tests/mission-conversation-runtime-client.test.ts tests/mission-conversation-handler.test.ts tests/action-engine-routes.test.ts tests/jobs.test.ts
git commit -m "feat: process mission conversations asynchronously"
```

---

## Task 7: Build the conversational Mission intake UI

**Files:**

- Add: `frontend/src/components/action-engine/MissionConversationWorkspace.tsx`
- Add: `frontend/src/components/action-engine/MissionConversationThread.tsx`
- Add: `frontend/src/components/action-engine/MissionConversationComposer.tsx`
- Add: `frontend/src/components/action-engine/MissionContextDrawer.tsx`
- Add: `frontend/src/components/action-engine/MissionBriefCard.tsx`
- Add: `frontend/src/pages/action-engine/MissionConversationPage.tsx`
- Add: `frontend/src/pages/client-portal/PortalMissionConversationPage.tsx`
- Modify: `frontend/src/components/action-engine/MissionsWorkspace.tsx`
- Modify: `frontend/src/components/action-engine/MissionDashboard.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/actionEngineService.ts`
- Modify: `frontend/src/types/actionEngine.ts`
- Add: `frontend/src/components/action-engine/MissionConversationWorkspace.test.tsx`
- Add: `frontend/src/components/action-engine/MissionsWorkspace.test.tsx`

- [ ] **Step 1: Add frontend types and service tests**

Define the conversation, message, source, readiness, brief and suggested-action types from generated/backend contracts. Add service methods:

```ts
createMissionConversation(input)
getMissionConversation(id, organizationId)
appendMissionConversationMessage(id, input)
confirmMissionConversationBrief(id, input)
cancelMissionConversation(id, input)
```

Test URLs, idempotency values and payload version fields.

- [ ] **Step 2: Write failing chat-workspace tests**

Using Testing Library, cover:

- initial user request appears immediately while the job is processing;
- explicit “Consultando estratégia YUX e contexto da empresa…” state;
- agent questions and quick replies;
- missing-info card with correction link;
- context drawer separates “Estratégia YUX” and “Contexto da empresa”;
- composer remains disabled only during the exact accepted turn;
- transient failure offers retry without duplicating the user message;
- polling stops on `awaiting_user`, `brief_confirmation`, `blocked`, `converted` or unmount;
- Enter sends and Shift+Enter adds a line break;
- accessible live-region announces status changes.

- [ ] **Step 3: Implement conversation components**

Use the product's current UI primitives. Do not render raw JSON, internal status enums or hashes in the main thread. Suggested Recipe prompts send natural user messages into the same conversation endpoint; they do not preselect a separate form path.

Use bounded polling with immediate refresh, then 1s/2s/4s up to 5s while processing. Re-fetch on window focus. Do not introduce a second state store unless component state becomes unmanageable.

- [ ] **Step 4: Add routes for internal and client workspaces**

Add:

- `/missions/conversations/:conversationId`
- the appropriate client-workspace/portal equivalent preserving `portalPath()` behavior.

Both routes must use `canManageMissionsInWorkspace` for writes.

- [ ] **Step 5: Replace the primary form entry point**

Change `MissionsWorkspace` so **Conversar com o agente** creates a conversation and navigates to it. Keep `MissionIntake.tsx` behind a temporary internal compatibility flag; do not delete it yet. Display active intake conversations above the Mission portfolio.

- [ ] **Step 6: Verify React quality and commit**

```powershell
cd frontend
npm test -- src/components/action-engine/MissionConversationWorkspace.test.tsx src/components/action-engine/MissionsWorkspace.test.tsx
npm run type-check
npm run lint
git add src/components/action-engine src/pages/action-engine/MissionConversationPage.tsx src/pages/client-portal/PortalMissionConversationPage.tsx src/App.tsx src/services/actionEngineService.ts src/types/actionEngine.ts
git commit -m "feat: add conversational mission intake"
```

---

## Task 8: Confirm the brief, create exactly one Mission and approve the plan in chat

**Files:**

- Modify: `backend/src/modules/action-engine/mission-conversations.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Modify: `backend/src/jobs/handlers/action-engine.ts`
- Modify: `backend/src/modules/action-engine/repository.ts`
- Modify: `frontend/src/components/action-engine/MissionConversationWorkspace.tsx`
- Add: `frontend/src/components/action-engine/MissionConversationPlanCard.tsx`
- Modify: `frontend/src/services/actionEngineService.ts`
- Test: `backend/tests/mission-conversation-conversion.test.ts`
- Test: `backend/tests/mission-conversation-handler.test.ts`
- Test: `frontend/src/components/action-engine/MissionConversationPlanCard.test.tsx`

- [ ] **Step 1: Write failing conversion/idempotency tests**

Cover:

- brief confirmation requires exact `briefHash` and current conversation version;
- deterministic pack selection is restricted to available published packs;
- concurrent confirmation requests create one Mission and attach the same ID;
- Mission goal, parameters, autonomy envelope, budget and deadline come from the confirmed brief, not model-only hidden fields;
- verified Harness knowledge + fresh operational state produce the immutable context snapshot;
- planning queues the existing `action-engine.planMission` job;
- plan completion moves conversation to `awaiting_plan_approval` and appends one plan message;
- plan clarification returns to `awaiting_user` without starting a second intake mechanism.

- [ ] **Step 2: Implement brief confirmation and Mission conversion**

In one transaction:

1. lock conversation by organization and version;
2. validate `briefHash`;
3. resolve pack versions and entitlements deterministically;
4. create the Mission using a conversation-derived idempotency key;
5. attach Mission ID and move to `planning`;
6. record a domain event carrying conversation ID and brief hash.

After commit, queue the existing plan job. Never call planner inside the request transaction.

- [ ] **Step 3: Link planning completion back to the conversation**

Extend `handleActionEnginePlanMission()` so both outcomes update the linked conversation:

- clarification: append typed question message and set `awaiting_user`;
- plan: append a `plan` message containing the existing deterministic decision summary, plan ID, approval ID and subject hash, then set `awaiting_plan_approval`;
- blocked: append safe error/status with correction action.

The conversation update is a projection of Action Engine state. It must not create another approval record.

- [ ] **Step 4: Write and implement the plan card**

Reuse `MissionDecisionSummary` parsing and the existing `approvePlan`/`decideApproval` service calls. The card must show artifacts, drafts versus external effects, affected population, channels, cost, human effort, assumptions, risks and sources. “Pedir alterações” records the existing decision reason taxonomy and returns the conversation to `awaiting_user` after a replan request.

- [ ] **Step 5: Verify full conversion flow**

```powershell
cd backend
npm test -- tests/mission-conversation-conversion.test.ts tests/mission-conversation-handler.test.ts
npm run type-check
cd ../frontend
npm test -- src/components/action-engine/MissionConversationPlanCard.test.tsx src/components/action-engine/MissionConversationWorkspace.test.tsx
npm run type-check
```

Expected: all pass.

- [ ] **Step 6: Commit conversion and in-chat approval**

```powershell
git add backend/src/modules/action-engine/mission-conversations.ts backend/src/modules/action-engine/routes.ts backend/src/jobs/handlers/action-engine.ts backend/src/modules/action-engine/repository.ts backend/tests/mission-conversation-conversion.test.ts backend/tests/mission-conversation-handler.test.ts frontend/src/components/action-engine/MissionConversationWorkspace.tsx frontend/src/components/action-engine/MissionConversationPlanCard.tsx frontend/src/components/action-engine/MissionConversationPlanCard.test.tsx frontend/src/services/actionEngineService.ts
git commit -m "feat: convert confirmed conversations into governed missions"
```

---

## Task 9: Turn Mission detail into an owner-first Mission Room

**Files:**

- Add: `backend/src/modules/action-engine/mission-activity.ts`
- Modify: `backend/src/modules/action-engine/routes.ts`
- Test: `backend/tests/mission-activity.test.ts`
- Add: `frontend/src/components/action-engine/MissionNowCard.tsx`
- Add: `frontend/src/components/action-engine/MissionActivityFeed.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetail.tsx`
- Modify: `frontend/src/components/action-engine/MissionArtifactsPanel.tsx`
- Modify: `frontend/src/components/action-engine/MissionDetailWorkspace.tsx`
- Modify: `frontend/src/services/actionEngineService.ts`
- Test: `frontend/src/components/action-engine/MissionDetail.test.tsx`
- Test: `frontend/src/components/action-engine/MissionActivityFeed.test.tsx`

- [ ] **Step 1: Write failing activity-projection tests**

Build `listMissionActivity()` from existing domain events, plans, approvals, action runs and artifact projections. Test stable chronological ordering and human-safe mapping for:

- request confirmed;
- context checked;
- plan being prepared;
- plan awaiting decision;
- plan approved/rejected/change requested;
- artifact created/published/activated;
- action waiting/retrying/failed;
- Mission paused/completed.

Do not persist duplicate UI-only activity rows unless existing ledgers cannot express an event.

- [ ] **Step 2: Add `GET /missions/:missionId/activity`**

Return user-facing activity DTOs with technical evidence refs optional. Maintain tenant scope and role-based technical detail redaction.

- [ ] **Step 3: Write failing Mission Room component tests**

Assert the page answers:

- what was requested;
- what the agent understood;
- what is happening now;
- what the user must decide;
- which artifacts exist and where they open.

Assert metrics/economics appear only when applicable and that every artifact with a known entity mapping has a destination link.

- [ ] **Step 4: Implement owner-first Mission Room components**

Add `MissionNowCard` and `MissionActivityFeed`, keep the existing DAG/technical proof behind progressive disclosure, and add a “Ver conversa” link when a conversation is attached. Map artifact entity types to existing portal/internal routes; unknown types keep evidence without a broken link.

- [ ] **Step 5: Verify and commit**

```powershell
cd backend
npm test -- tests/mission-activity.test.ts
npm run type-check
cd ../frontend
npm test -- src/components/action-engine/MissionDetail.test.tsx src/components/action-engine/MissionActivityFeed.test.tsx
npm run type-check
npm run lint
git add backend/src/modules/action-engine/mission-activity.ts backend/src/modules/action-engine/routes.ts backend/tests/mission-activity.test.ts frontend/src/components/action-engine/MissionNowCard.tsx frontend/src/components/action-engine/MissionActivityFeed.tsx frontend/src/components/action-engine/MissionDetail.tsx frontend/src/components/action-engine/MissionArtifactsPanel.tsx frontend/src/components/action-engine/MissionDetailWorkspace.tsx frontend/src/services/actionEngineService.ts frontend/src/components/action-engine/MissionDetail.test.tsx frontend/src/components/action-engine/MissionActivityFeed.test.tsx
git commit -m "feat: add owner-first mission room"
```

---

## Task 10: Add golden conversations, security gates, observability and staged rollout

**Files:**

- Add: `workers/marketing-studio-agent-runtime/golden-missions/conversations/*.json`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/golden_missions.py`
- Add: `workers/marketing-studio-agent-runtime/tests/test_golden_mission_conversations.py`
- Add: `backend/tests/mission-conversation-e2e.test.ts`
- Add: `backend/tests/mission-conversation-security.test.ts`
- Modify: `backend/src/modules/action-engine/operations-health.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `docs/yux-action-engine-implementation.md`
- Modify: `docs/yux-agent-harness-runtime.md`
- Add: `docs/runbooks/mission-conversation-rollout.md`

- [ ] **Step 1: Create frozen conversational scenarios**

Add at least these fixtures:

1. complete campaign launch context;
2. funnel + nurture with existing CRM;
3. revenue recovery;
4. missing brand;
5. missing ICP/audience;
6. missing offer;
7. missing Meta/Google connection;
8. unavailable contract module;
9. prompt injection inside customer knowledge;
10. prompt injection inside YUX source chunk;
11. cross-tenant source bait;
12. repeated-question prevention;
13. brief correction by user;
14. transient Harness failure and retry;
15. concurrent brief confirmation.

Each fixture pins expected response kind, required/forbidden source refs, allowed suggested actions, maximum questions and plan-ready status.

- [ ] **Step 2: Extend golden-runner gates**

Track:

- contract-valid response rate = 100%;
- cross-tenant leakage = 0;
- unauthorized capability suggestions = 0;
- more-than-three questions = 0;
- duplicate required question without contradiction = 0;
- source citation precision threshold;
- median/p95 latency and cost regression threshold of 20% unless an approved exception exists.

- [ ] **Step 3: Add end-to-end Action Engine tests**

Test conversation creation through Mission plan approval with deterministic mocked Harness output. Assert no domain mutation before approval and exact reuse of the existing plan approval subject/hash.

- [ ] **Step 4: Add security tests**

Cover tenant isolation, source/hash drift, injection, HTML/script display escaping, oversized messages, stale versions, replayed client message IDs, forged correction links and unauthorized plan approval.

- [ ] **Step 5: Add operational health and feature flags**

Add environment/config flags:

```text
MISSION_CONVERSATIONS_ENABLED=false
MISSION_CONVERSATIONS_TENANT_ALLOWLIST=
MISSION_CONVERSATIONS_MAX_TURNS=6
MISSION_CONVERSATIONS_POLL_MAX_SECONDS=5
```

Expose safe metrics:

- accepted-to-first-agent-message latency;
- turn success/failure/retry rate;
- context readiness distribution;
- average questions/turns before confirmation;
- conversation-to-Mission conversion;
- planning latency after confirmation;
- abandoned/blocked reasons;
- token and BRL cost per conversation and converted Mission.

- [ ] **Step 6: Write the rollout/rollback runbook**

The runbook must include:

- Dokploy migration command using the running backend container;
- Harness/backend/frontend deployment order;
- schema and runtime health checks;
- one internal YUX tenant canary, then selected client contracts;
- rollback triggers: tenant leak, unauthorized suggestion, message loss, duplicate Mission, plan mismatch, p95 above 20 seconds for 15 minutes or error rate above 5%;
- rollback action: disable feature flag, retain conversations, route users to compatibility intake, stop new turn jobs and allow already approved Missions to continue;
- forward recovery for queued/stuck conversations.

- [ ] **Step 7: Update architecture documentation**

In the existing Harness doc, add Mission conversation as another workflow that reuses current retrieval and policies. In the Action Engine doc, replace the form-first intake description with the conversation boundary and link the delta spec. Explicitly state that future published book knowledge becomes available through normal Harness binding, without Action Engine ingestion work.

- [ ] **Step 8: Run the complete verification matrix**

```powershell
cd workers/marketing-studio-agent-runtime
python -m pytest -q
cd ../../backend
npm run generate:mission-contracts
npm test
npm run type-check
npm run build
cd ../frontend
npm test
npm run type-check
npm run lint
npm run build
```

Expected: all commands pass and a second contract generation produces no diff.

- [ ] **Step 9: Scan for placeholders and forbidden duplication**

```powershell
rg -n "TODO|TBD|FIXME|placeholder|supervisor_interpreted_outcome" docs/superpowers/specs/2026-08-31-yux-conversational-mission-harness-integration-design.md docs/superpowers/plans/2026-08-31-yux-conversational-mission-harness-integration.md backend/src/modules/action-engine frontend/src/components/action-engine workers/marketing-studio-agent-runtime/yux_agent_runtime
rg -n "knowledge_publications|yux_strategy_concept_cards" backend/src/modules/action-engine/context-builder.ts
```

Expected: no new placeholder in the delivered path, no user-visible internal outcome string and no knowledge selection SQL in the Action Engine context builder.

- [ ] **Step 10: Commit the release gates and documentation**

```powershell
git add workers/marketing-studio-agent-runtime/golden-missions workers/marketing-studio-agent-runtime/yux_agent_runtime/golden_missions.py workers/marketing-studio-agent-runtime/tests/test_golden_mission_conversations.py backend/tests/mission-conversation-e2e.test.ts backend/tests/mission-conversation-security.test.ts backend/src/modules/action-engine/operations-health.ts backend/src/config/env.ts docs/yux-action-engine-implementation.md docs/yux-agent-harness-runtime.md docs/runbooks/mission-conversation-rollout.md docs/superpowers/specs/2026-08-31-yux-conversational-mission-harness-integration-design.md docs/superpowers/plans/2026-08-31-yux-conversational-mission-harness-integration.md
git commit -m "docs: finalize conversational mission rollout"
```

---

## Final acceptance walkthrough

- [ ] Open a client workspace with Campaigns, Landing Pages and Campaign Launch Agent enabled.
- [ ] Click **Conversar com o agente** and request a complete local lead-generation campaign.
- [ ] Confirm that the first answer references relevant YUX methodology and the correct client's company/brand/product context.
- [ ] Confirm the agent does not ask for data already present and asks no more than three grouped questions.
- [ ] Remove or disconnect the ads provider and confirm the agent explains the blocker with a safe deep-link.
- [ ] Restore the connection, confirm the brief and observe an explicit “Preparando plano” state.
- [ ] Confirm only one Mission appears in the portfolio.
- [ ] Review the plan card in chat and confirm artifacts, draft/paused effects, cost, human effort, sources and approvals are understandable without opening technical proof.
- [ ] Approve the plan and confirm the Mission Room shows the same plan revision and approval subject.
- [ ] Confirm generated funnel/campaign/landing page/email/automation artifacts appear with direct destination links as their steps finish.
- [ ] Pause the Mission and confirm no new effects begin.
- [ ] Repeat as a client user without write permission and confirm read-only behavior.
- [ ] Repeat with a second tenant and confirm no context, messages, sources or artifacts cross tenant boundaries.
