from __future__ import annotations

import json
from dataclasses import dataclass, replace
from typing import Any, Callable

from .harness import Harness, filter_allowed_tools, select_model_route
from .llm_routing import RoutedLlmClient
from .providers import OpenRouterClient
from .runtime_store import InMemoryAgentRuntimeStore
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
        sources = [
            {
                "kind": kind,
                "id": item["id"],
                "version": item.get("version") or item.get("source_content_hash") or item.get("content_hash"),
            }
            for kind in ("concept_cards", "chunks", "assets")
            for item in context.get(kind, [])
            if isinstance(item, dict) and item.get("id")
        ]
        sources.extend({
            "kind": "company_strategy", "id": item["revisionId"], "version": item["revisionNumber"],
        } for item in company_strategy.get("selected", []))
        sources.extend({
            "kind": "portfolio", "id": item["id"], "version": item.get("updatedAt"),
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
            },
            "request": wire,
            "policyTools": filter_allowed_tools(agent, self.harness.tool_policies, self.state),
            "sources": sources,
            "coverage": {
                "companyStrategy": company_strategy.get("coverage"),
                "portfolio": portfolio.get("coverage"),
                "includesOperationalContext": bool(inputs.get("mission_context")),
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
        def transport(_url, _headers, payload, _method):
            preview["providerPayload"] = {key: value for key, value in payload.items() if key != "session_id"}
            return {
                "model": payload["model"],
                "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(synthetic)}}],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            }

        def simulated_client(provider_name):
            return OpenRouterClient(api_key="offline-preview", provider_name=provider_name, transport=transport)

        original_factory: Callable | None = self.harness.routed_client_factory
        configured = original_factory(self.route_key, self.state) if original_factory is not None else None
        if isinstance(configured, RoutedLlmClient):
            client = replace(configured, client_builder=lambda _: {
                key: simulated_client(key) for key in ("openrouter", "openai_direct")
            })
            route, _ = client.configuration()
            preview["attempts"] = route["attempts"]
        else:
            route = select_model_route(agent, self.harness.routes, self.state.get("routing_tier", "default"), self.state)
            client = simulated_client(route["provider"])
        result = client.chat_completion(**request)
        preview["providerFingerprint"] = stable_hash(preview["providerPayload"])
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
    preview.execute(**execution)
    return {
        "generation": "simulated",
        "retrieval": "lexical",
        "requests": requests,
    }
