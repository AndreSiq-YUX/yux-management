# YUX Conversational Mission + Existing Harness Integration — Delta Design

**Status:** Proposed
**Date:** 2026-08-31
**Parent spec:** `docs/superpowers/specs/2026-08-22-yux-autonomous-mission-supervisor-design.md`
**Existing Harness reference:** `docs/yux-agent-harness-runtime.md`
**Existing Action Engine reference:** `docs/yux-action-engine-implementation.md`

## 1. Decision

The conversational Mission experience will integrate the existing YUX Agent Harness with the existing Action Engine. It will not create a second Harness, a second knowledge base, a parallel planner or an LLM with direct mutation tools.

The existing responsibilities remain:

- the **YUX Agent Harness** retrieves and applies YUX operating doctrine, approved Strategy Pack content, global prompts, model routes, tool policies, customer context and approved customer knowledge;
- the **Mission Supervisor inside the Harness** interprets intent and proposes typed clarification or a typed plan;
- the **Action Engine** owns entitlement, capability catalogs, immutable context snapshots, deterministic compilation, approval, execution, economics, resource ownership and audit;
- domain modules own their data and commands;
- the **Mission Conversation** is a durable user experience and orchestration layer between the person, the existing Harness and the Action Engine.

This document specifies only the missing integration, conversation lifecycle and product feedback loop. All safety, autonomy, Action Pack, execution and learning requirements from the parent spec remain normative.

## 2. Evidence from the current implementation

### 2.1 Already implemented and reused

| Existing capability | Current implementation | Decision |
|---|---|---|
| Global YUX prompts, model routes, tool and budget policies | `workers/marketing-studio-agent-runtime/yux_agent_runtime/harness.py`, `runtime_factory.py` | Reuse unchanged; extend through versioned configuration only |
| YUX doctrine and Strategy Pack retrieval | `retrieval.py`, `RuntimeStrategyKnowledgeStore` | Reuse as the only selector of YUX strategic knowledge |
| Customer profile, brand, products and published knowledge retrieval | `customer_context.py` | Reuse as the only selector of customer knowledge; enrich its safe output where fields already exist |
| Workflow traces and controlled learning signals | `workflow.py`, `trace.py` | Reuse for every conversational turn |
| Mission Supervisor and bounded specialists | `mission_supervisor.py`, `campaign_launch.py`, `funnel_nurture.py` | Reuse for plan proposal; do not expose mutation tools |
| Pydantic-to-JSON-Schema-to-TypeScript Mission wire contract | `mission_contracts.py`, `mission-wire.schema.json`, generated TS | Extend rather than duplicate |
| Action Packs, deterministic compiler and exact hashes | `backend/src/modules/action-engine/*` | Reuse unchanged as the execution trust boundary |
| Context snapshots, approvals, execution ledger and economics | Action Engine tables and repositories | Reuse; add conversation provenance |
| Campaign, funnel and nurture artifacts | existing specialists and capabilities | Reuse; surface them in conversation and Mission Room |
| Versioned Recipes and sandbox fixtures | existing Action Engine recipe implementation | Reuse as optional conversation suggestions, never as a separate intake path |

### 2.2 Integration gaps found in code

1. `build_strategy_workflow_engine()` wires the full Harness context pipeline, but `build_mission_supervisor()` creates the planner separately. Mission planning therefore uses the Supervisor model while bypassing the full Harness workflow and its customer/strategy retrieval.
2. `backend/src/modules/action-engine/context-builder.ts` independently queries company profiles, published knowledge and YUX concept cards. This duplicates part of `CustomerContextService` and `StrategyRetrievalService`, and currently omits brand profiles, product/service detail and curated semantic chunks from Mission context.
3. Strategy-card retrieval in the Harness can rank by vectors, but the production store currently returns the raw cards/chunks without joining their embedding records; the workflow also does not supply a strategy query embedding.
4. The frozen Action Engine `sourceIds` currently contains customer knowledge source IDs only. YUX doctrine items are hashed in `strategyItems` but cannot be cited through the same allowed-source boundary.
5. `POST /missions/intents` immediately creates a draft Mission from a form and returns without qualification or planning. The user receives no natural confirmation of what the agent understood or what happens next.
6. The current clarification model permits only one grouped round. That is appropriate for final plan compilation, but not for a natural intake conversation that may need several short turns before the Mission exists.
7. Mission detail renders empty execution, economics and outcome panels before a plan exists, and exposes internal values such as `supervisor_interpreted_outcome`.
8. The client Mission list uses workspace-aware write permission, while `PortalMissionDetailPage.tsx` still uses only the client workspace role.

## 3. Product outcome

A person opens Missions and starts with a natural-language request such as:

> Quero criar uma campanha para captar pequenas empresas de Londrina para o serviço X.

The agent must:

1. acknowledge and restate the intended business outcome;
2. retrieve relevant YUX doctrine and approved customer context through the existing Harness;
3. inspect authoritative contract modules, integrations and live state supplied by the Action Engine;
4. distinguish known facts, safe defaults and missing decisions;
5. ask at most three grouped questions in one agent turn, using natural language;
6. suggest only tools and workflows available to that customer;
7. deep-link missing company, brand, product, knowledge or integration information to its correction screen;
8. continue until a plan-ready brief is explicit and confirmed;
9. create/attach the Action Mission, compile a governed plan and render its plain-language impact card inside the conversation;
10. allow the user to approve or request changes in the same flow;
11. transition to a Mission Room that shows what was requested, understood, approved, created, running, blocked and completed.

The user must never have to infer whether a Mission was created or whether the system is working.

## 4. Trust and ownership boundaries

```text
Person
  -> Mission Conversation (durable messages and UI state)
      -> Existing Harness workflow
          -> YUX Strategy Retrieval
          -> CustomerContextService
          -> global prompts/model/tool/budget policies
          -> typed conversational response
      -> Action Engine context verifier
          -> contract entitlements
          -> provider/integration readiness
          -> live domain baselines
          -> allowed source/hash verification
      -> Existing Mission Supervisor
          -> typed clarification or plan proposal
      -> Action Engine compiler/approval/executor
          -> domain commands and evidence
```

Rules:

- retrieved content is untrusted evidence and never grants tools, modules, permissions, budget or consent;
- the Harness never creates an Action Engine Mission row, approves a plan or performs a domain mutation;
- the Action Engine never invents marketing strategy and does not run a parallel RAG selector;
- Action Engine SQL may verify that a returned knowledge reference is published, tenant-safe and hash-equal, but must not independently rerank or reinterpret that content;
- external effects remain impossible before plan approval and final capability preflight.

## 5. One context pipeline, two authority classes

### 5.1 Knowledge context owned by the Harness

The existing Harness retrieves:

- YUX doctrine: concept cards, reviewed source chunks, playbooks, rubrics and prompt rules;
- customer company profile;
- active contract-scoped brand profile;
- active products/services, including audience, value proposition, proofs, objections and CTA;
- approved/published customer knowledge and curated semantic chunks;
- approved customer-specific agent safety rules;
- approved Mission learning memory when relevant.

The result is a typed `MissionKnowledgeContext` with namespaced source references:

```ts
type MissionSourceRef = {
  ref: `yux:${string}` | `customer:${string}` | `memory:${string}`
  kind: 'strategy_card' | 'strategy_chunk' | 'knowledge_source' | 'knowledge_chunk' | 'mission_memory'
  id: string
  version: string
  contentHash: string
  visibility: 'internal_only' | 'client_safe' | 'internal' | 'external' | 'both'
  title: string
  displayMode: 'named' | 'generic' | 'hidden'
}

type MissionKnowledgeContext = {
  profileKey: 'growth_strategist'
  company: Record<string, unknown>
  brand: Record<string, unknown>
  products: Array<Record<string, unknown>>
  strategyItems: Array<Record<string, unknown>>
  customerKnowledgeItems: Array<Record<string, unknown>>
  approvedMemoryItems: Array<Record<string, unknown>>
  sources: MissionSourceRef[]
  retrievalTraceId: string
  contextHash: string
}
```

The exact content remains bounded by the existing Harness context budgets. Raw books or whole uploaded documents never enter a turn. Future The Black Book content follows the already designed ingestion, review and publication path; it requires no Action Engine-specific ingestion path.

The Action Engine derives an immutable `audience` (`internal_operator` or `client_user`) from the authenticated actor and workspace; the model cannot choose it. Internal YUX doctrine may guide a client-facing answer when its profile binding permits that use, but an `internal_only` source is never quoted, previewed or named to the client. Its display projection is the generic label “Metodologia YUX” or hidden according to policy. Customer source visibility follows the same audience-aware projection. Retrieval access and user-visible disclosure are separate checks.

### 5.2 Operational context owned by the Action Engine

The Action Engine supplies a typed, read-only `MissionOperationalContext`:

- contract modules and feature flags;
- actor permissions relevant to the current workspace;
- available Action Packs and exact versions;
- capability manifest and hashes;
- connected providers/channels and connection health;
- live CRM, automation, campaign, landing-page and metric baselines;
- budget/deadline/autonomy limits chosen so far;
- resource-claim conflicts and correction links.

The Harness may recommend within this envelope but cannot expand it.

### 5.3 Context readiness

The Harness returns a deterministic-looking, typed coverage report that the Action Engine verifies against pack readiness rules:

```ts
type MissionContextReadiness = {
  status: 'needs_information' | 'needs_configuration' | 'ready_for_brief_confirmation' | 'ready_for_plan'
  knownFacts: Array<{ key: string; value: unknown; sourceRef: string }>
  assumptions: Array<{ key: string; value: unknown; sourceRef?: string }>
  missing: Array<{
    key: string
    category: 'company' | 'brand' | 'offer' | 'audience' | 'budget' | 'deadline' | 'integration' | 'permission' | 'consent'
    reason: string
    requiredFor: string[]
    correctionHref?: string
  }>
}
```

The model proposes the coverage report; deterministic validators own entitlement, integration, capability, budget and required-pack checks. A model cannot mark those checks ready by assertion.

`correctionHref` is not trusted model output. The Action Engine maps a validated blocker category/key to a server-owned allowlist of internal routes and discards any arbitrary URL returned by the Harness.

## 6. Durable conversation domain

### 6.1 Conversation state machine

```text
collecting_context
  -> awaiting_user
  -> collecting_context
  -> brief_confirmation
  -> planning
  -> awaiting_plan_approval
  -> converted

Any non-terminal state -> blocked | cancelled
awaiting_plan_approval -> awaiting_user (changes requested)
```

Definitions:

- `collecting_context`: an accepted user turn is queued or the Harness is responding;
- `awaiting_user`: the agent asked questions or offered choices;
- `brief_confirmation`: required context is present and the agent asks the user to confirm the interpreted brief;
- `planning`: an Action Mission is attached and the existing plan job is running;
- `awaiting_plan_approval`: the compiled plan and approval exist and are rendered in the conversation;
- `converted`: the approved plan is now managed in the Mission Room;
- `blocked`: a recoverable system/configuration issue includes a human-readable reason and correction action;
- `cancelled`: user ended intake before approval.

The Action Mission is created only after the brief is confirmed. This prevents half-filled draft Missions from appearing as if work had started. The conversation remains linked to the Mission and is visible from the Mission Room.

### 6.2 Persistence

Add:

```text
action_mission_conversations
  id, organization_id, contract_id, mission_id nullable, status,
  title, current_brief jsonb, context_readiness jsonb,
  last_context_hash, last_harness_run_id, version,
  created_by, created_at, updated_at, completed_at nullable

action_mission_conversation_messages
  id, organization_id, conversation_id, sequence,
  actor_type user|agent|system, message_kind text|question|brief|plan|status|error,
  content, structured_payload jsonb, source_refs jsonb,
  client_message_id nullable, harness_run_id nullable,
  created_by nullable, created_at
```

Requirements:

- messages are append-only;
- `(conversation_id, sequence)` is unique;
- `(conversation_id, client_message_id)` is unique when supplied;
- every update uses optimistic conversation `version`;
- RLS follows `private.rls_can_access_organization(organization_id)`;
- messages contain safe display content and references, not hidden chain-of-thought or provider credentials;
- Mission deletion/cancellation does not erase the audit conversation inside the retention window.

## 7. Wire contracts and APIs

### 7.1 Pydantic remains the wire-contract source of truth

Extend the existing Mission wire schema generation with:

- `MissionConversationTurnRequestWire`;
- `MissionConversationTurnResponseWire`;
- `MissionSourceRefWire`;
- `MissionContextReadinessWire`;
- `MissionBriefWire`;
- `MissionSuggestedActionWire`.

TypeScript consumes generated types and runtime-validates the response. CI must fail if generated artifacts drift.

### 7.2 Harness endpoint

`POST /missions/conversations/turn`

Input:

- tenant identifiers;
- immutable actor audience (`internal_operator` or `client_user`);
- conversation identifier;
- current user message;
- bounded recent transcript plus deterministic rolling summary;
- current brief;
- authoritative operational context from the Action Engine;
- allowed Action Pack summaries and source-ref namespace rules.

Processing:

1. validate tenant;
2. execute the existing `StrategyWorkflowEngine` using `growth_strategist` and a server-owned `mission_intake_conversation` workflow;
3. reuse `StrategyRetrievalService`, `CustomerContextService`, prompts, routing, policies, traces and context budgets;
4. validate the typed conversation response;
5. return source refs, context hash, trace ID and token usage;
6. never persist Action Engine rows or perform effects.

The existing `/missions/plan` endpoint remains the plan proposal boundary. At planning time it receives the exact verified/frozen knowledge context produced by the conversation plus current operational state.

### 7.3 Action Engine APIs

- `POST /api/action-engine/mission-conversations`
  - creates a conversation and first user message;
  - returns `202` with conversation status;
  - queues `action-engine.processMissionConversation`.
- `GET /api/action-engine/mission-conversations/:id?organizationId=...`
  - returns conversation, ordered messages and linked Mission summary.
- `POST /api/action-engine/mission-conversations/:id/messages`
  - appends one user turn with `expectedVersion` and `clientMessageId`;
  - returns `202` and queues processing.
- `POST /api/action-engine/mission-conversations/:id/confirm-brief`
  - validates the exact brief hash, creates the Action Mission idempotently and queues existing plan compilation.
- `POST /api/action-engine/mission-conversations/:id/cancel`
  - cancels intake if no execution has started.

Existing plan approval endpoints remain authoritative. The chat's Approve button calls the same immutable plan/approval command used by the Mission Room.

## 8. Conversational behavior

### 8.1 Response contract

Each agent turn contains:

- natural response text;
- what the agent understood;
- known context and cited sources;
- zero to three grouped questions;
- suggested actions limited to the operational envelope;
- readiness status and correction links;
- updated structured brief;
- next allowed user actions.

Questions must not ask for data already found in approved context. Defaults must state their source. The user can accept a default, change it or open the linked configuration screen.

### 8.2 Conversation limits

- maximum three questions in one agent turn;
- maximum six unconfirmed intake turns by default;
- after six turns, unresolved required data becomes a blocker with correction actions or a human-review option;
- repeated questions with the same key are forbidden unless the user contradicted the previous answer;
- every model turn is budgeted and traced;
- transient runtime failure produces a retryable message without losing the accepted user message.

The existing one-round clarification limit still applies after formal planning begins. Intake conversation should resolve normal ambiguity before that boundary.

### 8.3 Suggestions based on the contract

The agent may say:

- “Seu plano tem CRM e Automações; posso estruturar o funil e preparar a nutrição.”
- “Campanhas pagas não estão habilitadas neste contrato; posso preparar o funil agora ou você pode solicitar a ativação de Campanhas.”
- “A conexão do Meta Ads está ausente; conecte-a aqui para que o plano possa incluir publicação pausada.”

It may not suggest a capability as executable when the module, permission, connection or Action Pack is unavailable.

## 9. UX wireflow

### 9.1 Missions home

- primary action: **Conversar com o agente**;
- secondary area: suggested Recipe prompts based on available modules;
- active conversations appear above the Mission portfolio with explicit labels such as “Aguardando sua resposta” or “Preparando plano”;
- only confirmed briefs become portfolio Missions.

### 9.2 Conversation workspace

The workspace contains:

- message thread;
- composer with send/retry state;
- compact “Contexto usado” drawer with customer and YUX sources;
- cards for missing information with correction deep-links;
- suggested quick replies;
- a live brief summary that updates without replacing conversation;
- a plan impact card when planning completes;
- explicit states: message accepted, consulting knowledge, checking tools, preparing plan, plan ready, approval recorded.

Technical hashes appear only under **Prova técnica**.

### 9.3 Plan card inside chat

The card says, in user language:

- what will be created or changed;
- what will remain draft/paused;
- channels and population affected;
- estimated execution/media cost and human effort;
- required approvals;
- assumptions and material risks;
- knowledge sources used;
- buttons: **Aprovar plano**, **Pedir alterações**, **Ver detalhes técnicos**.

### 9.4 Mission Room

Before plan approval, irrelevant result metrics are hidden. The top of the page answers:

1. What did I ask for?
2. What did the agent understand?
3. What is happening now?
4. What needs my decision?
5. What has already been created and where can I open it?

The activity feed is synthesized from existing Mission domain events, plan approvals, action runs and artifact projections. Created CRM, campaign, landing-page, template, sequence and automation artifacts have direct links to their domain screens.

## 10. Compatibility and migration

- existing Action Missions remain readable and executable;
- the legacy `POST /missions/intents` route remains temporarily available for internal tests but is no longer called by the new UI;
- existing `action_mission_context_snapshots` stay valid;
- new snapshots add namespaced source refs and a Harness retrieval trace without rewriting prior rows;
- the current Mission Supervisor planner, compiler, packs, approval endpoint and executor remain in place;
- legacy draft Missions receive a clear “Complete o pedido” action that opens a conversation prefilled from their goal instead of displaying an empty cockpit.

## 11. Security, privacy and NFRs

- tenant validation at browser API, Action Engine repository, Harness API and Harness store;
- source refs and hashes verified before entering an immutable snapshot;
- retrieved prompt injection remains data, never instruction;
- no secrets, raw credentials, hidden reasoning or unrestricted transcripts in telemetry;
- conversational turn p95 target: 12 seconds; hard timeout: 60 seconds;
- accepted user message must be durably visible within 500 ms even while processing continues;
- plan jobs remain asynchronous and survive process restart;
- conversation availability target follows Action Engine API SLO; Harness outage creates a retryable blocked state, not a lost message;
- transcript retention follows the existing Mission retention policy, with configurable redaction/export;
- one active processing job per conversation version;
- cost and token usage recorded per turn and included in Mission economics once a conversation converts.

## 12. Rollout

### Release C0 — Correct current feedback and permissions

- fix workspace-aware write permission on Mission detail;
- replace internal enum copy;
- show an explicit next action for legacy draft Missions;
- hide empty result/economics sections until meaningful.

### Release C1 — Harness context bridge

- typed conversation wire contract;
- one Harness-owned knowledge retrieval path for Missions;
- richer customer product/brand context;
- namespaced citations and verified hashes;
- context coverage diagnostics and adversarial retrieval tests.

### Release C2 — Durable conversational intake

- conversation/message persistence;
- asynchronous turn processor;
- chat workspace, status feedback, quick replies and deep-links;
- brief confirmation before Mission creation.

### Release C3 — Plan and approval in conversation

- attach/create Mission after brief confirmation;
- invoke existing planner/compiler;
- render decision summary in chat;
- approve/request changes through existing approval commands.

### Release C4 — Mission Room and artifact continuity

- owner-first Mission status header;
- activity feed;
- artifact deep-links and provenance badges in destination modules;
- restore/retry states and notification integration.

### Release C5 — Regression, rollout and removal of legacy intake

- golden conversational Missions;
- load, security, tenant and model-regression gates;
- staged contract/tenant rollout;
- remove legacy form only after usage and rollback criteria pass.

## 13. Acceptance criteria

1. A Mission conversation demonstrably uses both a published YUX Strategy item and tenant-approved customer knowledge when relevant, with exact source refs and hashes.
2. No Action Engine Mission path independently reranks YUX/customer knowledge after C1; it only verifies and freezes Harness-selected items.
3. A tenant cannot retrieve, cite or display another tenant's profile, brand, products, knowledge, messages or Mission.
4. The agent does not ask for an ICP, offer or brand rule already present in approved customer context.
5. Missing required information yields a human-readable explanation and correction deep-link.
6. Suggestions are the intersection of contract modules, connected tools, Action Packs, permissions and policy.
7. A user message remains visible and retryable if the Harness or queue fails.
8. No portfolio Mission appears before brief confirmation.
9. Confirming the brief creates exactly one Mission under retries and concurrent requests.
10. The plan shown in chat is the same immutable plan revision and approval subject accepted by the existing Action Engine endpoint.
11. Before approval, no external effect occurs.
12. After approval, each created artifact appears in the Mission Room with status, evidence and destination deep-link.
13. Technical hashes are available but never replace plain-language impact copy.
14. Conversation turns, context retrieval, planning and execution costs are attributable to the Mission.
15. Golden tests cover campaign launch, funnel+nurture, revenue recovery, missing brand, missing offer, missing integration, unavailable module, prompt injection and cross-tenant isolation.

## 14. Explicit non-goals

- building another Harness, vector store, content ingestion flow or general-purpose autonomous agent;
- giving the conversation model direct Action Engine tools;
- allowing free-form DAGs outside published Action Packs;
- automatically publishing new YUX doctrine or customer knowledge from a conversation;
- replacing existing domain modules, approval commands, Mission compiler or executor;
- treating future The Black Book ingestion as part of this delivery. Once published through the existing Harness pipeline, it becomes available automatically according to profile bindings and visibility.
