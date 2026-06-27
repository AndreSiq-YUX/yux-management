# YUX Strategy Engine And Commercial Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared YUX Strategy Engine so Marketing Studio agents, omnichannel conversational assistants and internal commercial agents follow the same internal sales/growth doctrine, retrieve strategic knowledge precisely, act on YUX Hub data, and record outcomes for future optimization.

**Architecture:** Preserve the existing Marketing Studio runtime and omnichannel assistant system. Add a strategy layer above both: knowledge ingestion, concept cards, semantic retrieval, profile policies, commercial taxonomy, conversation ownership, objection intelligence, metrics/cash intelligence, structured handoffs and outcome logs. Marketing Studio agents remain specialized operational subagents under a `marketing_strategist` profile; `ai_assistants` remain the conversation/WhatsApp configuration surface, with deterministic routing for SDR, closer, support, retention and custom assistants.

**Tech Stack:** Supabase Postgres/RLS/pgvector, Supabase Edge Functions with Deno, Node scripts for document ingestion, Python worker/LangGraph harness, React 18, TypeScript, Vite, Vitest, Python unittest/pytest-compatible tests, OpenRouter, Jina-compatible embeddings/retrieval, existing YUX CRM/Omnichannel/Marketing Studio services.

---

## Scope Boundaries

This is a V1 strategy foundation, not an autonomous sales brain with unrestricted actions.

The implementation must deliver:

1. Private knowledge ingestion for the book and future strategic sources.
2. Concept cards, chunks, page assets, embeddings and retrieval logs.
3. Agent profiles with explicit skill packs, tool permissions, forbidden actions and approval gates.
4. Commercial stage taxonomy derived from the operating model: anonymous, follower, lead, raised hand, opportunity, non-client, customer and lifecycle states.
5. Multiple conversational assistants per client/project, with one active assistant selected per inbound message.
6. Conversation ownership state so a support thread does not jump to SDR because of one keyword.
7. Objection Intelligence as a first-class feedback loop from CRM/conversations/proposals to offer, copy and Marketing Studio.
8. Metrics & Cash foundation before Admin UI polish, so agents can reason from CAC, LTV, MROI, stuck opportunities and recovery potential.
9. Structured handoffs and recommendations instead of free-form agent chat.
10. Outcome events and learning signals for V2 optimization.

The implementation must not:

- Replace the current Marketing Studio agent tables or agent types.
- Expose internal-only book text to clients.
- Send raw doctrine text to external webhooks by default.
- Let agents publish, activate campaigns, change budget, promise discounts or send sensitive messages without the configured approval policy.
- Attempt self-training or automatic prompt mutation in V1.

## Existing System Constraints

- Marketing Studio already has `marketing_agent_templates`, `marketing_agents`, `marketing_agent_global_prompts`, `marketing_workflows`, `marketing_workflow_runs`, `marketing_agent_runs`, `marketing_tool_runs`, `agent_budget_policies`, `model_routing_rules` and `marketing_agent_tool_policies`.
- Existing Marketing Studio agent types include `content_radar`, `strategic_curator`, `content_strategist`, `multichannel_writer`, `brand_quality_reviewer`, `campaign_strategist`, `visual_creative_generator`, `editorial_calendar_manager`, `controlled_publisher` and `performance_analyst`.
- Omnichannel/conversation AI already uses `ai_assistants`, assistant objectives/fields/handoff/safety/knowledge links, `process-ai-message`, `ai_message_runs`, `lead_ai_insights`, `lead_response_suggestions` and CRM sync primitives.
- CRM already has leads, interactions, tasks, Lead 360, proposals, objections in proposal flows, attribution/MROI surfaces and conversation links.
- The new strategy system bridges these areas through strategy bindings, retrieval context and actions. It does not collapse all agents into one generic agent table.

## Architecture Decisions

### Knowledge Architecture

The book and future strategic sources enter the system through a full ingestion pipeline:

```text
Source PDF / document
  -> source document record
  -> page records
  -> page image assets
  -> OCR text
  -> cleaned text
  -> section chunks
  -> concept cards
  -> embeddings for cards/chunks/page assets
  -> retrieval query logs
  -> compact context pack
  -> agent response/action
```

The RAG is an auxiliary research and grounding layer. Skills and profile policies drive behavior; retrieval supplies focused evidence, concepts and examples.

### Retrieval Architecture

Every agent receives a compact context pack built through a retrieval service:

```python
retrieve_strategy_context(
    profile_key,
    organization_id,
    client_id,
    intent,
    stage,
    query,
    max_cards,
    max_chunks,
    include_images=False,
)
```

The service must:

- filter by `allowed_agent_profile_keys`;
- filter by `visibility`;
- filter by `stage_tags`;
- combine concept cards, chunks and optional page/image assets;
- support dense vector search plus keyword fallback;
- rerank results;
- enforce token/character budgets;
- write a `yux_strategy_retrieval_queries` log with result ids, filters, score metadata and context size.

### Commercial Taxonomy

Seed these commercial stage keys:

- `anonymous`
- `follower`
- `lead_cold`
- `lead_warm`
- `raised_hand`
- `qualified_opportunity`
- `almost_customer`
- `non_customer`
- `first_purchase_customer`
- `recurring_customer`
- `ex_customer`
- `referral`
- `bad_fit`

Core distinction: a lead is not automatically an opportunity. Marketing warms and generates raised hands; Comercial 1 works individual opportunities; Comercial 2 works lifecycle, recurrence, upsell, LTV and recovery.

### Strategy Profiles

Seed these profile keys:

- `growth_strategist`
- `crm_controller`
- `ai_sdr_comercial_1`
- `ai_closer`
- `support_assistant`
- `customer_growth_comercial_2`
- `revenue_recovery`
- `offer_conversion`
- `marketing_strategist`
- `referral_growth`
- `metrics_cash_mroi`
- `proposal_delivery`

### Marketing Studio Subagent Bindings

Do not remove existing Marketing Studio agent types. Bind them as operational subagents:

- `content_radar` -> `marketing_strategist`
- `strategic_curator` -> `marketing_strategist`
- `content_strategist` -> `marketing_strategist`
- `multichannel_writer` -> `marketing_strategist`
- `brand_quality_reviewer` -> `marketing_strategist`
- `campaign_strategist` -> `marketing_strategist`, `offer_conversion`
- `visual_creative_generator` -> `marketing_strategist`
- `editorial_calendar_manager` -> `marketing_strategist`
- `controlled_publisher` -> `marketing_strategist`
- `performance_analyst` -> `metrics_cash_mroi`

### Conversational Assistant Roles

Allow multiple `ai_assistants` per client/project:

- `sdr`: first response, qualification, SPIN diagnosis, raised-hand detection, CRM registration and handoff.
- `closer`: proposal follow-up, objection handling, next-step pressure, meeting scheduling and human handoff.
- `support`: FAQ, support triage, routing, status and operational answers.
- `retention`: post-sale, recurrence, upsell, satisfaction, churn risk and reactivation.
- `custom`: project-specific assistant with explicit routing rules.

Only one assistant answers a single inbound message. Conversation state preserves continuity through `conversation_current_role`, `conversation_stage`, `role_locked_until` and `last_handoff_id`.

---

## File Structure

### Database

- Create: `supabase/migrations/20260611190000_yux_strategy_engine.sql`
  - Strategy doctrine, skills, profiles, policies, bindings, knowledge source tables, retrieval logs, commercial stage taxonomy, conversation state, objection intelligence, metrics snapshots, handoffs, recommendations and learning signals.
- Create: `supabase/probes/20260611190000_yux_strategy_engine.sql`
  - Verifies tables, columns, seed rows, RLS, indexes and key constraints.

### Knowledge Ingestion

- Create: `scripts/strategy-knowledge/README.md`
- Create: `scripts/strategy-knowledge/concept-card-schema.json`
- Create: `scripts/strategy-knowledge/extract-pdf-pages.mjs`
- Create: `scripts/strategy-knowledge/clean-ocr.mjs`
- Create: `scripts/strategy-knowledge/chunk-sections.mjs`
- Create: `scripts/strategy-knowledge/generate-page-images.mjs`
- Create: `scripts/strategy-knowledge/validate-concept-cards.mjs`
- Create: `scripts/strategy-knowledge/embed-concept-cards.mjs`
- Create: `scripts/strategy-knowledge/import-knowledge.mjs`
- Create: `scripts/strategy-knowledge/example-concept-cards.json`

### Worker Runtime

- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/retrieval.py`
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/strategy.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/harness.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/__init__.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_retrieval.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_strategy.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_harness.py`

### Supabase Edge Functions

- Create: `supabase/functions/_shared/strategy.ts`
- Modify: `supabase/functions/_shared/omnichannel.ts`
- Modify: `supabase/functions/process-ai-message/index.ts`

### Frontend And Services

- Create: `frontend/src/types/strategyEngine.ts`
- Create: `frontend/src/services/strategyEngineService.ts`
- Create: `frontend/src/services/strategyEngineService.test.ts`
- Modify: `frontend/src/types/aiAssistant.ts`
- Modify: `frontend/src/components/ai-assistant/AssistantSettingsPanel.tsx`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`
- Create: `frontend/src/components/strategy-engine/AgentHandoffPanel.tsx`
- Create: `frontend/src/components/strategy-engine/AgentRecommendationPanel.tsx`
- Create: `frontend/src/pages/admin/StrategyEnginePage.tsx`
- Create: `frontend/src/pages/admin/StrategyEnginePage.test.tsx`
- Modify: `frontend/src/navigation.ts`
- Modify: `frontend/src/App.tsx`

### Docs

- Create: `docs/yux-strategy-engine.md`
- Modify: `docs/implementation-status.md`
- Modify: `docs/yux-marketing-studio-agentes.md`
- Modify: `docs/crm-lead-management.md`
- Modify: `docs/mapa-paginas-e-funcionalidades.md`

---

## Task 1: Strategy Base Schema, Profile Policies And Commercial State

**Files:**
- Create: `supabase/migrations/20260611190000_yux_strategy_engine.sql`
- Create: `supabase/probes/20260611190000_yux_strategy_engine.sql`

- [ ] **Step 1: Add strategy doctrine/profile tables**

Create:

- `yux_strategy_doctrines`
- `yux_strategy_skills`
- `yux_strategy_skill_sections`
- `yux_strategy_agent_profiles`
- `yux_strategy_agent_profile_skills`
- `yux_strategy_agent_bindings`
- `yux_strategy_profile_tool_policies`
- `yux_strategy_profile_action_policies`

Required profile policy fields:

- `profile_key`
- `allowed_modules`
- `allowed_tools`
- `forbidden_actions`
- `requires_human_approval_for`
- `default_context_policy`
- `output_schema`
- `max_context_chars`
- `max_cards`
- `max_chunks`

- [ ] **Step 2: Add commercial taxonomy and conversation state**

Create:

- `yux_commercial_stage_definitions`
- `yux_contact_stage_events`

Extend `public.leads`:

- `commercial_stage TEXT`
- `lead_temperature TEXT CHECK (lead_temperature IS NULL OR lead_temperature IN ('cold','warm','hot','unknown'))`
- `source_channel TEXT`
- `last_meaningful_touch_at TIMESTAMPTZ`
- `last_human_touch_at TIMESTAMPTZ`
- `last_ai_touch_at TIMESTAMPTZ`
- `next_best_action TEXT`
- `main_objection TEXT`
- `fit_status TEXT CHECK (fit_status IS NULL OR fit_status IN ('good_fit','unclear','bad_fit'))`
- `handoff_status TEXT CHECK (handoff_status IS NULL OR handoff_status IN ('none','suggested','pending','completed','rejected'))`
- `customer_lifecycle_stage TEXT`

Extend `public.conversations`:

- `conversation_current_role TEXT CHECK (conversation_current_role IS NULL OR conversation_current_role IN ('sdr','closer','support','retention','custom'))`
- `conversation_current_strategy_profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL`
- `conversation_stage TEXT`
- `last_handoff_id UUID`
- `role_locked_until TIMESTAMPTZ`

- [ ] **Step 3: Extend conversational assistant settings**

Extend `public.ai_assistants`:

- `assistant_role TEXT CHECK (assistant_role IN ('sdr','closer','support','retention','custom'))`
- `strategy_profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL`
- `routing_priority INTEGER NOT NULL DEFAULT 100`
- `routing_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(routing_metadata) = 'object')`

Create `ai_assistant_routing_rules` with:

- `assistant_id`
- `channel`
- `required_role`
- `stage_keys`
- `intent_keys`
- `keyword_patterns`
- `default_rule`
- `score_weight`
- `lock_role_minutes`
- `status`

- [ ] **Step 4: Seed profiles and hard policy rules**

Seed all strategy profiles and these forbidden action rules:

- `ai_sdr_comercial_1` forbids `activate_campaign`, `promise_discount`, `send_contractual_commitment`.
- `support_assistant` forbids `send_sales_pressure_message`, `promise_discount`, `activate_campaign`.
- `ai_closer` forbids `promise_discount_without_approved_offer`, `change_proposal_terms_without_approval`.
- `marketing_strategist` forbids `publish_without_approval`, `activate_paid_campaign_without_approval`.
- `metrics_cash_mroi` forbids `change_ads_budget_without_approval`, `alter_financial_records`.

- [ ] **Step 5: Add RLS and probe**

RLS rules:

- internal users manage strategy tables;
- service role can read/write operational strategy logs;
- client users read only client-safe recommendations/outcomes scoped to their organization;
- internal-only doctrine and internal-only source content are not readable by client users.

Probe must verify:

- profiles exist;
- commercial stages exist;
- `ai_assistants` role/profile/routing columns exist;
- `conversations` ownership columns exist;
- RLS is enabled on all new tables;
- `content_radar -> marketing_strategist` binding exists.

- [ ] **Step 6: Run validation**

```powershell
Get-Content -Encoding UTF8 supabase\migrations\20260611190000_yux_strategy_engine.sql | Select-String -Pattern "conversation_current_role"
Get-Content -Encoding UTF8 supabase\probes\20260611190000_yux_strategy_engine.sql | Select-String -Pattern "marketing_strategist"
```

Expected: both commands print matching lines.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations/20260611190000_yux_strategy_engine.sql supabase/probes/20260611190000_yux_strategy_engine.sql
git commit -m "feat: add strategy engine base schema"
```

---

## Task 2: Knowledge Ingestion Engine

**Files:**
- Modify: `supabase/migrations/20260611190000_yux_strategy_engine.sql`
- Modify: `supabase/probes/20260611190000_yux_strategy_engine.sql`
- Create: `scripts/strategy-knowledge/README.md`
- Create: `scripts/strategy-knowledge/concept-card-schema.json`
- Create: `scripts/strategy-knowledge/extract-pdf-pages.mjs`
- Create: `scripts/strategy-knowledge/clean-ocr.mjs`
- Create: `scripts/strategy-knowledge/chunk-sections.mjs`
- Create: `scripts/strategy-knowledge/generate-page-images.mjs`
- Create: `scripts/strategy-knowledge/validate-concept-cards.mjs`
- Create: `scripts/strategy-knowledge/embed-concept-cards.mjs`
- Create: `scripts/strategy-knowledge/import-knowledge.mjs`
- Create: `scripts/strategy-knowledge/example-concept-cards.json`

- [ ] **Step 1: Add knowledge source tables**

Create:

- `yux_strategy_source_documents`
- `yux_strategy_source_pages`
- `yux_strategy_source_chunks`
- `yux_strategy_source_assets`
- `yux_strategy_concept_cards`
- `yux_strategy_card_embeddings`
- `yux_strategy_chunk_embeddings`
- `yux_strategy_asset_embeddings`
- `yux_strategy_retrieval_queries`

Required source fields:

- `source_scope`
- `visibility`
- `document_type`
- `source_title`
- `source_hash`
- `page_number`
- `section_key`
- `ocr_text`
- `clean_text`
- `chunk_text`
- `asset_type`
- `storage_path`
- `embedding_model`
- `embedding_dimensions`
- `allowed_agent_profile_keys`
- `stage_tags`
- `retrieval_tags`
- `human_review_status`

- [ ] **Step 2: Write concept-card schema**

`concept-card-schema.json` must require:

- `concept`
- `category`
- `sourceScope`
- `visibility`
- `problemSolved`
- `triggerSignals`
- `diagnosisQuestions`
- `decisionRules`
- `antiPatterns`
- `recommendedActions`
- `allowedAgentProfileKeys`
- `stageTags`
- `retrievalTags`
- `yuxModules`
- `requiresHumanReview`

Allowed `visibility` values: `internal_only`, `client_safe`.

- [ ] **Step 3: Implement ingestion scripts**

Script responsibilities:

- `extract-pdf-pages.mjs`: extracts page metadata and page text from a PDF path into JSONL.
- `clean-ocr.mjs`: normalizes encoding, removes repeated headers/footers and writes cleaned JSONL.
- `chunk-sections.mjs`: groups clean text into section/page chunks with stable ids.
- `generate-page-images.mjs`: creates page image asset references for multimodal embedding.
- `validate-concept-cards.mjs`: validates cards against schema.
- `embed-concept-cards.mjs`: calls the configured embedding provider and stores model metadata in output JSONL.
- `import-knowledge.mjs`: imports documents, pages, chunks, assets, cards and embeddings through Supabase service credentials.

Scripts must accept explicit input/output paths and must not hard-code `The Black Book.pdf`.

- [ ] **Step 4: Add README workflow**

Document command flow:

```powershell
node scripts/strategy-knowledge/extract-pdf-pages.mjs --input "The Black Book.pdf" --out .strategy-work/pages.jsonl
node scripts/strategy-knowledge/clean-ocr.mjs --input .strategy-work/pages.jsonl --out .strategy-work/pages-clean.jsonl
node scripts/strategy-knowledge/chunk-sections.mjs --input .strategy-work/pages-clean.jsonl --out .strategy-work/chunks.jsonl
node scripts/strategy-knowledge/generate-page-images.mjs --input "The Black Book.pdf" --out .strategy-work/assets.jsonl
node scripts/strategy-knowledge/validate-concept-cards.mjs scripts/strategy-knowledge/example-concept-cards.json
node scripts/strategy-knowledge/embed-concept-cards.mjs --input scripts/strategy-knowledge/example-concept-cards.json --out .strategy-work/card-embeddings.jsonl
node scripts/strategy-knowledge/import-knowledge.mjs --documents .strategy-work/pages-clean.jsonl --chunks .strategy-work/chunks.jsonl --assets .strategy-work/assets.jsonl --cards scripts/strategy-knowledge/example-concept-cards.json
```

- [ ] **Step 5: Add tests by CLI smoke checks**

Run:

```powershell
node scripts/strategy-knowledge/validate-concept-cards.mjs scripts/strategy-knowledge/example-concept-cards.json
```

Expected: prints `valid concept cards`.

Run:

```powershell
node scripts/strategy-knowledge/chunk-sections.mjs --input scripts/strategy-knowledge/example-pages.jsonl --out .strategy-work/test-chunks.jsonl
```

Expected: creates `.strategy-work/test-chunks.jsonl` with at least one chunk.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260611190000_yux_strategy_engine.sql supabase/probes/20260611190000_yux_strategy_engine.sql scripts/strategy-knowledge
git commit -m "feat: add strategy knowledge ingestion engine"
```

---

## Task 3: Retrieval Service

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/retrieval.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_retrieval.py`
- Create: `supabase/functions/_shared/strategy.ts`
- Modify: `supabase/migrations/20260611190000_yux_strategy_engine.sql`

- [ ] **Step 1: Write retrieval tests**

Test cases:

- `growth_strategist` can retrieve broad internal cards and chunks.
- `ai_sdr_comercial_1` retrieves SDR/SPIN/stage cards and does not retrieve support-only cards.
- `support_assistant` does not retrieve acquisition/closing cards unless the card explicitly allows that profile.
- `visibility='internal_only'` is excluded when `portal_safe=True`.
- `max_cards`, `max_chunks` and `max_context_chars` are enforced.
- retrieval logs include profile key, query, filters and returned ids.

- [ ] **Step 2: Implement Python retrieval API**

Implement:

```python
def retrieve_strategy_context(
    profile_key: str,
    organization_id: str | None,
    client_id: str | None,
    intent: str | None,
    stage: str | None,
    query: str,
    max_cards: int,
    max_chunks: int,
    include_images: bool = False,
    portal_safe: bool = False,
) -> dict:
    ...
```

Returned shape:

```python
{
    "profile_key": "ai_sdr_comercial_1",
    "query": "...",
    "cards": [],
    "chunks": [],
    "assets": [],
    "context_text": "...",
    "retrieval_log": {
        "filters": {},
        "result_ids": [],
        "max_context_chars": 5000
    }
}
```

- [ ] **Step 3: Implement ranking and budget rules**

Ranking order:

1. exact `allowed_agent_profile_keys` match;
2. matching `stage_tags`;
3. vector score when available;
4. keyword score;
5. human-reviewed cards before draft cards;
6. newest card only as final tie-breaker.

Budget rules:

- cards before chunks;
- chunks before image assets;
- images only when `include_images=True`;
- truncate context by item boundary, not mid-sentence when possible.

- [ ] **Step 4: Add Deno helper**

In `supabase/functions/_shared/strategy.ts`, add helpers:

- `loadStrategyProfileContext`
- `sanitizeStrategyContextForWebhook`
- `buildRetrievalLogPayload`

These helpers must never include raw internal chunks in external webhook payloads unless `allowInternalSources === true`.

- [ ] **Step 5: Run tests**

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest tests.test_retrieval
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime/retrieval.py workers/marketing-studio-agent-runtime/tests/test_retrieval.py supabase/functions/_shared/strategy.ts supabase/migrations/20260611190000_yux_strategy_engine.sql
git commit -m "feat: add strategy retrieval service"
```

---

## Task 4: Strategy Types And Frontend Service

**Files:**
- Create: `frontend/src/types/strategyEngine.ts`
- Create: `frontend/src/services/strategyEngineService.ts`
- Create: `frontend/src/services/strategyEngineService.test.ts`

- [ ] **Step 1: Add frontend types**

Define types for:

- `YuxStrategyDoctrine`
- `YuxStrategySkill`
- `YuxStrategyConceptCard`
- `YuxStrategySourceDocument`
- `YuxStrategySourceChunk`
- `YuxStrategyRetrievalQuery`
- `YuxStrategyAgentProfile`
- `YuxStrategyAgentBinding`
- `YuxAgentContextPack`
- `YuxAgentHandoff`
- `YuxAgentRecommendation`
- `YuxAgentOutcomeEvent`
- `YuxAgentLearningSignal`
- `YuxObjectionEvent`
- `YuxMetricsSnapshot`

- [ ] **Step 2: Add failing mapper tests**

Test that:

- internal-only concept cards map to `visibility: 'internal_only'`;
- source chunks include `pageNumber`, `sectionKey`, `stageTags` and `retrievalTags`;
- agent bindings can point to `marketing_agent_type` and `ai_assistant`;
- recommendations include objective, audience, action, channel, owner, metric and next step;
- retrieval query logs map returned card/chunk/asset ids.

- [ ] **Step 3: Implement service methods**

Methods:

- `getAgentProfiles()`
- `getSkills()`
- `getConceptCards(filters)`
- `getSourceDocuments(filters)`
- `getRetrievalQueries(filters)`
- `getAgentBindings(filters)`
- `upsertAgentBinding(input)`
- `getRecommendations(filters)`
- `createHandoff(input)`
- `recordOutcome(input)`
- `getObjectionPlaybook(filters)`
- `getMetricsSnapshots(filters)`

- [ ] **Step 4: Run tests**

```powershell
cd frontend
npm run test -- strategyEngineService.test.ts --runInBand
npm run type-check
```

Expected: tests pass and TypeScript passes.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/types/strategyEngine.ts frontend/src/services/strategyEngineService.ts frontend/src/services/strategyEngineService.test.ts
git commit -m "feat: add strategy engine frontend service"
```

---

## Task 5: Profile Policies And Runtime Guards

**Files:**
- Create: `workers/marketing-studio-agent-runtime/yux_agent_runtime/strategy.py`
- Create: `workers/marketing-studio-agent-runtime/tests/test_strategy.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/__init__.py`

- [ ] **Step 1: Write policy tests**

Test:

- SDR rejects `activate_campaign`.
- Support rejects `send_sales_pressure_message`.
- Closer rejects `promise_discount_without_approved_offer`.
- Marketing Strategist rejects `publish_without_approval`.
- Metrics & Cash rejects `change_ads_budget_without_approval`.
- Growth Strategist can read broader cards but cannot execute external communication directly.

- [ ] **Step 2: Implement profile helpers**

Functions:

- `select_strategy_profile(agent_or_assistant, bindings)`
- `select_skill_pack(profile, skills)`
- `enforce_profile_action_policy(profile, action_key)`
- `build_agent_handoff(source_profile, target_profile, objective, payload)`
- `build_recommendation_payload(profile, recommendation)`

`build_recommendation_payload` must require:

- `objective`
- `audience`
- `stage`
- `action`
- `channel`
- `owner`
- `metric`
- `next_step`
- `confidence`
- `requires_approval`
- `supporting_cards`

- [ ] **Step 3: Run worker tests**

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest tests.test_strategy
```

Expected: tests pass.

- [ ] **Step 4: Commit**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime/strategy.py workers/marketing-studio-agent-runtime/yux_agent_runtime/__init__.py workers/marketing-studio-agent-runtime/tests/test_strategy.py
git commit -m "feat: add strategy profile policy guards"
```

---

## Task 6: Metrics And Cash Foundation

**Files:**
- Modify: `supabase/migrations/20260611190000_yux_strategy_engine.sql`
- Modify: `supabase/probes/20260611190000_yux_strategy_engine.sql`
- Create: `frontend/src/lib/strategy-engine/metricsRules.ts`
- Create: `frontend/src/lib/strategy-engine/metricsRules.test.ts`
- Modify: `frontend/src/types/strategyEngine.ts`

- [ ] **Step 1: Add metrics tables**

Create:

- `yux_metrics_cash_snapshots`
- `yux_metrics_funnel_stage_snapshots`
- `yux_metrics_channel_snapshots`
- `yux_metrics_recovery_opportunities`

Metrics:

- CAC;
- ticket médio;
- LTV;
- conversion rate by stage;
- average time in stage;
- follow-up response rate;
- loss rate by objection;
- revenue by channel;
- estimated margin;
- ROAS;
- MROI;
- stuck opportunities;
- inactive customers;
- potential recoverable value.

- [ ] **Step 2: Add pure metric rules**

Implement `metricsRules.ts` functions:

- `calculateCac(spend, customers)`
- `calculateMroi(revenue, spend, operationalCost)`
- `calculateStageConversion(fromCount, toCount)`
- `estimateRecoverableValue(count, averageTicket, expectedRecoveryRate)`
- `classifyCashPriority(metric)`

- [ ] **Step 3: Add tests**

Test:

- zero customers returns CAC `null`;
- MROI uses revenue minus spend and operational cost;
- recovery potential uses expected rate;
- high stuck opportunity value classifies as `high_priority`.

- [ ] **Step 4: Run tests**

```powershell
cd frontend
npm run test -- metricsRules.test.ts --runInBand
npm run type-check
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260611190000_yux_strategy_engine.sql supabase/probes/20260611190000_yux_strategy_engine.sql frontend/src/lib/strategy-engine/metricsRules.ts frontend/src/lib/strategy-engine/metricsRules.test.ts frontend/src/types/strategyEngine.ts
git commit -m "feat: add strategy metrics cash foundation"
```

---

## Task 7: Objection Intelligence Engine

**Files:**
- Modify: `supabase/migrations/20260611190000_yux_strategy_engine.sql`
- Modify: `supabase/probes/20260611190000_yux_strategy_engine.sql`
- Create: `frontend/src/lib/strategy-engine/objectionRules.ts`
- Create: `frontend/src/lib/strategy-engine/objectionRules.test.ts`
- Modify: `frontend/src/types/strategyEngine.ts`

- [ ] **Step 1: Add objection tables**

Create:

- `yux_objection_categories`
- `yux_objection_events`
- `yux_objection_playbook_items`
- `yux_offer_improvement_suggestions`

Link objection events to:

- CRM lead;
- conversation;
- proposal;
- campaign;
- landing page;
- content item;
- assistant run;
- agent recommendation.

- [ ] **Step 2: Add objection rules**

Functions:

- `classifyObjection(rawText)`
- `mapObjectionToPlaybookAction(category)`
- `shouldCreateOfferImprovementSuggestion(event)`
- `shouldNotifyMarketingStrategist(event)`

Categories:

- price;
- timing;
- trust;
- authority;
- urgency;
- product_fit;
- competitor;
- implementation_effort;
- unclear_value;
- no_response.

- [ ] **Step 3: Add tests**

Test:

- price objection maps to offer/copy/script action;
- no-response maps to follow-up and recovery sequence;
- competitor maps to comparison/proof action;
- repeated objection creates offer improvement suggestion;
- client-safe playbook excludes internal-only source details.

- [ ] **Step 4: Run tests**

```powershell
cd frontend
npm run test -- objectionRules.test.ts --runInBand
npm run type-check
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260611190000_yux_strategy_engine.sql supabase/probes/20260611190000_yux_strategy_engine.sql frontend/src/lib/strategy-engine/objectionRules.ts frontend/src/lib/strategy-engine/objectionRules.test.ts frontend/src/types/strategyEngine.ts
git commit -m "feat: add objection intelligence engine"
```

---

## Task 8: Strategy Context Runtime And Harness Integration

**Files:**
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/harness.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/strategy.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/retrieval.py`
- Modify: `workers/marketing-studio-agent-runtime/tests/test_harness.py`

- [ ] **Step 1: Add regression tests**

Test:

- existing Marketing Studio agents still execute without strategy binding;
- strategy context appears when supplied;
- raw internal chunks are excluded unless `allow_internal_sources=True`;
- skill rules appear before RAG snippets in prompt context;
- context pack hash changes when retrieved cards change.

- [ ] **Step 2: Update `compose_prompt`**

Add optional `context["strategy_context"]`.

Prompt order:

1. objective;
2. compact YUX doctrine/skill rules;
3. commercial stage and customer context;
4. retrieved concept cards;
5. retrieved chunks/assets summary;
6. brand/products/knowledge snippets;
7. agent prompt.

- [ ] **Step 3: Add context pack output**

Context pack shape:

```python
{
    "profile_key": "crm_controller",
    "commercial_stage": "raised_hand",
    "skill_rules": [],
    "concept_cards": [],
    "chunks": [],
    "allowed_actions": [],
    "forbidden_actions": [],
    "approval_policy": {},
    "context_hash": "..."
}
```

- [ ] **Step 4: Run worker tests**

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest discover tests
```

Expected: all worker tests pass.

- [ ] **Step 5: Commit**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime workers/marketing-studio-agent-runtime/tests
git commit -m "feat: integrate strategy context with agent harness"
```

---

## Task 9: CRM Controller Internal Workflow

**Files:**
- Modify: `frontend/src/services/strategyEngineService.ts`
- Create: `frontend/src/lib/strategy-engine/crmControllerRules.ts`
- Create: `frontend/src/lib/strategy-engine/crmControllerRules.test.ts`
- Modify: `docs/crm-lead-management.md`

- [ ] **Step 1: Add CRM Controller rules**

Functions:

- `detectStaleLead(lead)`
- `detectMissingNextAction(lead)`
- `detectStageMismatch(lead)`
- `recommendCrmNextAction(lead, metrics, objections)`
- `buildCrmControllerRecommendation(lead, contextPack)`

Required recommendations:

- follow-up task;
- stage correction;
- objection capture;
- proposal follow-up;
- revenue recovery sequence;
- human review.

- [ ] **Step 2: Add tests**

Test:

- raised hand with no follow-up becomes high priority;
- cold lead is not treated as opportunity;
- proposal with price objection routes to closer and objection intelligence;
- inactive customer routes to retention/revenue recovery;
- bad fit does not receive aggressive follow-up.

- [ ] **Step 3: Run tests**

```powershell
cd frontend
npm run test -- crmControllerRules.test.ts --runInBand
npm run type-check
```

Expected: tests pass.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/lib/strategy-engine/crmControllerRules.ts frontend/src/lib/strategy-engine/crmControllerRules.test.ts frontend/src/services/strategyEngineService.ts docs/crm-lead-management.md
git commit -m "feat: add crm controller strategy rules"
```

---

## Task 10: Multi-Assistant Conversational Routing

**Files:**
- Modify: `supabase/functions/process-ai-message/index.ts`
- Modify: `supabase/functions/_shared/omnichannel.ts`
- Modify: `supabase/functions/_shared/strategy.ts`
- Modify: `frontend/src/types/aiAssistant.ts`
- Modify: `frontend/src/components/ai-assistant/AssistantSettingsPanel.tsx`

- [ ] **Step 1: Add routing helper**

Routing logic:

1. Load active assistants by organization/client/contract.
2. Load assistant routing rules.
3. Respect `conversation_current_role` when `role_locked_until` is in the future.
4. Score by channel, stage, intent, keyword and default rule.
5. Migrate role only when a transition rule is met.
6. Break ties by `routing_priority`, then most recently updated.
7. Return one assistant or null.

- [ ] **Step 2: Add transition rules**

Transitions:

- new commercial intent -> `sdr`;
- qualified opportunity/proposal -> `closer`;
- support issue open -> `support`;
- closed customer/post-sale -> `retention`;
- inactive customer after configured days -> `retention` or `revenue_recovery` handoff;
- human handoff active -> no AI dispatch unless suggestion-only mode.

- [ ] **Step 3: Update `process-ai-message`**

Add metadata:

- `assistantRole`
- `strategyProfileId`
- `routingRuleId`
- `routingScore`
- `conversationCurrentRole`
- `conversationStage`
- `roleLockedUntil`

Update `conversations` state when a role transition occurs.

- [ ] **Step 4: Add strategy context to webhook payload**

Include:

- assistant role;
- profile key;
- compact skill rules;
- allowed/forbidden actions;
- handoff rules;
- commercial stage;
- client-safe context only by default.

- [ ] **Step 5: Update assistant UI**

Add controls:

- Role: SDR, Closer, Support, Retention, Custom.
- Routing priority.
- Strategy profile binding.
- Conversation objective templates by role.
- Role lock duration.

Keep the existing wizard pattern.

- [ ] **Step 6: Validate**

```powershell
deno check supabase/functions/process-ai-message/index.ts
cd frontend
npm run type-check
```

Expected: Deno check and TypeScript pass.

- [ ] **Step 7: Commit**

```powershell
git add supabase/functions/process-ai-message supabase/functions/_shared frontend/src/types/aiAssistant.ts frontend/src/components/ai-assistant/AssistantSettingsPanel.tsx
git commit -m "feat: route omnichannel assistants by strategy role"
```

---

## Task 11: Structured Handoffs And Recommendations

**Files:**
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/strategy.py`
- Create: `frontend/src/components/strategy-engine/AgentHandoffPanel.tsx`
- Create: `frontend/src/components/strategy-engine/AgentRecommendationPanel.tsx`
- Modify: `frontend/src/services/strategyEngineService.ts`
- Modify: `frontend/src/services/strategyEngineService.test.ts`

- [ ] **Step 1: Implement handoff payloads**

Handoff fields:

- source profile;
- target profile;
- reason;
- requested output;
- related module;
- related record id;
- urgency;
- context summary;
- allowed tools;
- due time;
- status.

- [ ] **Step 2: Add service methods**

Methods:

- `createHandoff(input)`
- `updateHandoffStatus(id, status)`
- `createRecommendation(input)`
- `updateRecommendationStatus(id, status)`

- [ ] **Step 3: Add UI panels**

Internal views show:

- pending handoffs;
- source/target profile;
- related lead/conversation/campaign/proposal;
- recommendation;
- approval/action buttons.

Portal-safe views show only approved recommendations and no internal source names.

- [ ] **Step 4: Validate**

```powershell
cd frontend
npm run test -- strategyEngineService.test.ts --runInBand
npm run type-check
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```powershell
git add workers/marketing-studio-agent-runtime/yux_agent_runtime/strategy.py frontend/src/components/strategy-engine frontend/src/services/strategyEngineService.ts frontend/src/services/strategyEngineService.test.ts
git commit -m "feat: add structured strategy handoffs"
```

---

## Task 12: Admin YUX Strategy Engine UI

**Files:**
- Create: `frontend/src/pages/admin/StrategyEnginePage.tsx`
- Create: `frontend/src/pages/admin/StrategyEnginePage.test.tsx`
- Modify: `frontend/src/navigation.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx`

- [ ] **Step 1: Add page shell**

Tabs:

- Doutrina
- Ingestão
- Retrieval
- Skills
- Cards Conceituais
- Perfis de Agente
- Bindings
- Objeções
- Métricas & Caixa
- Handoffs
- Avaliação e Aprendizado

- [ ] **Step 2: Add operational controls**

First UI version supports:

- list source documents/pages/chunks/assets;
- list retrieval queries and returned ids;
- list concept cards by profile/tag/stage;
- list skills;
- list agent profiles and action policies;
- show Marketing Studio bindings;
- show conversational assistant bindings;
- show objection playbook items;
- show metrics snapshots;
- show recent handoffs/recommendations/outcomes.

- [ ] **Step 3: Add internal route**

Route:

- `/admin/strategy-engine`

Only internal users with platform/admin permission see this route.

- [ ] **Step 4: Validate**

```powershell
cd frontend
npm run test -- StrategyEnginePage.test.tsx --runInBand
npm run type-check
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/pages/admin/StrategyEnginePage.tsx frontend/src/pages/admin/StrategyEnginePage.test.tsx frontend/src/navigation.ts frontend/src/App.tsx frontend/src/components/marketing-studio/MarketingStudioWorkspace.tsx
git commit -m "feat: add admin strategy engine workspace"
```

---

## Task 13: Outcome Tracking And V2 Learning Foundation

**Files:**
- Modify: `supabase/migrations/20260611190000_yux_strategy_engine.sql`
- Modify: `supabase/functions/_shared/strategy.ts`
- Modify: `frontend/src/services/strategyEngineService.ts`
- Modify: `docs/yux-strategy-engine.md`

- [ ] **Step 1: Define outcome events**

Event types:

- `message_sent`
- `message_replied_positive`
- `message_replied_negative`
- `meeting_scheduled`
- `proposal_sent`
- `proposal_viewed`
- `proposal_won`
- `proposal_lost`
- `follow_up_completed`
- `task_completed`
- `campaign_improved`
- `customer_reactivated`
- `upsell_won`
- `human_rejected_recommendation`
- `human_approved_recommendation`

- [ ] **Step 2: Link outcomes to recommendations**

Optional references:

- `recommendation_id`
- `handoff_id`
- `agent_run_id`
- `ai_message_run_id`
- `lead_id`
- `conversation_id`
- `proposal_id`
- `campaign_id`
- `content_item_id`

- [ ] **Step 3: Add learning signal records**

Learning fields:

- profile key;
- skill key;
- card id;
- action type;
- commercial stage;
- outcome type;
- outcome score;
- confidence before;
- human feedback;
- aggregation window.

This records training-quality data. It does not mutate prompts, cards or policies automatically.

- [ ] **Step 4: Document V2 optimization**

Future V2 options:

- scorecards by profile/skill/card;
- action ranking by segment/stage;
- prompt/skill revision suggestions;
- card weight adjustments;
- A/B tests for follow-up and recovery scripts;
- fine-tuning only after enough high-quality, permissioned, labeled examples exist.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260611190000_yux_strategy_engine.sql supabase/functions/_shared/strategy.ts frontend/src/services/strategyEngineService.ts docs/yux-strategy-engine.md
git commit -m "feat: add strategy outcome learning foundation"
```

---

## Task 14: Documentation And Status Update

**Files:**
- Create: `docs/yux-strategy-engine.md`
- Modify: `docs/implementation-status.md`
- Modify: `docs/yux-marketing-studio-agentes.md`
- Modify: `docs/crm-lead-management.md`
- Modify: `docs/mapa-paginas-e-funcionalidades.md`

- [ ] **Step 1: Create Strategy Engine doc**

Document:

- doctrine/skills/cards;
- ingestion pipeline;
- retrieval service;
- agent profiles;
- Marketing Studio bindings;
- conversational assistant roles;
- CRM stage taxonomy;
- objection intelligence;
- metrics/cash foundation;
- handoffs/recommendations;
- outcome learning foundation.

- [ ] **Step 2: Update implementation status**

Add row:

- Area: `YUX Strategy Engine`
- Status: match actual implementation state.
- Routes: `/admin/strategy-engine`, plus affected Marketing Studio/CRM/Omnichannel surfaces.
- Operational notes: remote Supabase migration/probe confirmation is required before production claims.

- [ ] **Step 3: Update Marketing Studio doc**

Clarify:

- Marketing Studio agents remain specialized operational agents.
- Marketing Strategist profile can orchestrate them.
- Existing agent types are preserved.
- Publishing/activation still requires approval.

- [ ] **Step 4: Update CRM doc**

Clarify:

- SDR, Closer, Support and Retention assistants can coexist.
- Routing selects one assistant per inbound message.
- Conversation owner role prevents incoherent assistant switching.
- CRM Controller and Revenue Recovery use CRM tasks, objections, stage state, proposal events and metrics.

- [ ] **Step 5: Update sitemap/functionality map**

Add:

- Admin Strategy Engine route;
- assistant role configuration;
- Strategy Engine ingestion/retrieval/admin views;
- strategy recommendations/handoffs if surfaced.

- [ ] **Step 6: Run docs check**

```powershell
rg -n "Strategy Engine|Marketing Strategist|SDR|Closer|Revenue Recovery|Objection Intelligence|conversation_current_role|retrieval" docs
```

Expected: all new docs mention the feature consistently.

- [ ] **Step 7: Commit**

```powershell
git add docs/yux-strategy-engine.md docs/implementation-status.md docs/yux-marketing-studio-agentes.md docs/crm-lead-management.md docs/mapa-paginas-e-funcionalidades.md
git commit -m "docs: document yux strategy engine architecture"
```

---

## Validation Matrix

Run before considering implementation complete:

```powershell
cd frontend
npm run type-check
npm run test -- --runInBand
```

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest discover tests
```

```powershell
deno check supabase/functions/process-ai-message/index.ts
```

```powershell
node scripts/strategy-knowledge/validate-concept-cards.mjs scripts/strategy-knowledge/example-concept-cards.json
```

If Supabase CLI credentials are available:

```powershell
supabase db push
supabase db execute --file supabase/probes/20260611190000_yux_strategy_engine.sql
```

If remote credentials are unavailable, keep status as `implemented in repo, pending remote migration/probe confirmation`.

---

## Execution Order

Recommended order:

1. Task 1 - Strategy base schema, policies and commercial state.
2. Task 2 - Knowledge ingestion engine.
3. Task 3 - Retrieval service.
4. Task 5 - Profile policies and runtime guards.
5. Task 8 - Strategy context runtime and harness integration.
6. Task 6 - Metrics and cash foundation.
7. Task 7 - Objection Intelligence.
8. Task 9 - CRM Controller internal workflow.
9. Task 10 - Multi-assistant conversational routing.
10. Task 11 - Structured handoffs and recommendations.
11. Task 4 - Frontend types/service, can start after schema stabilizes.
12. Task 12 - Admin YUX Strategy Engine UI.
13. Task 13 - Outcome tracking and V2 learning foundation.
14. Task 14 - Documentation and status update.

Commit after each task. Do not start outcome-based optimization until outcomes are recorded consistently.

---

## Product Acceptance Criteria

The first version is ready when:

- Existing Marketing Studio agents still run with current harness behavior.
- Marketing Studio agent types are bound under `marketing_strategist` without being renamed or removed.
- PDF/source ingestion stores documents, pages, chunks, page assets, cards and embeddings.
- Retrieval service returns compact, profile-specific context and logs every query.
- SDR receives stage/SPIN/commercial qualification knowledge, not broad strategist context.
- Support does not receive sales-pressure or acquisition context by default.
- Conversation owner role prevents incoherent assistant switching.
- A client can have multiple active conversation assistants with different roles.
- `process-ai-message` chooses one assistant deterministically per inbound message.
- Commercial stage taxonomy separates lead, raised hand, opportunity, customer, non-client and lifecycle states.
- Objections become structured events, playbook items and offer/copy improvement suggestions.
- Metrics & Cash can calculate CAC, LTV, MROI, stuck opportunity value and recovery potential.
- Revenue Recovery can generate actions from inactive customers, lost proposals and non-clients.
- Recommendations are structured and log objective, audience, action, channel, owner, metric and next step.
- Handoffs are structured records, not free-form agent chat.
- Outcome events are stored for future learning.
- Admin YUX can inspect source documents, retrieval logs, profiles, skills, cards, bindings, objections, metrics, recommendations and outcomes.

## V2 Direction

After V1 is stable:

- Add profile/skill/card scorecards.
- Rank actions by historical outcome per segment and commercial stage.
- Suggest skill/card revisions from repeated failures.
- Add A/B testing for follow-up scripts, recovery campaigns and objection responses.
- Optimize context packs by cost and outcome quality.
- Consider fine-tuning only after enough high-quality, permissioned, labeled examples exist.
