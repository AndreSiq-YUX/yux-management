from __future__ import annotations

import json
from dataclasses import dataclass, replace
from typing import Any, Callable

from .campaign_launch import CampaignLaunchClarificationRequired
from .funnel_nurture import FunnelNurtureClarificationRequired
from .harness import Harness, filter_allowed_tools, select_model_route
from .llm_routing import RoutedLlmClient
from .mission_supervisor import MissionSupervisor
from .mission_prompt import planning_prompt_configuration
from .planning_budget import decision_from_wire
from .providers import OpenRouterClient, ProviderRequestError
from .runtime_store import InMemoryAgentRuntimeStore
from .source_rules import RequiredSourcesMissing
from .trace import stable_hash
from .workflow import StrategyWorkflowEngine


@dataclass
class _PreviewProvider:
    requests: list[dict[str, Any]]
    route_key: str
    state: dict[str, Any]
    harness: Harness

    def chat_completion(self, **request: Any) -> dict[str, Any]:
        agent = self.state["agent"]
        stage = self.state["stage_key"]
        inputs = self.state["context"]
        context = inputs["strategy_context"]
        company_strategy = inputs.get("company_strategy_context") or {}
        portfolio = inputs.get("portfolio_context") or {}
        coverage = inputs.get("context_coverage") or {}
        sources = [
            {
                "kind": kind,
                "id": item["id"],
                "version": item.get("publication_id") or item.get("version") or item.get("source_content_hash") or item.get("content_hash"),
                "scope": "contract" if item.get("document_id") else "organization" if item.get("source_scope") == "organization" else "methodology",
            }
            for kind in ("concept_cards", "chunks", "assets")
            for item in context.get(kind, [])
            if isinstance(item, dict) and item.get("id")
        ]
        sources.extend({
            "kind": "company_strategy", "id": item["revisionId"], "version": item["revisionNumber"], "scope": "organization",
        } for item in company_strategy.get("selected", []))
        sources.extend({
            "kind": "portfolio", "id": item["id"], "version": item.get("updatedAt"), "scope": "contract",
        } for item in portfolio.get("items", []))
        wire = {key: value for key, value in request.items() if key != "session_id"}
        preview = {
            "stage": stage,
            "profile": agent["agent_type"],
            "route": self.route_key,
            "fingerprint": stable_hash(wire),
            "versions": {
                "global": self.harness.global_prompts[agent["agent_type"]].get("prompt_version", 1),
                "profile": agent.get("prompt_version", 1),
                "organization": self.state.get("organization_prompt_version"),
            },
            "stageInstructionApplied": self.state.get("stage_instruction_applied", False),
            "request": wire,
            "policyTools": filter_allowed_tools(agent, self.harness.tool_policies, self.state),
            "sources": sources,
            "coverage": {
                "companyStrategy": company_strategy.get("coverage"),
                "portfolio": portfolio.get("coverage"),
                "includesOperationalContext": bool(inputs.get("mission_context")),
                **({"knowledge": {
                    "selected": coverage["customerKnowledge"],
                    "contractRequired": coverage.get("knowledgeContractRequired", False),
                }} if "customerKnowledge" in coverage else {}),
            },
        }
        if self.state["context"].get("mission_context"):
            synthetic = {
                "kind": "message",
                "reply": "Resposta de simulação.",
                "readiness": {"status": "needs_information", "knownFacts": [], "assumptions": [], "missing": []},
                "questions": [],
                "suggestedActions": [],
                "sourceRefs": [],
            }
        else:
            synthetic = {
                "analysis": "Decisão simulada do especialista.",
                "recommended_actions": [],
                "summary": "Síntese simulada.",
            }
        original_factory: Callable | None = self.harness.routed_client_factory
        configured = original_factory(self.route_key, self.state) if original_factory is not None else None
        provider = ""
        if not isinstance(configured, RoutedLlmClient):
            route = select_model_route(agent, self.harness.routes, self.state.get("routing_tier", "default"), self.state)
            provider = route["provider"]
        result = _capture_transport(preview, request, provider, configured, synthetic)
        self.requests.append(preview)
        return result


def preview_workflow(engine: StrategyWorkflowEngine, execution: dict[str, Any]) -> dict[str, Any]:
    if engine.harness is None:
        raise ValueError("agent_harness_not_configured")
    requests: list[dict[str, Any]] = []
    harness = replace(
        engine.harness,
        llm_client=None,
        provider_clients={},
        routed_client_factory=lambda key, state: _PreviewProvider(
            requests, key, state, engine.harness,
        ),
    )
    preview = replace(engine, store=InMemoryAgentRuntimeStore(), harness=harness)
    try:
        source_report = preview.execute(**execution).get("sourcePolicy")
    except RequiredSourcesMissing as error:
        source_report = error.report
    return {
        "generation": "simulated",
        "retrieval": "lexical",
        "requests": requests,
        **({"sourcePolicy": source_report} if source_report is not None else {}),
    }

def _capture_transport(
    preview: dict[str, Any],
    request: dict[str, Any],
    provider: str,
    configured: Any,
    synthetic: dict[str, Any],
) -> dict[str, Any]:
    def transport(_url, _headers, payload, _method):
        preview["providerPayload"] = {key: value for key, value in payload.items() if key != "session_id"}
        return {
            "model": payload["model"],
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(synthetic)}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

    def simulated_client(provider_name):
        return OpenRouterClient(api_key="offline-preview", provider_name=provider_name, transport=transport)

    if isinstance(configured, RoutedLlmClient):
        client = replace(configured, client_builder=lambda _: {
            key: simulated_client(key) for key in ("openrouter", "openai_direct")
        })
        route, _ = client.configuration()
        preview["attempts"] = route["attempts"]
    else:
        client = simulated_client(provider)
    result = client.chat_completion(**request)
    preview["providerFingerprint"] = stable_hash(preview["providerPayload"])
    return result


def preview_mission_supervisor(supervisor: MissionSupervisor, value: dict[str, Any]) -> dict[str, Any]:
    preview = {"generation": "simulated", "retrieval": "verified_sources", "requests": []}
    if budget := value.get("planning_budget"):
        decision = decision_from_wire(budget)
        if not decision.allowed:
            return {**preview, "blockedReason": decision.reason}

    route, request = supervisor.prepare_request(value)
    configuration = planning_prompt_configuration(value, route.selected_pack_keys)
    value = {**value, "mission_prompt": configuration}
    instructions = (configuration or {}).get("instructions", {})
    organization_version = (configuration or {}).get("version")
    editable = "radar_prospecting" not in route.selected_pack_keys
    wire = {key: item for key, item in request.items() if key != "session_id"}
    context = value.get("strategy_context") or {}
    known = {
        str(item.get("id") or item.get("sourceId")): item
        for key in ("knowledgeItems", "strategyItems")
        for item in context.get(key, [])
        if isinstance(item, dict)
    }
    sources = [
        {"id": source, "kind": known.get(source, {}).get("kind", "verified"),
         "version": known.get(source, {}).get("version")}
        for source in value.get("allowed_source_ids", [])
    ]
    stage = {
        "stage": "planner",
        "profile": supervisor.profile.key,
        "route": supervisor.profile.key,
        "fingerprint": stable_hash(wire),
        "versions": {"global": 1, "profile": supervisor.profile.version, "organization": organization_version},
        "stageInstructionApplied": "planner" in instructions,
        "editable": editable,
        "request": wire,
        "policyTools": [item["key"] for item in value.get("capabilities", [])],
        "sources": sources,
        "selectedPacks": route.selected_pack_keys,
    }
    _capture_transport(stage, request, supervisor.profile.provider, supervisor.client, {})
    preview["requests"].append(stage)
    for workflow, specialist in supervisor.selected_specialists(route.selected_pack_keys).items():
        try:
            specialist.check_requirements(value)
        except (FunnelNurtureClarificationRequired, CampaignLaunchClarificationRequired) as error:
            preview["missingSpecialistInputs"] = {"workflow": workflow, "fields": error.question_keys}
            break
        for node, _ in specialist.NODES:
            stage_key = f"{workflow}.{node}"
            request = specialist.prepare_request(node, value)
            wire = {key: item for key, item in request.items() if key != "session_id"}
            client = specialist.client
            specialist_stage = {
                "stage": stage_key,
                "profile": node,
                "route": client.use_case if isinstance(client, RoutedLlmClient) else specialist.profile.key,
                "fingerprint": stable_hash(wire),
                "versions": {"global": 1, "profile": specialist.profile.version, "organization": organization_version},
                "stageInstructionApplied": stage_key in instructions,
                "editable": editable,
                "request": wire,
                "policyTools": [],
                "sources": sources,
                "conditional": True,
            }
            preview["requests"].append(specialist_stage)
            try:
                _capture_transport(specialist_stage, request, specialist.profile.provider, client, {})
            except ProviderRequestError:
                specialist_stage["unavailableRoute"] = True
                return preview
    return preview
