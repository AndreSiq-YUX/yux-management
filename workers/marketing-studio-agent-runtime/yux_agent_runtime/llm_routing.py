"""Central route resolution. Configuration is read on each call, never at startup."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Callable

from .providers import ProviderAuthorizationError, ProviderRequestError

SCOPES = ("organization_id", "client_id", "contract_id", "agent_id")
PROVIDERS = {"openrouter", "openai_direct"}


def _matches(route: dict[str, Any], context: dict[str, Any]) -> bool:
    return all(not route.get(key) or str(route[key]) == str(context.get(key) or "") for key in SCOPES)


def _pick(routes: list[dict[str, Any]], key: str, tier: str, context: dict[str, Any]) -> dict[str, Any] | None:
    if key in {"global_llm", "global_embeddings"}:
        routes = [r for r in routes if not any(r.get(scope) for scope in SCOPES) and r.get("routing_tier", "default") == "default"]
    candidates = [r for r in routes if _matches(r, context)
                  and (r.get("agent_type") == key or (key not in {"global_llm", "global_embeddings"} and not r.get("agent_type") and r.get("agent_id") == context.get("agent_id") and bool(r.get("agent_id"))))
                  and r.get("routing_tier", "default") in {tier, "default"}]
    candidates.sort(key=lambda r: (sum(bool(r.get(s)) for s in SCOPES), r.get("routing_tier", "default") == tier, int(r.get("version") or 1), str(r.get("updated_at") or "")), reverse=True)
    return dict(candidates[0]) if candidates else None


def legacy_route(key: str, kind: str = "chat") -> dict[str, Any]:
    model = os.getenv("OPENROUTER_DEFAULT_MODEL") or "nex-agi/nex-n2.5-mini:free"
    variable = "OPENROUTER_DEFAULT_MODEL"
    tokens, temperature, fallback = 1600, 0.2, []
    if kind == "embedding":
        variable = "OPENROUTER_EMBEDDING_MODEL"
        model = os.getenv(variable) or "qwen/qwen3-embedding-8b"
    elif key in {"mission_supervisor", "campaign_launch_specialist", "funnel_nurture_specialist"}:
        variable = "OPENROUTER_MISSION_SUPERVISOR_MODEL"
        model = os.getenv(variable) or model
        tokens, temperature = 2400, 0
    elif key in {"strategy_curator", "knowledge_curator"}:
        variable = "STRATEGY_CURATION_MODEL" if key == "strategy_curator" else "KNOWLEDGE_CURATION_MODEL"
        model = os.getenv(variable) or "openai/gpt-5.6-luna-pro"
        tokens, temperature = (max(1000, min(4000, int(os.getenv("KNOWLEDGE_CURATION_MAX_OUTPUT_TOKENS", "4000")))), 0) if key == "strategy_curator" else (2400, 0)
        if key == "strategy_curator":
            fallback = [{"provider": "openrouter", "modelName": value.strip()} for value in os.getenv("STRATEGY_CURATION_FALLBACK_MODELS", "").split(",") if value.strip()]
    return dict(agent_type=key, provider="openrouter", model_name=model, fallback_routes=fallback,
                routing_tier="default", status="active", max_input_tokens=16000, max_output_tokens=tokens,
                temperature=temperature, max_cost_per_run=0, origin="environment", origin_detail=variable)


def resolve_route(routes: list[dict[str, Any]], key: str, *, tier: str = "default", context: dict[str, Any] | None = None, kind: str = "chat") -> dict[str, Any]:
    context = context or {}
    global_key = "global_embeddings" if kind == "embedding" else "global_llm"
    route = _pick(routes, key, tier, context)
    if route is None and key in {"automation_lead_classification", "automation_message_generation", "automation_proposal_generation"}:
        inherited_key = str(context.get("profile_key") or (context.get("agent") or {}).get("agent_type") or "ai_sdr_comercial_1")
        route = _pick(routes, inherited_key, tier, context)
    if route is None and key in {"campaign_launch_specialist", "funnel_nurture_specialist"}:
        route = _pick(routes, "mission_supervisor", tier, context)
    global_route = _pick(routes, global_key, tier, context)
    if route is None:
        route = global_route or legacy_route(key, kind)
    if route.get("status", "active") != "active":
        raise ProviderAuthorizationError("llm_route_not_active")
    attempts: list[dict[str, str]] = []
    def append(item):
        provider = str(item.get("provider") or "")
        model = str(item.get("modelName") or item.get("model_name") or "").strip()
        if provider not in PROVIDERS or not model:
            raise ProviderAuthorizationError("invalid_llm_route")
        value = {"provider": provider, "modelName": model}
        if value not in attempts:
            attempts.append(value)
    def extend(item):
        append(item)
        for fallback in item.get("fallback_routes") or []:
            append(fallback)
        if item.get("fallback_model_name"):
            append({"provider": item["provider"], "modelName": item["fallback_model_name"]})
    extend(route)
    if global_route and global_route.get("status", "active") == "active":
        extend(global_route)
    return {**route, "attempts": attempts}


@dataclass
class RoutedLlmClient:
    use_case: str
    route_loader: Callable[[], list[dict[str, Any]]]
    client_builder: Callable[[list[dict[str, Any]]], dict[str, Any]]
    context: dict[str, Any] = field(default_factory=dict)
    tier: str = "default"
    kind: str = "chat"

    def configuration(self) -> tuple[dict[str, Any], dict[str, Any]]:
        routes = self.route_loader()
        route = resolve_route(routes, self.use_case, tier=self.tier, context=self.context, kind=self.kind)
        # Only matched routes authorize paid models, never another tenant's config.
        permitted = [r for r in routes if _matches(r, self.context)]
        return route, self.client_builder(permitted)

    def _execute(self, method: str, *args, **kwargs) -> dict[str, Any]:
        route, clients = kwargs.pop("_configuration", None) or self.configuration()
        last_error = None
        kwargs.pop("fallback_models", None)
        for attempt in route["attempts"]:
            client = clients.get(attempt["provider"])
            if client is None:
                raise ProviderAuthorizationError("llm_provider_not_configured")
            options = {**kwargs, "model": attempt["modelName"]}
            if method == "chat_completion":
                if route.get("max_output_tokens") is not None:
                    options["max_tokens"] = min(int(options.get("max_tokens", route["max_output_tokens"])), int(route["max_output_tokens"]))
                if route.get("temperature") is not None:
                    options["temperature"] = float(route["temperature"])
            try:
                result = getattr(client, method)(*args, **options)
                return {**result, "provider": attempt["provider"], "model": result.get("model") or attempt["modelName"]}
            except ProviderAuthorizationError:
                raise
            except ProviderRequestError as error:
                last_error = error
        raise last_error or ProviderRequestError("llm_route_unavailable")

    def chat_completion(self, *, model: str, messages: list[dict[str, str]], **kwargs) -> dict[str, Any]:
        return self._execute("chat_completion", model=model, messages=messages, **kwargs)

    def embed_texts(self, texts: list[str], *, input_type: str, model: str, dimensions: int, configuration=None) -> dict[str, Any]:
        return self._execute("embed_texts", texts, input_type=input_type, model=model, dimensions=dimensions, _configuration=configuration)


def effective_legacy_routes(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keys = ("global_llm", "global_embeddings", "action_engine_strategist", "mission_supervisor", "strategy_curator", "knowledge_curator", "knowledge_embeddings", "campaign_launch_specialist", "funnel_nurture_specialist", "automation_lead_classification", "automation_message_generation", "automation_proposal_generation")
    result = []
    for key in keys:
        kind = "embedding" if key.endswith("embeddings") else "chat"
        try:
            resolved = resolve_route(routes, key, kind=kind)
        except ProviderAuthorizationError:
            continue
        if resolved.get("origin") != "environment":
            continue
        result.append(dict(agentType=key, routingTier="default", provider=resolved["provider"], modelName=resolved["model_name"], fallbackModelName=None,
                           fallbackRoutes=resolved["fallback_routes"], maxInputTokens=resolved["max_input_tokens"], maxOutputTokens=resolved["max_output_tokens"],
                           temperature=resolved["temperature"], maxCostPerRun=0, status="active", origin="environment", originDetail=resolved["origin_detail"],
                           **({"embeddingDimensions": int(os.getenv("OPENROUTER_EMBEDDING_DIMENSIONS", "1024"))} if kind == "embedding" else {})))
    return result
