"""Exercise the billable strategist request with synthetic responses and real wallet transactions."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from yux_agent_runtime.providers import ProviderRequestError
from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore, StrategyCreditConflict
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
            store.hold_strategy_credits(key, owner_token=owner, **options)
            return owner
        except StrategyCreditConflict:
            return None

    with ThreadPoolExecutor(max_workers=2) as executor:
        winner, = [owner for owner in executor.map(claim, owners) if owner]
    assert wallet(db, contract) == {"current_balance": 8, "monthly_used": 0}
    db.execute("UPDATE private.strategy_workflow_credit_holds SET updated_at=NOW()-INTERVAL '6 minutes' WHERE operation_id=%s", [key[2]])
    replacement = str(uuid4())
    assert claim(replacement) == replacement
    with pytest.raises(StrategyCreditConflict):
        store.record_strategy_credit_attempts(key, owner_token=winner, attempts=[])
    store.record_strategy_credit_attempts(key, owner_token=replacement, attempts=[{"status": "received"}])
    for _ in range(2):
        assert store.settle_strategy_credits(key, owner_token=replacement, client_id=CLIENT, charged_credits=1) == {
            "reserved": 2, "charged": 1, "released": 1,
        }
    assert wallet(db, contract) == {"current_balance": 9, "monthly_used": 1}
    assert len(ledger(db, contract)) == 1

    store.set_tenant_scope(ORG, contract_id="30000000-0000-4000-8000-000000000001",
                           profile_key="growth_strategist", audience="internal_operator")
    with store._connection() as connection:
        assert connection.execute("SELECT count(*) FROM private.strategy_workflow_credit_holds WHERE operation_id=%s", [key[2]]).fetchone()[0] == 0


def wallet(db, contract):
    return db.execute(
        "SELECT current_balance, monthly_used FROM public.ai_credit_wallets WHERE contract_id=%s", [contract],
    ).fetchone()


def ledger(db, contract):
    return db.execute(
        "SELECT credits_charged, provider, model FROM public.ai_usage_ledger WHERE contract_id=%s", [contract],
    ).fetchall()
