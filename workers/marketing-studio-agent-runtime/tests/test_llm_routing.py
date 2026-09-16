import pytest

from yux_agent_runtime.llm_routing import RoutedLlmClient, resolve_route
from yux_agent_runtime.providers import ProviderRequestError, ProviderAuthorizationError, ProviderAvailabilityError


def route(key, model, provider="openrouter", **fields):
    return dict(agent_type=key, model_name=model, provider=provider, status="active", routing_tier="default", **fields)


def test_fallback_order_and_provider_identity():
    attempted = []
    routes = [route("curator", "primary", fallback_routes=[{"provider": "openai_direct", "modelName": "local"}]), route("global_llm", "global", "openai_direct")]
    class Client:
        def chat_completion(self, **kwargs):
            attempted.append(kwargs["model"])
            if kwargs["model"] != "global":
                raise ProviderRequestError("unavailable")
            return {"model": "global", "provider": "openai_direct"}
    client = RoutedLlmClient("curator", lambda: routes, lambda _: {"openrouter": Client(), "openai_direct": Client()})
    assert client.chat_completion(model="ignored", messages=[]) == {"model": "global", "provider": "openai_direct"}
    assert attempted == ["primary", "local", "global"]


def test_override_then_function_then_global_with_ordered_deduplicated_fallbacks():
    routes = [
        {**route("curator", "override", organization_id="mine", fallback_routes=[{"provider": "openai_direct", "modelName": "override-fallback"}]), "routing_tier": "premium"},
        route("curator", "function", fallback_routes=[{"provider": "openrouter", "modelName": "function-fallback"}], fallback_model_name="function-fallback"),
        route("global_llm", "global", "openai_direct"),
        route("curator", "other-tenant", organization_id="other"),
    ]
    resolved = resolve_route(routes, "curator", tier="premium", context={"organization_id": "mine"})
    assert [a["modelName"] for a in resolved["attempts"]] == ["override", "override-fallback", "function", "function-fallback", "global"]
    routes[1]["status"] = "paused"
    assert [a["modelName"] for a in resolve_route(routes, "curator", tier="premium", context={"organization_id": "mine"})["attempts"]] == ["override", "override-fallback", "global"]
    routes[0]["status"] = "paused"
    with pytest.raises(ProviderAuthorizationError):
        resolve_route(routes, "curator", tier="premium", context={"organization_id": "mine"})


def test_embeddings_do_not_inherit_agent_only_chat_routes():
    routes = [route("knowledge_embeddings", "embedding"), route(None, "chat-only", organization_id="mine", agent_id="agent")]
    resolved = resolve_route(routes, "knowledge_embeddings", context={"organization_id": "mine", "agent_id": "agent"}, kind="embedding")
    assert [a["modelName"] for a in resolved["attempts"]] == ["embedding"]


@pytest.mark.parametrize("explicit_limit,expected", [(None, [2400, 6500]), (1700, [1700, 1700])])
def test_knowledge_legacy_preserves_extraction_ceiling_and_admin_limits(explicit_limit, expected):
    from yux_agent_runtime.knowledge_intelligence import KnowledgeIntelligenceService
    calls = []
    class Client:
        def chat_completion(self, **kwargs):
            calls.append(kwargs["max_tokens"])
            return {"model": kwargs["model"], "content": '{"facts": [], "suggestions": []}'}
    routes = [] if explicit_limit is None else [route("knowledge_curator", "admin-model", max_output_tokens=explicit_limit)]
    service = KnowledgeIntelligenceService(RoutedLlmClient("knowledge_curator", lambda: routes, lambda _: {"openrouter": Client()}))
    service.curate([{"locator": "1", "body": "Source facts."}])
    service.extract_company_profile([{"url": "https://example.test", "content": "Company details."}])
    assert calls == expected


def test_tenant_route_isolation_and_tier_precedence():
    routes = [route("curator", "global"), route("curator", "other", organization_id="b"), route("curator", "scoped", organization_id="a"), {**route("curator", "premium"), "routing_tier": "premium", "organization_id": "a"}]
    assert resolve_route(routes, "curator", context={"organization_id": "a"}, tier="premium")["model_name"] == "premium"
    assert resolve_route(routes, "curator", context={"organization_id": "c"})["model_name"] == "global"
    assert resolve_route(routes, "curator", context={"organization_id": "a", "agent_id": "x"})["model_name"] == "scoped"


@pytest.mark.parametrize("key,kind", [("global_llm", "chat"), ("global_embeddings", "embedding")])
def test_globals_ignore_historical_scopes_and_nondefault_tiers(key, kind):
    routes = [route(key, "scoped-global", organization_id="mine"), {**route(key, "premium-global"), "routing_tier": "premium"}, route(key, "global")]
    resolved = resolve_route(routes, "unconfigured-function", tier="premium", context={"organization_id": "mine"}, kind=kind)
    assert [attempt["modelName"] for attempt in resolved["attempts"]] == ["global"]


def test_paused_route_blocks_global_and_legacy():
    routes = [{**route("curator", "paused"), "status": "paused"}, route("global_llm", "global")]
    with pytest.raises(ProviderAuthorizationError):
        resolve_route(routes, "curator")


def test_authorization_denial_does_not_trigger_fallback():
    attempted = []
    class Client:
        def chat_completion(self, **kwargs):
            attempted.append(kwargs["model"])
            raise ProviderAuthorizationError("paid_model_not_approved")
    client = RoutedLlmClient("curator", lambda: [route("curator", "primary"), route("global_llm", "fallback")], lambda _: {"openrouter": Client()})
    with pytest.raises(ProviderAuthorizationError):
        client.chat_completion(model="ignored", messages=[])
    assert attempted == ["primary"]


def test_live_configuration_changes_next_call():
    routes = [route("curator", "first")]
    class Client:
        def chat_completion(self, **kwargs):
            return {"model": kwargs["model"], "provider": "openrouter"}
    client = RoutedLlmClient("curator", lambda: routes, lambda _: {"openrouter": Client()})
    assert client.chat_completion(model="ignored", messages=[])["model"] == "first"
    routes[0]["model_name"] = "second"
    assert client.chat_completion(model="ignored", messages=[])["model"] == "second"


def test_embedding_fallback_repeats_whole_batch():
    attempts = []
    class Client:
        def embed_texts(self, texts, **kwargs):
            attempts.append((kwargs["model"], texts))
            if kwargs["model"] == "primary":
                raise ProviderRequestError("unavailable")
            return {"model": "actual", "vectors": [[1.0]] * len(texts), "dimensions": 1, "tokens": 2}
    client = RoutedLlmClient("knowledge_embeddings", lambda: [route("knowledge_embeddings", "primary"), route("global_embeddings", "fallback")], lambda _: {"openrouter": Client()}, kind="embedding")
    result = client.embed_texts(["a", "b"], model="ignored", dimensions=1, input_type="search_query")
    assert result["model"] == "actual"
    assert attempts == [("primary", ["a", "b"]), ("fallback", ["a", "b"])]


def test_legacy_fallback_is_deduplicated_and_global_agent_only_does_not_match():
    routes = [route("curator", "primary", agent_id="mine", fallback_model_name="local", fallback_routes=[{"provider": "openrouter", "modelName": "local"}]), route("global_llm", "global"), route(None, "agent-only", agent_id="mine")]
    resolved = resolve_route(routes, "curator", context={"agent_id": "mine"})
    assert [r["modelName"] for r in resolved["attempts"]] == ["primary", "local", "global"]


def test_legacy_configs_visible_but_never_override_saved_or_paused(monkeypatch):
    from yux_agent_runtime.llm_routing import effective_legacy_routes
    monkeypatch.setenv("STRATEGY_CURATION_MODEL", "legacy-approved")
    assert next(r for r in effective_legacy_routes([]) if r["agentType"] == "strategy_curator")["modelName"] == "legacy-approved"
    saved = [{**route("strategy_curator", "saved"), "status": "paused"}]
    assert not any(r["agentType"] == "strategy_curator" for r in effective_legacy_routes(saved))
    assert not any(r["agentType"] == "knowledge_curator" for r in effective_legacy_routes([route("global_llm", "global")]))


def test_specialists_and_automation_inherit_existing_roles():
    routes = [route("mission_supervisor", "supervisor"), route("sales_profile", "sales"), route("global_llm", "global")]
    assert resolve_route(routes, "campaign_launch_specialist")["model_name"] == "supervisor"
    assert resolve_route(routes, "funnel_nurture_specialist")["model_name"] == "supervisor"
    assert resolve_route(routes, "automation_message_generation", context={"profile_key": "sales_profile"})["model_name"] == "sales"
    routes.append(route("automation_message_generation", "message"))
    assert resolve_route(routes, "automation_message_generation", context={"profile_key": "sales_profile"})["model_name"] == "message"


def test_embedding_service_and_store_follow_actual_fallback_identity():
    from yux_agent_runtime.embedding import QueryEmbeddingService
    from yux_agent_runtime.runtime_factory import RuntimeStrategyKnowledgeStore
    from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
    class Client:
        def embed_texts(self, texts, **kwargs):
            return {"model": "actual", "dimensions": 1, "vectors": [[1.0]], "tokens": 1}
    service = QueryEmbeddingService(Client(), model="requested", dimensions=1)
    store = InMemoryAgentRuntimeStore({"yux_strategy_concept_cards": [{"id": "card"}], "yux_strategy_card_embeddings": [
        {"card_id": "card", "embedding_model": "actual", "embedding_values": [1.0]},
        {"card_id": "card", "embedding_model": "requested", "embedding_values": [9.0], "created_at": "2099"},
    ]})
    knowledge = RuntimeStrategyKnowledgeStore(store, embedding_model="requested", embedding_dimensions=1, embedding_service=service)
    assert service.embed_query("query") == [1.0]
    assert service.model == "actual"
    assert knowledge.list_cards()[0]["embedding_values"] == [1.0]


def test_paused_provider_and_unapproved_paid_models_cannot_use_env(monkeypatch):
    from yux_agent_runtime.runtime_factory import build_routed_client
    from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-env")
    monkeypatch.delenv("OPENROUTER_ALLOWED_PAID_MODELS", raising=False)
    store = InMemoryAgentRuntimeStore({"platform_provider_connections": [{"provider_key": "openrouter", "status": "disabled"}]})
    client = build_routed_client(store, "knowledge_curator")
    with pytest.raises(ProviderAvailabilityError, match="llm_provider_not_active"):
        client.chat_completion(model="ignored", messages=[])
    store.tables["platform_provider_connections"] = []
    with pytest.raises(ProviderAuthorizationError, match="not_approved"):
        client.chat_completion(model="ignored", messages=[])


def test_unused_provider_is_lazy_and_credentials_refresh(monkeypatch):
    from yux_agent_runtime.runtime_factory import build_routed_client
    from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
    from yux_agent_runtime.providers import OpenRouterClient
    calls = []
    def complete(self, **kwargs):
        calls.append((self.api_key, self.provider_name, kwargs["model"]))
        return {"provider": self.provider_name, "model": kwargs["model"]}
    monkeypatch.setattr(OpenRouterClient, "chat_completion", complete)
    monkeypatch.setenv("OPENROUTER_API_KEY", "first-key")
    store = InMemoryAgentRuntimeStore({"model_routing_rules": [route("curator", "model")], "platform_provider_connections": [{"provider_key": "openai_direct", "status": "disabled"}]})
    client = build_routed_client(store, "curator")
    client.chat_completion(model="ignored", messages=[])
    monkeypatch.setenv("OPENROUTER_API_KEY", "second-key")
    client.chat_completion(model="ignored", messages=[])
    assert calls == [("first-key", "openrouter", "model"), ("second-key", "openrouter", "model")]


def test_unavailable_provider_uses_explicit_cross_provider_fallback(monkeypatch):
    from yux_agent_runtime.runtime_factory import build_routed_client
    from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
    from yux_agent_runtime.providers import OpenRouterClient
    calls = []
    def complete(self, **kwargs):
        calls.append(self.provider_name)
        return {"model": kwargs["model"], "provider": self.provider_name}
    monkeypatch.setattr(OpenRouterClient, "chat_completion", complete)
    store = InMemoryAgentRuntimeStore({
        "platform_provider_connections": [{"provider_key": "openrouter", "status": "disabled"}],
        "model_routing_rules": [route("curator", "primary"), route("global_llm", "approved-fallback", "openai_direct")],
    })
    result = build_routed_client(store, "curator").chat_completion(model="ignored", messages=[])
    assert result == {"model": "approved-fallback", "provider": "openai_direct"}
    assert calls == ["openai_direct"]


def test_runtime_credential_read_restores_tenant_even_on_error(monkeypatch):
    from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore, RuntimeDatabaseScope, _runtime_database_scope
    store = PostgresAgentRuntimeStore(database_url="unused")
    scope = RuntimeDatabaseScope(role="client_member", organization_ids=("tenant",), profile_key="sdr")
    token = _runtime_database_scope.set(scope)
    def unavailable():
        raise RuntimeError("database-unavailable")
    monkeypatch.setattr(store, "_connection", unavailable)
    try:
        for method in (store.load_provider_configuration, store.load_provider_credential_envelope):
            with pytest.raises(RuntimeError):
                method("openrouter")
            assert _runtime_database_scope.get() == scope
    finally:
        _runtime_database_scope.reset(token)


def test_embedding_cache_refreshes_routes_and_preserves_actual_identity():
    from yux_agent_runtime.embedding import QueryEmbeddingService
    calls = []
    routes = [route("knowledge_embeddings", "primary")]
    class Client:
        def embed_texts(self, texts, **kwargs):
            calls.append(kwargs["model"])
            return {"model": "actual-" + kwargs["model"], "vectors": [[1.0]], "dimensions": 1}
    client = RoutedLlmClient("knowledge_embeddings", lambda: routes, lambda _: {"openrouter": Client()}, kind="embedding")
    service = QueryEmbeddingService(client, dimensions=1)
    assert service.embed_query("same") == [1.0]
    assert service.embed_query("same") == [1.0]
    assert service.model == "actual-primary"
    assert calls == ["primary"]
    routes[0]["model_name"] = "changed"
    assert service.embed_query("same") == [1.0]
    assert calls == ["primary", "changed"]
    routes[0]["status"] = "paused"
    assert service.embed_query("same") is None
    assert calls == ["primary", "changed"]
