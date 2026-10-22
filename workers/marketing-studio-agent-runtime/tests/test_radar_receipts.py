from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace
import pytest
import json
from pathlib import Path
from fastapi import HTTPException
from yux_agent_runtime.radar_receipts import execute_radar_receipt
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.radar_presence import resolve_radar_presence
from yux_agent_runtime.radar_contracts import radar_contract
from pydantic import ValidationError


def request(org='org'):
    value = dict(organization_id=org, request_id='request', evidence='same evidence')
    return SimpleNamespace(**value, model_dump=lambda: value)


@pytest.mark.parametrize('code', ['radar_analysis_retry_policy_changed', 'radar_analysis_retry_authorization_invalid', 'radar_analysis_retry_scope_invalid', 'radar_analysis_retry_not_required'])
def test_claim_rejection_reports_safe_conflict_without_provider_or_debit(code):
    class RejectedStore:
        def claim_radar_receipt(self, **kwargs):
            raise RuntimeError(code + '\nCONTEXT: private database detail')
    calls = []
    with pytest.raises(HTTPException) as failure:
        execute_radar_receipt(RejectedStore(), action='radar_business_qualification', request=request(),
            debit=lambda: calls.append('debit'), compute=lambda before_call: calls.append('provider'))
    assert failure.value.status_code == 409
    assert failure.value.detail == code
    assert calls == []


def test_unknown_claim_failure_is_not_exposed_as_a_safe_policy_conflict():
    class FailedStore:
        def claim_radar_receipt(self, **kwargs):
            raise RuntimeError('private connection detail')
    with pytest.raises(RuntimeError, match='private connection detail'):
        execute_radar_receipt(FailedStore(), action='radar_business_qualification', request=request(), debit=lambda: None, compute=lambda before_call: None)


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


def test_rejected_receipt_cannot_reclaim_a_changed_input_before_debit():
    store = InMemoryAgentRuntimeStore()
    def reject():
        raise HTTPException(status_code=402, detail='radar_ai_wallet_missing')
    def compute(before_call):
        before_call()
        return dict(scope='unresolved')
    with pytest.raises(HTTPException):
        execute_radar_receipt(store, action='radar_presence_resolution', request=request(), compute=compute, debit=reject)
    changed = request()
    changed.model_dump = lambda: dict(organization_id='org', request_id='request', evidence='changed')
    with pytest.raises(HTTPException) as cause:
        execute_radar_receipt(store, action='radar_presence_resolution', request=changed,
                              compute=lambda before_call: pytest.fail('must not call'),
                              debit=lambda: pytest.fail('must not debit'))
    assert cause.value.status_code == 409


@pytest.mark.parametrize('finish_reason,content,code', [
    ('length', '{"candidateId":', 'output_truncated'),
    ('stop', '{"candidateId":"page-0","scope":"group","reason":"A marca e razão social estão vinculadas.","claims":[{"evidenceId":"page-0","excerpt":"Trecho inventado pelo modelo"}]}', 'radar_presence_unverifiable'),
])
def test_records_received_response_and_usage_before_domain_validation(finish_reason, content, code):
    route = dict(agent_type='radar_presence_resolution', provider='openrouter', model_name='fixture', status='active')
    store = InMemoryAgentRuntimeStore(dict(model_routing_rules=[route]))
    response = dict(content=content, finish_reason=finish_reason, provider='openrouter', model='fixture-snapshot', raw_response_id='fixture-response', input_tokens=100, output_tokens=20, cost_usd=.001)
    class Client:
        def chat_completion(self, **kwargs):
            return response
    evidence = [dict(id='page-0', source_url='https://empresa.example/', kind='institutional_candidate', text='Empresa Alfa é a nossa razão social.')]
    with pytest.raises(ValueError):
        execute_radar_receipt(store, action='radar_presence_resolution', request=request(), debit=lambda: None,
                              compute=lambda before_call: resolve_radar_presence(store, enabled=True, context={}, identity={}, evidence=evidence, llm_client=Client(), before_call=before_call))
    effects = store.list('radar_effect_receipts')
    assert len(effects) == 1
    effect = effects[0]
    assert effect['transport_outcome'] == 'received'
    assert effect['validation_outcome'] == 'invalid'
    assert effect['billing_outcome'] == 'known'
    assert effect['failure_code'] == code
    assert effect['response_body']['content'] == content
    assert effect['response_body']['raw_response_id'] == 'fixture-response'
    assert effect['usage']['costUsd'] == .001


def test_python_uses_the_shared_three_contract_fixtures():
    cases = json.loads((Path(__file__).resolve().parents[3] / 'contracts/radar/v1/cases.json').read_text(encoding='utf-8'))
    for value in cases['valid']:
        radar_contract.validate_python(value)
    for value in cases['invalid']:
        with pytest.raises(ValidationError):
            radar_contract.validate_python(value)


def test_revalidates_a_saved_reply_after_failure_without_route_provider_or_debit():
    from yux_agent_runtime import radar_receipts
    from yux_agent_runtime.radar_presence import validate_radar_presence_response
    route = dict(agent_type='radar_presence_resolution', provider='openrouter', model_name='fixture', status='active')
    store = InMemoryAgentRuntimeStore(dict(model_routing_rules=[route]))
    evidence = [dict(id='page-0', source_url='https://empresa.example/', kind='institutional_candidate', text='Empresa Alfa é a nossa razão social.')]
    payload = dict(organization_id='org', request_id='saved-reply', evidence=evidence, identity={}, client_id=None, contract_id=None)
    req = SimpleNamespace(**payload, model_dump=lambda: payload)
    calls, debits = [], []
    result = dict(candidateId='page-0', scope='group', reason='A página identifica a razão social.', claims=[dict(evidenceId='page-0', excerpt=evidence[0]['text'])])
    class Client:
        def chat_completion(self, **kwargs):
            calls.append(1)
            return dict(content=json.dumps(result), finish_reason='stop', model='fixture', raw_response_id='fixture-response', cost_usd=.001)
    def compute(before_call):
        resolve_radar_presence(store, enabled=True, context={}, identity={}, evidence=evidence, llm_client=Client(), before_call=before_call)
        raise RuntimeError('simulated_failure_before_saving_projection')
    with pytest.raises(RuntimeError):
        execute_radar_receipt(store, action='radar_presence_resolution', request=req, compute=compute, debit=lambda: debits.append(1))
    receipt = store.list('radar_analysis_receipts')[0]
    store.tables['model_routing_rules'] = []
    revalidate = getattr(radar_receipts, 'revalidate_radar_receipt', None)
    assert callable(revalidate)
    recovered = revalidate(store, organization_id='org', action='radar_presence_resolution', request_id='saved-reply', input_hash=receipt['input_hash'], validate=lambda response, saved: validate_radar_presence_response(response, evidence=saved['evidence']))
    assert recovered['candidateId'] == 'page-0'
    assert calls == [1] and debits == [1]
    assert len(store.list('radar_effect_receipts')) == 1
    assert store.list('radar_effect_receipts')[0]['usage']['costUsd'] == .001
    assert store.list('radar_effect_receipts')[0]['validation_outcome'] == 'valid'
    assert store.list('radar_analysis_receipts')[0]['status'] == 'completed'


def test_free_revalidation_http_is_authenticated_tenant_scoped_and_never_builds_a_model(monkeypatch):
    from fastapi.testclient import TestClient
    monkeypatch.setenv('YUX_AGENT_RUNTIME_TOKEN', 'fixture-revalidate-token')
    monkeypatch.setenv('DATABASE_URL', 'postgresql://radar_test@127.0.0.1:55439/yux_radar_research_test')
    import yux_agent_runtime.api as api
    monkeypatch.setattr(api, 'build_routed_client', lambda *args, **kwargs: pytest.fail('free validation must not build a model'))
    class Store(InMemoryAgentRuntimeStore):
        def validate_tenant(self, organization_id, client_id, contract_id):
            return organization_id == 'mine'
        def reserve_credits(self, **kwargs):
            pytest.fail('free validation must not debit')
    store = Store()
    evidence = [dict(id='page-0', source_url='https://empresa.example/', kind='institutional_candidate', text='Empresa Alfa é nossa razão social.')]
    parent = store.insert('radar_analysis_receipts', dict(organization_id='mine', action='radar_presence_resolution', request_id='saved', input_hash='a' * 64, owner_token='old', status='uncertain', input_request=dict(evidence=evidence, client_id=None, contract_id=None)))
    store.insert('radar_effect_receipts', dict(organization_id='mine', effect_key='radar_presence_resolution:saved', analysis_receipt_id=parent['id'], attempt=1, owner_token='old', transport_outcome='received', usage=dict(costUsd=.001), response_body=dict(content=json.dumps(dict(candidateId='page-0', scope='group', reason='Marca e razão social estão na fonte.', claims=[dict(evidenceId='page-0', excerpt=evidence[0]['text'])])))))
    client = TestClient(api.create_app(store))
    body = dict(organization_id='mine', action='radar_presence_resolution', request_id='saved', input_hash='a' * 64)
    auth = {'Authorization': 'Bearer fixture-revalidate-token'}
    assert client.post('/radar/revalidate', json=body).status_code == 401
    assert client.post('/radar/revalidate', headers=auth, json={**body, 'organization_id': 'other'}).status_code == 403
    response = client.post('/radar/revalidate', headers=auth, json=body)
    assert response.status_code == 200
    assert response.json()['candidateId'] == 'page-0'
    assert client.post('/radar/revalidate', headers=auth, json={**body, 'client_id': 'different-client'}).status_code == 403
    assert client.post('/radar/revalidate', headers=auth, json={**body, 'input_hash': 'b' * 64}).status_code == 409
    rejected = client.post('/radar/revalidate', headers=auth, json={**body, 'apiKey': 'must-not-echo'})
    assert rejected.status_code == 422
    assert 'must-not-echo' not in rejected.text


@pytest.mark.parametrize('fallback_limit', [0, 1])
def test_confirmed_rejection_can_use_only_admin_bounded_fallbacks_but_timeout_cannot(fallback_limit):
    from yux_agent_runtime.providers import ProviderRequestError
    route = dict(agent_type='radar_presence_resolution', provider='openrouter', model_name='fixture-primary', status='active', fallback_routes=[dict(provider='openrouter', modelName='fixture-fallback')])
    evidence = [dict(id='page-0', source_url='https://empresa.example/', kind='institutional_candidate', text='Empresa Alfa é nossa razão social.')]
    for failure, expected in [('provider_http_429', 2), ('provider_transport_unavailable', 1)]:
        store, calls = InMemoryAgentRuntimeStore(dict(model_routing_rules=[route])), []
        store.radar_limits = {'maxFallbackAttemptsPerEffect': fallback_limit}
        expected = min(expected, fallback_limit + 1)
        class Client:
            def chat_completion(self, **kwargs):
                calls.append(kwargs['model'])
                if len(calls) == 1:
                    raise ProviderRequestError(failure)
                return dict(content=json.dumps(dict(candidateId=None, scope='unresolved', reason='Evidência ainda insuficiente.', claims=[])), cost_usd=.001)
        def compute(before_call):
            return resolve_radar_presence(store, enabled=True, context={}, identity={}, evidence=evidence, llm_client=Client(), before_call=before_call)
        if expected == 1:
            with pytest.raises(ProviderRequestError):
                execute_radar_receipt(store, action='radar_presence_resolution', request=request(), debit=lambda: None, compute=compute)
        else:
            execute_radar_receipt(store, action='radar_presence_resolution', request=request(), debit=lambda: None, compute=compute)
        assert len(calls) == expected
        effects = store.list('radar_effect_receipts')
        assert len(effects) == expected
        assert effects[0]['transport_outcome'] == ('rejected' if failure == 'provider_http_429' else 'uncertain')


def test_receipt_capture_does_not_capture_an_unrelated_nested_chat_response():
    from yux_agent_runtime.radar_receipts import capture_radar_raw_response
    from yux_agent_runtime.runtime_factory import build_routed_client
    routes = [dict(agent_type=action, provider='openrouter', model_name=model, status='active') for action, model in [('radar_presence_resolution', 'radar-fixture'), ('global_llm', 'other-fixture')]]
    store = InMemoryAgentRuntimeStore(dict(model_routing_rules=routes))
    class Client:
        def chat_completion(self, **kwargs):
            if kwargs['model'] == 'other-fixture':
                capture_radar_raw_response(dict(id='unrelated', choices=[dict(message=dict(content='UNRELATED CHAT'))]))
                return dict(content='UNRELATED CHAT')
            build_routed_client(store, 'global_llm', llm_client=self).chat_completion(model='configured', messages=[])
            return dict(content=json.dumps(dict(candidateId=None, scope='unresolved', reason='Resultado correto do Radar.', claims=[])), raw_response_id='correct-radar-response')
    evidence = [dict(id='page-0', source_url='https://empresa.example/', kind='institutional_candidate', text='Empresa pública sintética.')]
    execute_radar_receipt(store, action='radar_presence_resolution', request=request(), debit=lambda: None, compute=lambda before_call: resolve_radar_presence(store, enabled=True, context={}, identity={}, evidence=evidence, llm_client=Client(), before_call=before_call))
    assert len(store.list('radar_effect_receipts')) == 1
    assert store.list('radar_effect_receipts')[0]['response_body']['raw_response_id'] == 'correct-radar-response'
