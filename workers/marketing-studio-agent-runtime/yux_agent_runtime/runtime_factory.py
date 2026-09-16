from __future__ import annotations

import os
import base64
from dataclasses import dataclass
from decimal import Decimal
from hashlib import sha256
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .harness import Harness
from .providers import OpenRouterClient, ProviderAuthorizationError, ProviderAvailabilityError
from urllib.parse import urlparse
from .llm_routing import RoutedLlmClient, resolve_route
from .retrieval import StrategyRetrievalService
from .runtime_store import AgentRuntimeStore
from .workflow import StrategyWorkflowEngine
from .customer_context import CustomerContextService
from .embedding import QueryEmbeddingService
from .mission_supervisor import MissionSupervisor
from .model_profiles import ModelProfile


DEFAULT_MODEL = "nex-agi/nex-n2.5-mini:free"


def _provider_api_key(store: AgentRuntimeStore, provider_key: str) -> tuple[str | None, dict[str, Any]]:
    configuration_loader = getattr(store, "load_provider_configuration", None)
    configuration = configuration_loader(provider_key) if callable(configuration_loader) else None
    if configuration and configuration.get("status") in {"disabled", "needs_reauth", "failed"}:
        raise ProviderAvailabilityError("llm_provider_not_active")
    loader = getattr(store, "load_provider_credential_envelope", None)
    try:
        envelope = loader(provider_key) if callable(loader) else None
    except Exception as error:
        raise ProviderAvailabilityError("provider_credentials_unavailable") from error
    public_config = dict((configuration or envelope or {}).get("public_config") or {})
    if configuration and configuration.get("has_credential") and not envelope:
        raise ProviderAvailabilityError("provider_credentials_invalid")
    encryption_key = os.getenv("PROVIDER_SECRET_ENCRYPTION_KEY_B64", "").strip()
    if envelope and encryption_key:
        try:
            key = base64.b64decode(encryption_key)
            nonce = base64.b64decode(str(envelope["nonce"]))
            ciphertext = base64.b64decode(str(envelope["ciphertext"]))
            auth_tag = base64.b64decode(str(envelope["auth_tag"]))
            value = AESGCM(key).decrypt(nonce, ciphertext + auth_tag, None).decode("utf-8")
            if value:
                return value, public_config
        except Exception as error:
            raise ProviderAvailabilityError("provider_credentials_invalid") from error
    if envelope:
        raise ProviderAvailabilityError("provider_credentials_invalid")
    environment_key = "OPENROUTER_API_KEY" if provider_key == "openrouter" else "OPENAI_API_KEY"
    return os.getenv(environment_key), public_config


class _LazyProviderClient:
    def __init__(self, factory):
        self.factory = factory
        self.client = None

    def __getattr__(self, name):
        if self.client is None:
            self.client = self.factory()
        return getattr(self.client, name)


def _provider_clients(store: AgentRuntimeStore, routes: list[dict[str, Any]]) -> dict[str, OpenRouterClient]:
    clients: dict[str, OpenRouterClient] = {}
    env_approved = {
        model.strip()
        for model in os.getenv("OPENROUTER_ALLOWED_PAID_MODELS", "").split(",")
        if model.strip()
    }
    for provider_key in {"openrouter", "openai_direct"}:
        if provider_key not in {"openrouter", "openai_direct"}:
            continue
        default_url = "https://api.openai.com/v1" if provider_key == "openai_direct" else "https://openrouter.ai/api/v1"
        approved = env_approved | {
            str(model).strip()
            for route in routes
            if route.get("provider") == provider_key and route.get("status", "active") == "active"
            for model in (route.get("model_name"), route.get("fallback_model_name"))
            if model
        }
        approved |= {
            str(item.get("modelName") or "").strip()
            for route in routes if route.get("status", "active") == "active"
            for item in route.get("fallback_routes") or [] if item.get("provider") == provider_key
        }
        def build(provider_key=provider_key, default_url=default_url, approved=frozenset(approved)):
            api_key, config = _provider_api_key(store, provider_key)
            base_url = str(config.get("baseUrl") or default_url).strip().rstrip("/")
            parsed = urlparse(base_url)
            wrong_vendor = "api.openai.com" if provider_key == "openrouter" else "openrouter.ai"
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.hostname == wrong_vendor:
                raise ProviderAvailabilityError("invalid_provider_base_url")
            return OpenRouterClient(api_key=api_key, base_url=base_url, provider_name=provider_key,
                                    allowed_paid_models=approved, enforce_paid_model_approval=True)
        clients[provider_key] = _LazyProviderClient(build)
    return clients


def build_routed_client(store: AgentRuntimeStore, key: str, *, context: dict[str, Any] | None = None, tier: str = "default", kind: str = "chat", llm_client=None) -> RoutedLlmClient:
    return RoutedLlmClient(
        key, lambda: store.list("model_routing_rules", limit=None),
        (lambda routes: {"openrouter": llm_client, "openai_direct": llm_client}) if llm_client is not None else (lambda routes: _provider_clients(store, routes)),
        context=context or {}, tier=tier, kind=kind,
    )


def build_mission_supervisor(
    store: AgentRuntimeStore,
    llm_client: OpenRouterClient | None = None,
    context: dict[str, Any] | None = None,
) -> MissionSupervisor:
    routes = store.list("model_routing_rules", limit=None)
    route = resolve_route(routes, "mission_supervisor", context=context)
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
        fallback_models=[str(route["fallback_model_name"])] if route.get("fallback_model_name") else [],
        fallback_profile_keys=[],
        prompt_bundle_hash=sha256(b"yux-mission-supervisor-v1").hexdigest(),
    )
    from .campaign_launch import CampaignLaunchSpecialistWorkflow
    from .funnel_nurture import FunnelNurtureSpecialistWorkflow
    client = build_routed_client(store, "mission_supervisor", context=context, llm_client=llm_client)
    return MissionSupervisor(client, profile,
        campaign_launch=CampaignLaunchSpecialistWorkflow(build_routed_client(store, "campaign_launch_specialist", context=context, llm_client=llm_client), profile),
        funnel_nurture=FunnelNurtureSpecialistWorkflow(build_routed_client(store, "funnel_nurture_specialist", context=context, llm_client=llm_client), profile))


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
    candidate_limit: int | None = None
    embedding_model: str | None = None
    embedding_dimensions: int | None = None
    embedding_service: QueryEmbeddingService | None = None

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
            self.store.list("yux_strategy_card_embeddings", limit=None if self.candidate_limit is None else self.candidate_limit * 3),
            "card_id",
        )

    def list_chunks(self) -> list[dict[str, Any]]:
        return self._with_latest_embedding(
            self._normalize_profile_access(
                self.store.list("yux_strategy_source_chunks", limit=self.candidate_limit)
            ),
            self.store.list("yux_strategy_chunk_embeddings", limit=None if self.candidate_limit is None else self.candidate_limit * 3),
            "chunk_id",
        )

    def _with_latest_embedding(
        self,
        records: list[dict[str, Any]],
        embeddings: list[dict[str, Any]],
        foreign_key: str,
    ) -> list[dict[str, Any]]:
        model = self.embedding_service.model if self.embedding_service else self.embedding_model
        dimensions = self.embedding_service.dimensions if self.embedding_service else self.embedding_dimensions
        latest: dict[str, dict[str, Any]] = {}
        for embedding in embeddings:
            if model and str(embedding.get("embedding_model") or "") != model:
                continue
            values = embedding.get("embedding_values") or embedding.get("embedding")
            if dimensions is not None and (
                not isinstance(values, list) or len(values) != dimensions
            ):
                continue
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

    def search_authorized(self, **kwargs: Any) -> list[dict[str, Any]] | None:
        searcher = getattr(self.store, "retrieve_authorized_knowledge", None)
        if not callable(searcher):
            return None
        return searcher(namespace="strategy", **kwargs)


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
    context: dict[str, Any] | None = None,
) -> StrategyWorkflowEngine:
    profiles = _active(store.list("yux_strategy_agent_profiles", limit=200))
    agents = _build_agents(profiles)
    prompts = _build_prompts(
        agents,
        _active(store.list("marketing_agent_global_prompts", limit=200)),
    )
    routes = store.list("model_routing_rules", limit=None)
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
        routed_client_factory=lambda key, state: build_routed_client(store, key, context={**(context or {}), **state, "agent_id": state.get("agent", {}).get("id")}, tier=state.get("routing_tier", "default"), llm_client=llm_client),
        route_loader=lambda: store.list("model_routing_rules", limit=None),
    )
    embedding_service = QueryEmbeddingService(build_routed_client(store, "knowledge_embeddings", context=context, kind="embedding"))
    retrieval = StrategyRetrievalService(
        RuntimeStrategyKnowledgeStore(
            store,
            embedding_model=embedding_service.model,
            embedding_dimensions=embedding_service.dimensions,
            embedding_service=embedding_service,
        ),
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
