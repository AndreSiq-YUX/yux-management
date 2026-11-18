"""Exercise billable pilot requests with synthetic responses and real wallet transactions."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from threading import Event
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from yux_agent_runtime.providers import ProviderRequestError
from yux_agent_runtime.mission_conversation import MissionConversationWorkflow
from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore, WorkflowCreditConflict
from yux_agent_runtime.trace import TraceRecorder

import test_live_workflows


DATABASE = os.getenv("YUX_AGENT_PILOT_TEST_DATABASE_URL")
if DATABASE:
    target = urlsplit(DATABASE)
    if target.hostname != "127.0.0.1" or target.path != "/yux_agent_pilot_test":
        raise RuntimeError("isolated_strategy_test_database_required")

pytestmark = pytest.mark.skipif(not DATABASE, reason="isolated PostgreSQL URL required")
ORG = "10000000-0000-4000-8000-000000000001"
CLIENT = "20000000-0000-4000-8000-000000000001"
OTHER_ORG = "10000000-0000-4000-8000-000000000002"


@pytest.fixture
def billing(monkeypatch):
    import psycopg
    from psycopg.rows import dict_row

    monkeypatch.setenv("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
    target = urlsplit(DATABASE)
    service_url = urlunsplit((target.scheme, f"yux_runtime@{target.hostname}:{target.port}", target.path, "", ""))
    monkeypatch.setenv("DATABASE_URL", service_url)
    store = PostgresAgentRuntimeStore(service_url)
    contract = str(uuid4())
    with psycopg.connect(DATABASE, autocommit=True, row_factory=dict_row) as db:
        seeded = db.execute(
            """INSERT INTO public.contracts (id,client_id,package_id,status)
               SELECT %s,client_id,package_id,'active' FROM public.contracts
               WHERE id='30000000-0000-4000-8000-000000000001' RETURNING id""",
            [contract],
        ).fetchone()
        assert seeded, "seed backend integration fixtures first"
        db.execute(
            """INSERT INTO public.ai_credit_wallets (organization_id,client_id,contract_id,current_balance)
               VALUES (%s,%s,%s,10)""",
            [ORG, CLIENT, contract],
        )
        try:
            yield db, store, contract
        finally:
            db.execute("DELETE FROM public.agent_execution_runs WHERE contract_id = %s", [contract])
            db.execute("DELETE FROM public.action_mission_conversations WHERE contract_id = %s", [contract])
            db.execute("DELETE FROM public.contracts WHERE id = %s", [contract])


def test_http_holds_before_transport_settles_completed_stages_and_denies_replay(billing, monkeypatch):
    from yux_agent_runtime.api import create_app

    db, store, contract = billing
    key = str(uuid4())
    engine, _ = test_live_workflows.LiveWorkflowTest().make_engine([])
    engine.store = store
    engine.trace = TraceRecorder(store)
    outputs = iter([
        {"analysis": "Confirme o volume.", "recommended_actions": ["Revisar CRM"]},
        {"answer": "Valide a capacidade antes da proposta.", "supporting_cards": []},
    ])
    calls = []

    def transport(_url, _headers, payload, _method):
        calls.append(payload["model"])
        hold = db.execute(
            "SELECT state, attempts FROM private.strategy_workflow_credit_holds WHERE operation_id=%s", [key],
        ).fetchone()
        assert hold["state"] == "executing"
        assert hold["attempts"][-1]["status"] == "started"
        assert wallet(db, contract) == {"current_balance": 8, "monthly_used": 0}
        assert ledger(db, contract) == []
        return {
            "choices": [{"message": {"content": json.dumps(next(outputs))}}],
            "usage": {"cost": 0.001, "prompt_tokens": 4, "completion_tokens": 5,
                      "total_tokens": 9, "completion_tokens_details": {"reasoning_tokens": 2}},
        }

    engine.harness.llm_client.transport = transport
    monkeypatch.setattr("yux_agent_runtime.api.build_strategy_workflow_engine", lambda *_args, **_kwargs: engine)
    monkeypatch.setattr("yux_agent_runtime.api.PostgresAgentRuntimeStore", lambda: store)
    client = TestClient(create_app())
    body = {
        "organization_id": ORG, "client_id": CLIENT, "contract_id": contract, "strategy_operation_id": key,
        "message": "Avalie a oportunidade.", "presales_candidate": True, "estimated_credits": 0,
        "workflow_spec": {"workflow_key": "diagnostic_48h", "version": 7, "subagent_specs": [
            {"key": "finance", "objective": "Avalie o volume", "required_terms": ["missed_requisite"]},
        ]},
    }
    auth = {"Authorization": "Bearer test-runtime-token"}
    db.execute("UPDATE public.ai_credit_wallets SET current_balance=1 WHERE contract_id=%s", [contract])
    assert client.post("/workflows/execute", json=body, headers=auth).status_code == 402
    assert calls == []
    assert db.execute(
        "SELECT count(*) AS count FROM private.strategy_workflow_credit_holds WHERE operation_id=%s", [key],
    ).fetchone()["count"] == 0
    db.execute("UPDATE public.ai_credit_wallets SET current_balance=10 WHERE contract_id=%s", [contract])
    first = client.post("/workflows/execute", json=body, headers=auth)
    assert first.status_code == 200, first.text
    assert first.json()["credits"] == {"reserved": 2, "charged": 1, "released": 1}
    assert first.json()["usage"]["reportedProviderCostUsd"] == pytest.approx(0.002)
    attempts = first.json()["usage"]["providerAttempts"]
    assert [attempt["stage"] for attempt in attempts] == ["finance", "synthesizer"]
    assert all(attempt["tokens"]["reasoning"] == 2 for attempt in attempts)
    assert client.post("/workflows/execute", json=body, headers=auth).status_code == 409
    assert client.post("/workflows/execute", json={**body, "message": "Outra"}, headers=auth).status_code == 409
    assert client.post("/workflows/execute", json={**body, "organization_id": OTHER_ORG}, headers=auth).status_code == 403
    assert len(calls) == 2
    assert wallet(db, contract) == {"current_balance": 9, "monthly_used": 1}
    assert ledger(db, contract) == [{"credits_charged": 1, "provider": None, "model": None}]


@pytest.mark.parametrize("attempted,unlimited", [(False, False), (True, False), (False, True)])
def test_failed_requests_release_known_unused_credits_and_retain_unconfirmed_attempts(billing, monkeypatch, attempted, unlimited):
    from yux_agent_runtime.api import create_app

    db, store, contract = billing
    if unlimited:
        db.execute("UPDATE public.ai_credit_wallets SET is_unlimited=true WHERE contract_id=%s", [contract])
    engine, _ = test_live_workflows.LiveWorkflowTest().make_engine([])
    if not attempted:
        engine.harness.llm_client.api_key = None
    engine.store, engine.trace = store, TraceRecorder(store)
    calls = []

    def transport(*_args):
        calls.append(True)
        raise ProviderRequestError("simulated_provider_timeout")

    engine.harness.llm_client.transport = transport
    monkeypatch.setattr("yux_agent_runtime.api.build_strategy_workflow_engine", lambda *_args, **_kwargs: engine)
    monkeypatch.setattr("yux_agent_runtime.api.PostgresAgentRuntimeStore", lambda: store)
    client = TestClient(create_app(), raise_server_exceptions=False)
    key = str(uuid4())
    payload = {
        "organization_id": ORG, "client_id": CLIENT, "contract_id": contract,
        "strategy_operation_id": key, "message": "Avalie.", "presales_candidate": True,
        "workflow_spec": {"workflow_key": "diagnostic_48h", "subagent_specs": []},
    }
    auth = {"Authorization": "Bearer test-runtime-token"}
    assert client.post("/workflows/execute", json=payload, headers=auth).status_code == 500
    row = db.execute(
        "SELECT state, attempts FROM private.strategy_workflow_credit_holds WHERE operation_id=%s", [key],
    ).fetchone()
    assert row["state"] == ("uncertain" if attempted else "released")
    assert [attempt["costUsd"] for attempt in row["attempts"]] == ([None] if attempted else [])
    assert client.post("/workflows/execute", json=payload, headers=auth).status_code == 409
    assert calls == ([True] if attempted else [])
    assert wallet(db, contract) == {"current_balance": 9 if attempted else 10, "monthly_used": 0}
    assert ledger(db, contract) == []


def test_concurrent_owners_cannot_hold_or_settle_twice_and_expired_preflight_can_resume(billing):
    db, store, contract = billing
    key = (ORG, contract, str(uuid4()))
    options = {"client_id": CLIENT, "input_hash": "a" * 64, "credits": 2}
    owners = [str(uuid4()), str(uuid4())]

    def claim(owner):
        store.set_tenant_scope(ORG, contract_id=contract, profile_key="growth_strategist", audience="internal_operator")
        try:
            store.hold_workflow_credits(key, owner_token=owner, **options)
            return owner
        except WorkflowCreditConflict:
            return None

    with ThreadPoolExecutor(max_workers=2) as executor:
        winner, = [owner for owner in executor.map(claim, owners) if owner]
    assert wallet(db, contract) == {"current_balance": 8, "monthly_used": 0}
    db.execute("UPDATE private.strategy_workflow_credit_holds SET updated_at=NOW()-INTERVAL '6 minutes' WHERE operation_id=%s", [key[2]])
    replacement = str(uuid4())
    assert claim(replacement) == replacement
    with pytest.raises(WorkflowCreditConflict):
        store.record_workflow_credit_attempts(key, owner_token=winner, attempts=[])
    store.record_workflow_credit_attempts(key, owner_token=replacement, attempts=[{"status": "received"}])
    for _ in range(2):
        assert store.settle_workflow_credits(key, owner_token=replacement, client_id=CLIENT, charged_credits=1) == {
            "reserved": 2, "charged": 1, "released": 1,
        }
    assert wallet(db, contract) == {"current_balance": 9, "monthly_used": 1}
    assert len(ledger(db, contract)) == 1

    store.set_tenant_scope(ORG, contract_id="30000000-0000-4000-8000-000000000001",
                           profile_key="growth_strategist", audience="internal_operator")
    with store._connection() as connection:
        assert connection.execute("SELECT count(*) FROM private.strategy_workflow_credit_holds WHERE operation_id=%s", [key[2]]).fetchone()[0] == 0


def mission_turn(billing, transport):
    from yux_agent_runtime.api import create_app

    db, store, contract = billing
    conversation_id, operation_id = str(uuid4()), str(uuid4())
    db.execute(
        """INSERT INTO public.action_mission_conversations
             (id,organization_id,contract_id,title,create_idempotency_key,created_by)
           VALUES (%s,%s,%s,'Conversa sintética',%s,'40000000-0000-4000-8000-000000000001')""",
        [conversation_id, ORG, contract, conversation_id],
    )
    engine, _ = test_live_workflows.LiveWorkflowTest().make_engine([])
    engine.store, engine.trace = store, TraceRecorder(store)
    engine.harness.llm_client.transport = transport
    app = create_app(store, mission_conversation_workflow=MissionConversationWorkflow(engine))
    headers = {"Authorization": "Bearer test-runtime-token", "X-YUX-Mission-Turn-Operation": operation_id}
    body = {
        "schemaVersion": 1, "organization_id": ORG, "client_id": CLIENT, "contract_id": contract,
        "conversation_id": conversation_id, "audience": "client_user", "user_message": "Planeje o diagnóstico.",
    }
    return TestClient(app, raise_server_exceptions=False), body, headers, engine


def mission_turn_output():
    return {
        "choices": [{"message": {"content": json.dumps({
            "kind": "message", "reply": "Vamos reunir os fatos do diagnóstico.",
            "readiness": {"status": "needs_information"}, "brief": {"objective": "Planejar diagnóstico"},
        })}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14,
                  "completion_tokens_details": {"reasoning_tokens": 2}},
    }


@pytest.mark.parametrize("provider_succeeds", [False, True])
def test_unbilled_inherited_pilot_turn_measures_provider_without_a_wallet_hold(billing, provider_succeeds):
    db, _, contract = billing

    def read_attempts():
        return db.execute(
            """SELECT snapshot.safe_context->'attempts' AS attempts, snapshot.safe_context->>'audience' AS audience, run.id, run.status
               FROM public.agent_execution_runs run
               JOIN public.agent_context_snapshots snapshot ON snapshot.run_id=run.id
               WHERE run.mission_conversation_id=%s AND snapshot.safe_context->>'measurement'='mission_turn_provider_attempts'""",
            [body["conversation_id"]],
        ).fetchone()

    def transport(_url, _headers, request, _method):
        is_retrieval = _url.endswith("/embeddings")
        before = read_attempts()
        assert before["attempts"][-1] == {
            "stage": "retrieval" if is_retrieval else "synthesizer",
            "kind": "retrieval" if is_retrieval else "generation", "provider": "openrouter",
            "model": request["model"], "requestedModels": [request["model"]],
            "status": "started", "costUsd": None, "tokens": None,
        }
        if is_retrieval:
            return {"data": [{"embedding": [0.5]}], "usage": {"prompt_tokens": 4, "total_tokens": 4, "cost": 0.001}}
        if not provider_succeeds:
            raise ProviderRequestError("synthetic_timeout")
        result = mission_turn_output()
        result["model"] = "synthetic/chat-2026-11-18"
        result["usage"]["cost"] = 0.012
        return result

    client, body, _, engine = mission_turn(billing, transport)

    def retrieve(**scope):
        engine.harness.llm_client.embed_texts([scope["query"]], input_type="search_query", dimensions=1)
        return {}

    engine.retrieval_service = SimpleNamespace(retrieve_strategy_context=retrieve)
    body.update(client_id=None, contract_id=None)
    headers = {"Authorization": "Bearer test-runtime-token", "X-YUX-Mission-Pilot-Usage": "1"}
    try:
        response = client.post("/missions/conversations/turn", json=body, headers=headers)
        assert response.status_code == (200 if provider_succeeds else 503), response.text
        assert '"costUsd"' not in response.text and '"attempts"' not in response.text
        receipt = read_attempts()
        assert receipt["audience"] == body["audience"]
        retrieval, attempt = receipt["attempts"]
        assert retrieval["kind"] == "retrieval" and retrieval["costUsd"] == pytest.approx(0.001)
        assert body["user_message"] not in json.dumps(receipt["attempts"])
        if provider_succeeds:
            assert response.json()["retrievalTraceId"] == str(receipt["id"])
            assert attempt["status"] == "received" and attempt["costUsd"] == pytest.approx(0.012)
            assert attempt["model"] == "synthetic/chat-2026-11-18"
            assert attempt["tokens"]["reasoning"] == 2
        else:
            assert receipt["status"] == "failed"
            assert attempt["status"] == "started" and attempt["costUsd"] is None
        assert wallet(db, contract) == {"current_balance": 10, "monthly_used": 0}
        assert ledger(db, contract) == []
    finally:
        db.execute("DELETE FROM public.agent_execution_runs WHERE mission_conversation_id=%s AND contract_id IS NULL",
                   [body["conversation_id"]])


def test_mission_turn_recovers_completed_response_after_worker_replay(billing):
    db, _, contract = billing
    started, release = Event(), Event()
    calls = []

    def transport(*_args):
        calls.append(True)
        started.set()
        assert release.wait(8)
        return mission_turn_output()

    client, body, headers, _ = mission_turn(billing, transport)
    body["mission_prompt"] = {"version": 1, "instructions": {"synthesizer": "Confirme o objetivo da missão."}}
    endpoint = "/missions/conversations/turn"
    with ThreadPoolExecutor() as executor:
        running = executor.submit(client.post, endpoint, json=body, headers=headers)
        try:
            assert started.wait(8)
            assert wallet(db, contract) == {"current_balance": 9, "monthly_used": 0}
            concurrent = client.post(endpoint, json=body, headers=headers)
            assert concurrent.status_code == 409
            assert concurrent.json() == {"detail": "mission_credit_turn_in_progress"}
        finally:
            release.set()
        completed = running.result()
    assert completed.status_code == 200, completed.text
    assert "credits" not in completed.json()
    assert completed.json()["usage"] == {"inputTokens": 10, "outputTokens": 4, "totalTokens": 14}
    replay = client.post(endpoint, json=body, headers={**headers, "X-YUX-Mission-Pilot-Usage": "1"})
    assert replay.status_code == 200, replay.text
    assert replay.json() == completed.json()
    for changed in [
        {"audience": "internal_operator"},
        {"user_message": "Altere o objetivo."},
        {"conversation_id": str(uuid4())},
        {"allowedCapabilityKeys": ["changed.capability"]},
    ]:
        assert client.post(endpoint, json={**body, **changed}, headers=headers).status_code == 409
    assert client.post(endpoint, json={**body, "organization_id": OTHER_ORG}, headers=headers).status_code == 403
    assert calls == [True]
    assert wallet(db, contract) == {"current_balance": 9, "monthly_used": 1}
    measured = db.execute(
        """SELECT h.attempts, ledger.action, h.agent_run_id
           FROM private.strategy_workflow_credit_holds h JOIN public.ai_usage_ledger ledger ON ledger.id=h.ledger_id
           WHERE h.contract_id=%s""", [contract],
    ).fetchone()
    assert measured["action"] == "agent_runtime_mission_conversation_turn"
    assert str(measured["agent_run_id"]) == completed.json()["retrievalTraceId"]
    assert measured["attempts"][0]["costUsd"] is None
    assert measured["attempts"][0]["requestedModels"] == ["openai/gpt-4.1-mini"]
    assert measured["attempts"][0]["kind"] == "generation"
    assert measured["attempts"][0]["tokens"]["reasoning"] == 2
    assert measured["attempts"][0]["stage"] == "synthesizer"
    context, = db.execute(
        "SELECT safe_context FROM public.agent_context_snapshots WHERE run_id=%s AND context_kind='runtime'",
        [measured["agent_run_id"]],
    ).fetchall()
    context = context["safe_context"]
    assert context["organization_prompt_version"] == 1
    assert context["effective_model"] == measured["attempts"][0]["model"]
    assert "measurement" not in context
    assert "Confirme o objetivo da missão." not in json.dumps(context)
    assert len(ledger(db, contract)) == 1


def test_mission_turn_retries_only_when_failure_preceded_provider(billing):
    db, _, contract = billing
    calls = []

    def transport(*_args):
        calls.append(True)
        return mission_turn_output()

    client, body, headers, engine = mission_turn(billing, transport)
    provider = engine.harness.llm_client
    provider.api_key = None
    endpoint = "/missions/conversations/turn"
    assert client.post(endpoint, json=body, headers=headers).status_code == 503
    assert wallet(db, contract) == {"current_balance": 10, "monthly_used": 0}
    assert calls == []
    provider.api_key = "fixture"
    assert client.post(endpoint, json=body, headers=headers).status_code == 200
    assert wallet(db, contract) == {"current_balance": 9, "monthly_used": 1}
    assert calls == [True]


def test_mission_turn_transport_timeout_is_not_replayed_or_charged(billing):
    db, _, contract = billing
    calls = []

    def timeout(*_args):
        calls.append(True)
        raise ProviderRequestError("fixture_transport_timeout")

    client, body, headers, _ = mission_turn(billing, timeout)
    endpoint = "/missions/conversations/turn"
    assert client.post(endpoint, json=body, headers=headers).status_code == 503
    retry = client.post(endpoint, json=body, headers=headers)
    assert retry.status_code == 409
    assert retry.json() == {"detail": "mission_credit_turn_review_required"}
    assert calls == [True]
    assert wallet(db, contract) == {"current_balance": 9, "monthly_used": 0}
    assert ledger(db, contract) == []


def wallet(db, contract):
    return db.execute(
        "SELECT current_balance, monthly_used FROM public.ai_credit_wallets WHERE contract_id=%s", [contract],
    ).fetchone()


def ledger(db, contract):
    return db.execute(
        "SELECT credits_charged, provider, model FROM public.ai_usage_ledger WHERE contract_id=%s", [contract],
    ).fetchall()
