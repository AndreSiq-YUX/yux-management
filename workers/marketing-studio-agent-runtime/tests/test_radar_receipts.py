from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from yux_agent_runtime.radar_receipts import execute_radar_receipt
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


def request(org='org'):
    value = dict(organization_id=org, request_id='request', evidence='same evidence')
    return SimpleNamespace(**value, model_dump=lambda: value)


def test_concurrent_receipt_never_calls_provider_twice():
    entered, release = Event(), Event()
    store = InMemoryAgentRuntimeStore()
    debits = []
    def compute(before_call):
        before_call()
        entered.set()
        assert release.wait(3)
        return dict(scope='unresolved')
    def invoke():
        return execute_radar_receipt(store, action='radar_presence_resolution', request=request(), compute=compute, debit=lambda: debits.append(1))
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(invoke)
        assert entered.wait(3)
        try:
            with pytest.raises(HTTPException) as cause:
                invoke()
            assert cause.value.status_code == 409
        finally:
            release.set()
        assert first.result() == dict(scope='unresolved')
    assert debits == [1]


def test_completed_receipts_are_tenant_scoped():
    store, calls = InMemoryAgentRuntimeStore(), []
    def compute(before_call):
        before_call()
        calls.append(1)
        return dict(scope='unresolved')
    for org in ('a', 'b', 'a'):
        execute_radar_receipt(store, action='radar_presence_resolution', request=request(org), compute=compute, debit=lambda: None)
    assert len(calls) == 2


def test_provider_usage_is_preserved_without_inventing_a_cost():
    store = InMemoryAgentRuntimeStore()
    execute_radar_receipt(store, action='radar_presence_resolution', request=request(), debit=lambda: None,
                          compute=lambda before_call: dict(scope='unresolved', usage={'costUsd': None, 'inputTokens': 10}))
    assert store.list('radar_analysis_receipts')[0]['usage'] == {'costUsd': None, 'inputTokens': 10}


def test_uncertain_wallet_commit_cannot_debit_again():
    store = InMemoryAgentRuntimeStore()
    def debit():
        raise RuntimeError('wallet_commit_outcome_unknown')
    def compute(before_call):
        before_call()
        pytest.fail('provider must not start')
    with pytest.raises(RuntimeError):
        execute_radar_receipt(store, action='radar_presence_resolution', request=request(), compute=compute, debit=debit)
    with pytest.raises(HTTPException) as cause:
        execute_radar_receipt(store, action='radar_presence_resolution', request=request(), compute=compute, debit=debit)
    assert cause.value.status_code == 409
