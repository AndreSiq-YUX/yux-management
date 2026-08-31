from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from hashlib import sha256
from typing import Any

from .harness import Harness
from .providers import JinaClient, OpenRouterClient
from .retrieval import StrategyRetrievalService
from .runtime_store import AgentRuntimeStore
from .workflow import StrategyWorkflowEngine
from .customer_context import CustomerContextService
from .embedding import QueryEmbeddingService
from .mission_supervisor import MissionSupervisor
from .model_profiles import ModelProfile


DEFAULT_MODEL = "openai/gpt-4.1-mini"


def build_mission_supervisor(
    store: AgentRuntimeStore,
    llm_client: OpenRouterClient | None = None,
) -> MissionSupervisor:
    routes = _active(store.list("model_routing_rules", limit=500))
    route = next(
        (
            item for item in routes
            if item.get("agent_type") == "mission_supervisor"
            and not item.get("organization_id")
            and item.get("routing_tier", "default") == "default"
        ),
        {},
    )
    model = str(route.get("model_name") or os.getenv("OPENROUTER_MISSION_SUPERVISOR_MODEL") or os.getenv("OPENROUTER_DEFAULT_MODEL") or DEFAULT_MODEL)
    profile = ModelProfile(
        key="mission_supervisor",
        version=int(route.get("version") or 1),
        provider=str(route.get("provider") or "openrouter"),
        model=model,
        temperature=float(route.get("temperature") if route.get("temperature") is not None else 0),
        max_tokens=int(route.get("max_output_tokens") or 2400),
        timeout_seconds=int(route.get("timeout_seconds") or 45),
        max_cost_brl=Decimal(str(route.get("max_cost_per_run") or "0")),
        fallback_profile_keys=[],
        prompt_bundle_hash=sha256(b"yux-mission-supervisor-v1").hexdigest(),
    )
    return MissionSupervisor(llm_client or OpenRouterClient.from_env(), profile)


def _active(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(record) for record in records if record.get("status", "active") == "active"]


def _latest_by(records: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for record in records:
        record_key = str(record.get(key) or "").strip()
        if not record_key:
            continue
        current = latest.get(record_key)
        if current is None or int(record.get("version") or 1) > int(current.get("version") or 1):
            latest[record_key] = dict(record)
    return latest


@dataclass
class RuntimeStrategyKnowledgeStore:
    store: AgentRuntimeStore
    candidate_limit: int = 200

    @staticmethod
    def _normalize_profile_access(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for record in records:
            item = dict(record)
            # Compatibility with early imported cards that used target_profiles.
            if not item.get("allowed_agent_profile_keys") and item.get("target_profiles"):
                item["allowed_agent_profile_keys"] = list(item["target_profiles"])
            normalized.append(item)
        return normalized

    def list_cards(self) -> list[dict[str, Any]]:
        return self._with_latest_embedding(
            self._normalize_profile_access(
                self.store.list("yux_strategy_concept_cards", limit=self.candidate_limit)
            ),
            self.store.list("yux_strategy_card_embeddings", limit=self.candidate_limit * 3),
            "card_id",
        )

    def list_chunks(self) -> list[dict[str, Any]]:
        return self._with_latest_embedding(
            self._normalize_profile_access(
                self.store.list("yux_strategy_source_chunks", limit=self.candidate_limit)
            ),
            self.store.list("yux_strategy_chunk_embeddings", limit=self.candidate_limit * 3),
            "chunk_id",
        )

    @staticmethod
    def _with_latest_embedding(
        records: list[dict[str, Any]],
        embeddings: list[dict[str, Any]],
        foreign_key: str,
    ) -> list[dict[str, Any]]:
        latest: dict[str, dict[str, Any]] = {}
        for embedding in embeddings:
            record_id = str(embedding.get(foreign_key) or "")
            if not record_id:
                continue
            current = latest.get(record_id)
            if current is None or str(embedding.get("created_at") or "") > str(current.get("created_at") or ""):
                latest[record_id] = embedding
        return [
            {
                **record,
                **(
                    {
                        "embedding_values": latest[str(record.get("id"))].get("embedding_values")
                        or latest[str(record.get("id"))].get("embedding"),
                        "embedding_content_hash": latest[str(record.get("id"))].get("content_hash"),
                        "embedding_model": latest[str(record.get("id"))].get("embedding_model"),
                    }
                    if str(record.get("id")) in latest
                    else {}
                ),
            }
            for record in records
        ]

    def list_assets(self) -> list[dict[str, Any]]:
        return self._normalize_profile_access(
            self.store.list("yux_strategy_source_assets", limit=self.candidate_limit)
        )

    def log_retrieval_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.store.insert("yux_strategy_retrieval_queries", payload)


def _build_agents(profiles: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    agents: dict[str, dict[str, Any]] = {}
    for profile in profiles:
        profile_key = str(profile.get("profile_key") or "").strip()
        if not profile_key:
            continue
        agents[profile_key] = {
            "id": profile.get("id"),
            "agent_type": profile_key,
            "name": profile.get("name") or profile_key,
            "base_prompt": profile.get("purpose") or profile.get("description") or "Execute a estrategia YUX configurada.",
            "allowed_tools": list(profile.get("allowed_tools") or []),
            "forbidden_actions": list(profile.get("forbidden_actions") or []),
            "approval_policy": dict(profile.get("approval_policy") or {}),
            "context_policy": dict(profile.get("default_context_policy") or {}),
            "output_schema": dict(profile.get("output_schema") or {}),
            "max_context_chars": int(profile.get("max_context_chars") or 5000),
            "max_cards": int(profile.get("max_cards") or 8),
            "max_chunks": int(profile.get("max_chunks") or 4),
        }
    return agents


def _build_prompts(
    agents: dict[str, dict[str, Any]],
    records: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    prompts = {str(record["agent_type"]): dict(record) for record in records if record.get("agent_type")}
    for profile_key in agents:
        prompts.setdefault(
            profile_key,
            {
                "agent_type": profile_key,
                "system_prompt": (
                    "Voce e um agente interno da YUX. Siga o contrato de saida solicitado, use somente "
                    "as evidencias fornecidas e nunca invente fatos, consentimento ou compromissos comerciais."
                ),
                "prompt_version": 1,
                "default_context_policy": {},
                "default_quality_gates": {},
                "status": "active",
            },
        )
    return prompts


def _build_routes(agents: dict[str, dict[str, Any]], records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    routes = [dict(record) for record in records]
    configured_global = {
        str(route.get("agent_type"))
        for route in routes
        if route.get("agent_type") and not route.get("organization_id") and route.get("routing_tier", "default") == "default"
    }
    default_model = os.getenv("OPENROUTER_DEFAULT_MODEL", DEFAULT_MODEL)
    for profile_key in agents:
        if profile_key not in configured_global:
            routes.append(
                {
                    "agent_type": profile_key,
                    "routing_tier": "default",
                    "provider": "openrouter",
                    "model_name": default_model,
                    "max_input_tokens": 16000,
                    "max_output_tokens": 1600,
                    "temperature": 0.2,
                    "max_cost_per_run": 0,
                    "status": "active",
                }
            )
    return routes


def _profile_tool_policies(
    records: list[dict[str, Any]],
    agents: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    profile_key_by_id = {str(agent.get("id")): key for key, agent in agents.items() if agent.get("id")}
    normalized = []
    for record in records:
        item = dict(record)
        profile_key = profile_key_by_id.get(str(item.get("profile_id")))
        if profile_key:
            item["agent_type"] = profile_key
        normalized.append(item)
    return normalized


def build_strategy_workflow_engine(
    store: AgentRuntimeStore,
    llm_client: OpenRouterClient | None = None,
) -> StrategyWorkflowEngine:
    profiles = _active(store.list("yux_strategy_agent_profiles", limit=200))
    agents = _build_agents(profiles)
    prompts = _build_prompts(
        agents,
        _active(store.list("marketing_agent_global_prompts", limit=200)),
    )
    routes = _build_routes(agents, _active(store.list("model_routing_rules", limit=500)))
    tool_policies = _active(store.list("marketing_agent_tool_policies", limit=500))
    tool_policies.extend(
        _profile_tool_policies(store.list("yux_strategy_profile_tool_policies", limit=500), agents)
    )
    harness = Harness(
        global_prompts=prompts,
        routes=routes,
        tool_policies=tool_policies,
        budget_policies=_active(store.list("agent_budget_policies", limit=500)),
        llm_client=llm_client or OpenRouterClient.from_env(),
    )
    embedding_service = QueryEmbeddingService(JinaClient.from_env())
    retrieval = StrategyRetrievalService(
        RuntimeStrategyKnowledgeStore(store),
        embedding_service=embedding_service,
    )
    workflows = _latest_by(_active(store.list("strategy_workflow_specs", limit=200)), "workflow_key")
    autonomy_policies = _active(store.list("agent_autonomy_policies", limit=1000))
    return StrategyWorkflowEngine(
        store=store,
        harness=harness,
        agent_profiles=agents,
        retrieval_service=retrieval,
        customer_context_service=CustomerContextService(store, embedding_service=embedding_service),
        workflow_specs=workflows,
        default_autonomy_policies=autonomy_policies,
    )
