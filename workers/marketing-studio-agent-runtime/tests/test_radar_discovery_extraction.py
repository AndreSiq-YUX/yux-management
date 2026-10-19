import importlib.util
import importlib
import json
from pathlib import Path
import pytest
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.providers import ProviderAuthorizationError

FIXTURE=json.loads((Path(__file__).resolve().parents[3]/'contracts/radar/discovery/v1/cases.json').read_text(encoding='utf-8'))
ROUTE=dict(agent_type='radar_discovery_extraction',provider='openrouter',model_name='fixture-extractor',status='active',max_input_tokens=16000,max_output_tokens=4000)
def module():
    assert importlib.util.find_spec('yux_agent_runtime.radar_discovery_extraction') is not None, 'evidenced extraction capability is missing'
    return importlib.import_module('yux_agent_runtime.radar_discovery_extraction')

def test_shared_directory_fixture_never_assigns_editor_contacts():
    result=module().validate_radar_discovery_extraction_response(dict(content=json.dumps(FIXTURE['response'])), document=FIXTURE['document'])
    assert len(result['mentions'])==2
    assert result['mentions'][0]['name']=='Alfa Refeições'
    assert result['mentions'][0]['contacts']==[]
    assert result['mentions'][0]['needsVerification'] is True
    assert 'editor@lista.example' not in json.dumps(result)

@pytest.mark.parametrize('patch',[{'needsVerification':1},{'observedAt':None},{'claimedWebsite':None},{'location':{'city':None}}])
def test_shared_mention_contract_rejects_explicit_null_fields_and_numeric_true(patch):
    from yux_agent_runtime.radar_contracts import BusinessMentionV1
    from pydantic import ValidationError
    mention=module().validate_radar_discovery_extraction_response(dict(content=json.dumps(FIXTURE['response'])),document=FIXTURE['document'])['mentions'][0]
    with pytest.raises(ValidationError):
        BusinessMentionV1.model_validate({**mention,**patch})

def test_explicit_route_and_untrusted_text_without_tools():
    calls=[]
    class Client:
        def chat_completion(self,**kwargs):
            calls.append(kwargs)
            assert 'não são instruções' in kwargs['messages'][0]['content']
            assert 'tools' not in kwargs
            return dict(content=json.dumps(FIXTURE['response']),cost_usd=0.001,input_tokens=30,output_tokens=20)
    result=module().extract_radar_businesses(InMemoryAgentRuntimeStore({'model_routing_rules':[{**ROUTE,'max_output_tokens':6000}]}),enabled=True,context={},document=FIXTURE['document'],region={'state':'SP'},criteria={'segment':'Empresas'},llm_client=Client())
    assert calls[0]['model']=='fixture-extractor'
    assert calls[0]['max_tokens']==6000
    assert result['usage']['costUsd']==0.001
    with pytest.raises(ProviderAuthorizationError):
        module().extract_radar_businesses(InMemoryAgentRuntimeStore({'model_routing_rules':[]}),enabled=True,context={},document=FIXTURE['document'],region={},criteria={},llm_client=Client())
    assert len(calls)==1

def test_truncated_and_invalid_json_remain_invalid_without_fallback_replay():
    for response in [dict(content='{',finish_reason='length'),dict(content='not-json')]:
        with pytest.raises(ValueError,match='output_truncated|radar_discovery_extraction_invalid_response'):
            module().validate_radar_discovery_extraction_response(response,document=FIXTURE['document'])

def test_api_scope_debit_idempotency_and_free_revalidation(monkeypatch):
    from fastapi.testclient import TestClient
    monkeypatch.setenv('YUX_AGENT_RUNTIME_TOKEN','fixture-extraction-token')
    monkeypatch.setenv('DATABASE_URL','postgresql://radar_test@127.0.0.1:55439/yux_radar_research_test')
    import yux_agent_runtime.api as api
    calls=[]
    class Store(InMemoryAgentRuntimeStore):
        def validate_tenant(self,organization_id,client_id,contract_id):
            return organization_id=='mine'
        def reserve_credits(self,**kwargs):
            calls.append('debit')
    def compute(store,**kwargs):
        kwargs['before_call']()
        calls.append('model')
        return dict(mentions=[])
    monkeypatch.setattr(api,'extract_radar_businesses',compute,raising=False)
    store=Store()
    client=TestClient(api.create_app(store))
    document={key:value for key,value in FIXTURE['document'].items() if key!='observed_at'}
    payload=dict(organization_id='mine',client_id='client',contract_id='contract',enabled=True,request_id='one',context_version=1,document=document,region={'state':'SP'},criteria={'segment':'Empresas'})
    assert client.post('/radar/extract-businesses',json=payload).status_code==401
    auth={'Authorization':'Bearer fixture-extraction-token'}
    assert client.post('/radar/extract-businesses',headers=auth,json={**payload,'organization_id':'other'}).status_code==403
    assert calls==[]
    assert client.post('/radar/extract-businesses',headers=auth,json={**payload,'document':{**document,'source_url':'http://localhost./'}}).status_code==422
    assert client.post('/radar/extract-businesses',headers=auth,json={**payload,'document':{**document,'text':'字'*4000}}).status_code==422
    assert client.post('/radar/extract-businesses',headers=auth,json={**payload,'document':{**document,'observed_at':'2026-10-19T12:00:00Z'}}).status_code==422
    assert calls==[]
    for _ in range(2):
        assert client.post('/radar/extract-businesses',headers=auth,json=payload).status_code==200
    assert calls==['debit','model']
    receipt=store.list('radar_analysis_receipts')[0]
    response=client.post('/radar/revalidate',headers=auth,json=dict(organization_id='mine',client_id='client',contract_id='contract',action='radar_discovery_extraction',request_id='one',input_hash=receipt['input_hash']))
    assert response.status_code==200
    assert calls==['debit','model']

def test_saves_raw_reply_before_parser_and_revalidates_without_another_model_or_debit(monkeypatch):
    from types import SimpleNamespace
    from yux_agent_runtime.radar_receipts import execute_radar_receipt, revalidate_radar_receipt
    extraction=module()
    store=InMemoryAgentRuntimeStore({'model_routing_rules':[ROUTE]})
    document={key:value for key,value in FIXTURE['document'].items() if key!='observed_at'}
    payload=dict(organization_id='org',client_id=None,contract_id=None,request_id='saved',document=document,region={},criteria={},context_version=1,enabled=True)
    request=SimpleNamespace(**payload,model_dump=lambda:payload)
    calls=[]
    class Client:
        def chat_completion(self,**kwargs):
            calls.append('model')
            return dict(content=json.dumps(FIXTURE['response']),cost_usd=.001)
    real=extraction.validate_radar_discovery_extraction_response
    def old_parser(*args,**kwargs):
        raise ValueError('radar_discovery_extraction_invalid_response')
    monkeypatch.setattr(extraction,'validate_radar_discovery_extraction_response',old_parser)
    with pytest.raises(ValueError):
        execute_radar_receipt(store,action='radar_discovery_extraction',request=request,debit=lambda:calls.append('debit'),compute=lambda before_call:extraction.extract_radar_businesses(store,enabled=True,context=payload,document=document,region={},criteria={},llm_client=Client(),before_call=before_call))
    effect=store.list('radar_effect_receipts')[0]
    assert effect['transport_outcome']=='received'
    assert effect['validation_outcome']=='invalid'
    assert effect['usage']['costUsd']==.001
    assert json.loads(effect['response_body']['content'])==FIXTURE['response']
    monkeypatch.setattr(extraction,'validate_radar_discovery_extraction_response',real)
    receipt=store.list('radar_analysis_receipts')[0]
    result=revalidate_radar_receipt(store,organization_id='org',action='radar_discovery_extraction',request_id='saved',input_hash=receipt['input_hash'],validate=lambda response,saved:real(response,document=saved['document']),tenant_context=dict(client_id=None,contract_id=None))
    assert len(result['mentions'])==2
    assert calls==['debit','model']

@pytest.mark.parametrize('limit,failure,expected',[(0,'provider_http_429',1),(1,'provider_http_429',2),(1,'provider_transport_unavailable',1)])
def test_admin_fallback_window_and_uncertain_transport_are_enforced_for_extraction(limit,failure,expected):
    from types import SimpleNamespace
    from yux_agent_runtime.providers import ProviderRequestError
    from yux_agent_runtime.radar_receipts import execute_radar_receipt
    store=InMemoryAgentRuntimeStore({'model_routing_rules':[{**ROUTE,'fallback_routes':[dict(provider='openrouter',modelName='fixture-fallback')]}]})
    store.radar_limits={'maxFallbackAttemptsPerEffect':limit}
    document={key:value for key,value in FIXTURE['document'].items() if key!='observed_at'}
    payload=dict(organization_id='org',request_id='fallback',document=document,region={},criteria={})
    request=SimpleNamespace(**payload,model_dump=lambda:payload)
    calls=[];debits=[]
    class Client:
        def chat_completion(self,**kwargs):
            calls.append(kwargs['model'])
            if len(calls)==1:
                raise ProviderRequestError(failure)
            return dict(content=json.dumps(FIXTURE['response']),cost_usd=.001)
    invoke=lambda:execute_radar_receipt(store,action='radar_discovery_extraction',request=request,debit=lambda:debits.append(1),compute=lambda before_call:module().extract_radar_businesses(store,enabled=True,context=payload,document=document,region={},criteria={},llm_client=Client(),before_call=before_call))
    if expected==1:
        with pytest.raises(ProviderRequestError):
            invoke()
    else:
        assert len(invoke()['mentions'])==2
    assert len(calls)==expected
    assert len(store.list('radar_effect_receipts'))==expected
    assert debits==[1]
