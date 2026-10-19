from types import SimpleNamespace
import pytest
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.radar_receipts import execute_radar_receipt


def test_unproven_retry_does_not_reserve_debit_or_call_provider():
    store = InMemoryAgentRuntimeStore()
    payload = dict(organization_id='org',request_id='new-request',retry_authorization=dict(authorization_id='not-proven'))
    request = SimpleNamespace(**payload,model_dump=lambda:payload)
    effects=[]
    with pytest.raises(RuntimeError,match='radar_analysis_retry'):
        execute_radar_receipt(store,action='radar_presence_resolution',request=request,
                              compute=lambda before:effects.append('provider'),debit=lambda:effects.append('debit'))
    assert effects == []
    assert store.list('radar_analysis_receipts',{}) == []


def test_optional_retry_metadata_does_not_change_the_original_paid_request_hash_material(monkeypatch):
    monkeypatch.setenv('YUX_AGENT_RUNTIME_TOKEN','local-test-only-token')
    monkeypatch.setenv('DATABASE_URL','postgresql://unused-local-fixture')
    from yux_agent_runtime.api import RadarPresenceRequest
    request=RadarPresenceRequest(organization_id='org',request_id='request',identity={},evidence=[dict(id='page-0',source_url='https://fixture.example/',text='Example business',kind='institutional_candidate')])
    assert 'retry_authorization' not in request.model_dump()
