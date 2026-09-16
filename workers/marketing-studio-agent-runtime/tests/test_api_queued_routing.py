import os
import json
from unittest.mock import patch

import pytest

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from fastapi.testclient import TestClient

from yux_agent_runtime.api import create_app
from yux_agent_runtime.providers import OpenRouterClient
from yux_agent_runtime.runtime_factory import build_strategy_workflow_engine
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


AUTH = {"Authorization": "Bearer test-runtime-token"}
SCOPE = {"organization_id": "org-1", "client_id": "client-1", "contract_id": "contract-1"}


@pytest.mark.parametrize("route_scope", [{}, {"organization_id": "org-1"}, SCOPE])
@pytest.mark.parametrize("status", ["active", "paused"])
def test_queued_api_resolves_embeddings_with_validated_job_scope(route_scope, status):
    routes = [{"agent_type": "knowledge_embeddings", "routing_tier": "default",
               "provider": "openrouter", "model_name": "general", "status": "active"}]
    if route_scope:
        routes.append({**routes[0], **route_scope, "model_name": "tenant-vector", "status": status})
    store = InMemoryAgentRuntimeStore({
        "model_routing_rules": routes + [{"agent_type": "ai_sdr_comercial_1", "routing_tier": "default",
            "provider": "openrouter", "model_name": "offline-chat", "status": "active"}],
        "yux_strategy_agent_profiles": [{"id": "profile-1", "profile_key": "ai_sdr_comercial_1", "status": "active"}],
        "yux_strategy_concept_cards": [{"id": "card-1", "organization_id": "org-1",
            "concept": "Orçamento", "status": "active", "visibility": "external_safe"}],
        "yux_strategy_card_embeddings": [
            {"card_id": "card-1", "embedding_model": model, "embedding_values": vector}
            for model, vector in [("general", [0.0, 1.0]), ("tenant-vector", [1.0, 0.0])]
        ],
    })
    calls = []
    engines = []

    def transport(url, headers, payload, method):
        if url.endswith("/chat/completions"):
            return {"model": payload["model"], "choices": [{"message": {"content": json.dumps({
                "reply": {"body": "Como podemos ajudar?", "language": "pt-BR"},
                "classification": {"intent": "qualification", "stage": "lead", "sentiment": "neutral", "urgency": "none", "confidence": 0.9},
                "qualification": {"fitScoreDelta": 0, "intentScoreDelta": 0, "objections": [], "nextBestAction": "Perguntar"},
            })}, "finish_reason": "stop"}], "usage": {}}
        assert url.endswith("/embeddings"), "Unexpected provider request"
        calls.append(payload["model"])
        return {"model": payload["model"], "data": [{"index": 0, "embedding": [1.0, 0.0]}]}

    provider = OpenRouterClient(api_key="offline", transport=transport, enforce_paid_model_approval=False)

    def factory(runtime_store, context=None):
        engine = build_strategy_workflow_engine(runtime_store, context=context)
        engines.append(engine)
        return engine

    with patch("yux_agent_runtime.runtime_factory._provider_clients", return_value={"openrouter": provider}), \
         patch("yux_agent_runtime.api.build_strategy_workflow_engine", side_effect=factory), \
         patch("yux_agent_runtime.api.PostgresAgentRuntimeStore", return_value=store), \
         patch.dict(os.environ, {"OPENROUTER_EMBEDDING_DIMENSIONS": "2"}):
        client = TestClient(create_app())
        ingest = client.post("/events/ingest", headers=AUTH, json={
            **SCOPE, "conversation_id": "conv-1", "text": "Orçamento", "message_id": "msg-1",
        })
        assert ingest.status_code == 200
        response = client.post("/jobs/process-next", headers=AUTH)

    assert response.status_code == 200
    assert response.json()["processed"] is True
    embedding_service = engines[0].retrieval_service.embedding_service
    if route_scope and status == "paused":
        assert calls == []
        assert embedding_service.cache == {}
    else:
        expected_model = "tenant-vector" if route_scope else "general"
        assert calls and set(calls) == {expected_model}
        assert embedding_service.model == expected_model
        assert embedding_service.dimensions == 2
        cards = engines[0].retrieval_service.store.list_cards()
        assert cards[0]["embedding_model"] == expected_model
        assert cards[0]["embedding_values"] == ([1.0, 0.0] if route_scope else [0.0, 1.0])
