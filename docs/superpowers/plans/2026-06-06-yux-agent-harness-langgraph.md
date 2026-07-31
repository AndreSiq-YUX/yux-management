# YUX Agent Harness And LangGraph Runtime Implementation Plan

Goal: add the execution foundation for Marketing Studio agents, with prompt governance, workflow runs, model routing, tool permissions, budget controls and a provider-neutral Python worker.

Scope:

- keep global system prompts as YUX-admin managed definitions per predefined agent template;
- keep each contract agent editable with its own base prompt, prompt config, context policy, model parameters, tools and quality gates;
- store workflow, node and edge definitions for predefined Marketing Studio flows;
- store workflow, agent and tool runs with cost, credit, status and error telemetry;
- add model routing, budget and tool policy tables guarded by RLS;
- add typed frontend contracts, service methods and an internal operational panel;
- add a Python worker package that uses LangGraph when installed and a deterministic fallback graph for local tests;
- keep live LLM/Jina/WordPress/tool execution out of scope for this phase.

Prompt layering:

1. YUX global system prompt from `marketing_agent_global_prompts`, editable only by internal YUX admins.
2. Agent base prompt and prompt configuration from `marketing_agents`, editable by allowed client/YUX configurators.
3. Runtime context assembled from settings, brand profile, products/services, content, calendar and knowledge matches.
4. Tool/model/budget policies applied before a node runs.

Acceptance:

- migration and probe pass remotely;
- global system prompts are not exposed to ordinary portal reads;
- client/YUX configurators can manage agent-specific prompts and defaults;
- workflow, agent and tool run logs are available internally;
- Python worker tests prove prompt composition, model routing, tool filtering, budget guard and graph execution;
- focused frontend tests, type-check and build pass.
