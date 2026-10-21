import json
from types import SimpleNamespace
import pytest
from yux_agent_runtime.radar_qualification import qualify_radar_business, validate_radar_qualification_response
from yux_agent_runtime.radar_presence import resolve_radar_presence, validate_radar_presence_response
from yux_agent_runtime.radar_receipts import execute_radar_receipt, radar_effect_recorder
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.providers import ProviderAuthorizationError
from yux_agent_runtime.providers import OpenRouterClient

EVIDENCE=[dict(id='page-0',source_url='https://empresa.example/',kind='institutional_candidate',text='Empresa Alfa fornece refeições coletivas para empresas.')]
PRESENCE=dict(candidateId='page-0',scope='establishment',reason='A fonte identifica a Empresa Alfa.',claims=[dict(evidenceId='page-0',excerpt=EVIDENCE[0]['text'])])
QUALIFICATION=dict(targetStatus='confirmed',productFit='possible',claims=[dict(reason='Atende empresas',evidenceId='page-0',excerpt='refeições coletivas para empresas')],limitations=[])

@pytest.mark.parametrize('action,maximum', [('radar_presence_resolution',4096),('radar_business_qualification',12288)])
def test_authorized_output_limit_is_not_silently_reduced_by_the_radar_task(action,maximum):
    captured=[]
    class Client:
        def chat_completion(self,**kwargs):
            captured.append(kwargs['max_tokens'])
            return dict(content=json.dumps(PRESENCE if action=='radar_presence_resolution' else QUALIFICATION))
    store=InMemoryAgentRuntimeStore({'model_routing_rules':[dict(agent_type=action,provider='openrouter',model_name='fixture',status='active',max_output_tokens=maximum)]})
    if action=='radar_presence_resolution':
        resolve_radar_presence(store,enabled=True,context={},identity={},evidence=EVIDENCE,llm_client=Client())
    else:
        qualify_radar_business(store,enabled=True,context={},criteria={'profileEnabled':True},evidence=EVIDENCE,llm_client=Client())
    assert captured == [maximum]

@pytest.mark.parametrize('action',['presence','qualification'])
def test_complete_json_can_be_revalidated_without_another_generation_even_if_the_provider_marked_length(action):
    response=dict(content=json.dumps(PRESENCE if action=='presence' else QUALIFICATION),finish_reason='length',cost_usd=0.001)
    if action=='presence':
        result=validate_radar_presence_response(response,evidence=EVIDENCE)
        assert result['candidateId']=='page-0'
    else:
        result=validate_radar_qualification_response(response,criteria={},evidence=EVIDENCE)
        assert result['targetStatus']=='confirmed'
    assert result['usage']['costUsd']==0.001

def test_incomplete_json_is_not_repaired_or_mistaken_for_a_completed_analysis():
    with pytest.raises(ValueError,match='output_truncated'):
        validate_radar_qualification_response(dict(content='{"targetStatus":"confirmed","claims":[',finish_reason='length'),criteria={},evidence=EVIDENCE)

def test_recorded_proof_of_no_provider_attempt_does_not_leave_the_parent_receipt_uncertain():
    store=InMemoryAgentRuntimeStore()
    request=SimpleNamespace(organization_id='org',request_id='no-provider',model_dump=lambda:dict(organization_id='org',request_id='no-provider'))
    def compute(before_call):
        before_call()
        recorder=radar_effect_recorder('radar_presence_resolution')
        recorder.begin('openrouter','fixture')
        error=ProviderAuthorizationError('llm_provider_not_configured')
        recorder.failed(error,provider_started=False)
        raise error
    with pytest.raises(ProviderAuthorizationError):
        execute_radar_receipt(store,action='radar_presence_resolution',request=request,compute=compute,debit=lambda:None)
    assert store.list('radar_analysis_receipts')[0]['status']=='rejected_before_provider'
    assert store.list('radar_effect_receipts')[0]['transport_outcome']=='not_started'

@pytest.mark.parametrize('action',['radar_presence_resolution','radar_business_qualification'])
def test_short_radar_analysis_controls_thinking_and_requests_json_without_increasing_total_budget(action):
    captured=[]
    class Client:
        def chat_completion(self,**kwargs):
            captured.append(kwargs)
            return dict(content=json.dumps(PRESENCE if action=='radar_presence_resolution' else QUALIFICATION))
    store=InMemoryAgentRuntimeStore({'model_routing_rules':[dict(agent_type=action,provider='openrouter',model_name='fixture',status='active',max_output_tokens=2200)]})
    if action=='radar_presence_resolution':
        resolve_radar_presence(store,enabled=True,context={},identity={},evidence=EVIDENCE,llm_client=Client())
    else:
        qualify_radar_business(store,enabled=True,context={},criteria={},evidence=EVIDENCE,llm_client=Client())
    assert captured[0]['reasoning']=={'effort':'none'}
    assert captured[0]['response_format']=={'type':'json_object'}
    assert captured[0]['max_tokens']==2200

def test_native_openrouter_forwards_explicit_reasoning_only_for_its_own_protocol():
    calls=[]
    def transport(url,headers,payload,method):
        calls.append(payload)
        return {'choices':[{'message':{'content':'{}'},'finish_reason':'stop'}],'usage':{'completion_tokens':500,'completion_tokens_details':{'reasoning_tokens':100}}}
    router=OpenRouterClient(api_key='fixture',transport=transport)
    response=router.chat_completion(model='fixture',messages=[],max_tokens=2200,reasoning={'effort':'none'})
    assert calls[-1]['reasoning']=={'effort':'none'}
    assert calls[-1]['max_completion_tokens']==2200
    assert response['reasoning_tokens']==100
    assert response['visible_output_tokens']==400
    assert response['request_parameters']['reasoning']=={'effort':'none'}
    router.chat_completion(model='fixture',messages=[])
    assert 'reasoning' not in calls[-1]
    direct=OpenRouterClient(api_key='fixture',provider_name='openai',transport=transport)
    direct.chat_completion(model='fixture',messages=[],reasoning={'effort':'low'})
    assert 'reasoning' not in calls[-1]
