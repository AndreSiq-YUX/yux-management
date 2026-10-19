import copy
from types import SimpleNamespace
from urllib.error import HTTPError
import pytest
from fastapi import HTTPException
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.radar_receipts import execute_radar_receipt, revalidate_radar_receipt
from yux_agent_runtime.radar_decisions import decide_radar_action, validate_saved_decision


def setup():
    route = dict(id='route', version=1, agent_type='radar_initial_triage', kind='decision', protocol='openrouter-decisions-alpha-v1', provider='openrouter', model_name='fixture/primary', fallback_routes=[dict(provider='openrouter', modelName='fixture/reserve')], status='active', decision_config=dict(enabled=True, mode='observe', maxAttempts=2))
    store = InMemoryAgentRuntimeStore(dict(model_routing_rules=[route]))
    data = dict(organization_id='org', client_id=None, contract_id=None, request_id='decision-request', task='radar_initial_triage', enabled=True,
                identity=dict(name='Empresa Alfa'), criteria=dict(segment='Segmento configurável'), evidence=[dict(id='source', source_url='https://alfa.example/', text='Empresa Alfa fornece refeições.', role='identity', primary=True)],
                options=[], route_snapshot=dict(id='route', version=1,authorizedAttempts=2, config={**route['decision_config'],'maxInputTokens':24000,'modelPolicies':{},'timeoutSeconds':15,'deadlineSeconds':45}, attempts=[dict(provider='openrouter', modelName='fixture/primary'), dict(provider='openrouter', modelName='fixture/reserve')]))
    return store, data


def response(payload, choice='investigate'):
    answers = {}
    for key, question in payload['questions'].items():
        selected = choice if key == 'action' else 'source' if key == 'evidence' else 'more_evidence_needed'
        if selected not in question['criteria']:
            selected = next(iter(question['criteria']))
        answers[key] = dict(type='choice', choice=selected, probabilities={option: int(option == selected) for option in question['criteria']})
    return dict(id='fixture-response', model=payload['model']+'-snapshot', provider='fixture', answers=answers, usage=dict(cost=.00001, input_tokens=50, output_tokens=5))


def invoke(store, data, transport, debits=None):
    req = SimpleNamespace(**data, model_dump=lambda: copy.deepcopy(data))
    return execute_radar_receipt(store, action=data['task'], request=req, debit=lambda: (debits.append(1) if debits is not None else None), validate_effect=False,
        compute=lambda before: decide_radar_action(store, data=data, before_call=before, transport=transport))


def test_valid_investigation_is_not_a_technical_failure_and_duplicate_delivery_is_free():
    store, data = setup(); calls=[]; debits=[]
    def transport(url, headers, payload, method):
        assert url.endswith('/api/alpha/decisions') and method=='POST'
        calls.append(payload); return response(payload)
    result = invoke(store,data,transport,debits)
    assert result['choice']=='investigate' and result['status']=='decided'
    assert result['evidenceIds']==['source'] and result['resolvedModel']=='fixture/primary-snapshot'
    assert invoke(store,data,transport,debits)==result
    assert len(calls)==len(debits)==1
    assert store.list('radar_effect_receipts')[0]['validation_outcome']=='valid'


@pytest.mark.parametrize('failure',['429','invalid'])
def test_confirmed_rejection_or_received_invalid_uses_one_authorized_fallback_and_preserves_each_attempt(failure):
    store,data=setup(); calls=[]; debits=[]
    def transport(url, headers, payload, method):
        calls.append(payload)
        if len(calls)==1:
            if failure=='429': raise HTTPError(url,429,'not exposed',{},None)
            raw=response(payload);raw['answers']={};return raw
        return response(payload,'compatible')
    result=invoke(store,data,transport,debits)
    assert result['choice']=='compatible' and len(calls)==len(debits)==2
    effects=store.list('radar_effect_receipts')
    assert [e['transport_outcome'] for e in effects]==(['rejected','received'] if failure=='429' else ['received','received'])
    assert effects[0]['validation_outcome']!='valid' and effects[1]['validation_outcome']=='valid'
    assert result['usage']['costUsd']==(None if failure=='429' else .00002)
    if failure=='invalid': assert effects[0]['response_body']['upstream_response']['answers']=={}


def test_uncertain_send_never_falls_back_or_repeats_and_does_not_expose_transport_details():
    store,data=setup();calls=[]
    def transport(*args): calls.append(1);raise TimeoutError('secret internal key')
    with pytest.raises(Exception,match='decision_effect_uncertain'): invoke(store,data,transport)
    with pytest.raises(HTTPException) as error: invoke(store,data,transport)
    assert error.value.status_code==409 and calls==[1]
    effect=store.list('radar_effect_receipts')[0]
    assert effect['transport_outcome']=='uncertain' and 'secret' not in str(effect)


def test_response_is_saved_before_parser_crash_and_revalidation_needs_no_route_or_network(monkeypatch):
    store,data=setup();calls=[]
    import yux_agent_runtime.radar_decisions as module
    original=module.validate_decision_result
    monkeypatch.setattr(module,'validate_decision_result',lambda *args,**kwargs: (_ for _ in ()).throw(RuntimeError('simulated crash')))
    def transport(url,headers,payload,method): calls.append(1);return response(payload)
    with pytest.raises(RuntimeError): invoke(store,data,transport)
    monkeypatch.setattr(module,'validate_decision_result',original)
    store.tables['model_routing_rules']=[]
    receipt=store.list('radar_analysis_receipts')[0]
    result=revalidate_radar_receipt(store,organization_id='org',action=data['task'],request_id=data['request_id'],input_hash=receipt['input_hash'],validate=validate_saved_decision)
    assert result['choice']=='investigate' and calls==[1]


def test_route_changes_before_a_new_effect_reject_without_payment():
    store,data=setup();store.tables['model_routing_rules'][0]['version']=2
    with pytest.raises(Exception,match='decision_route_changed'): invoke(store,data,lambda *args: pytest.fail('no network'))
    assert store.list('radar_analysis_receipts')[0]['status']=='rejected_before_provider'


def test_increasing_global_fallback_limit_cannot_expand_an_already_approved_purchase():
    store,data=setup();data['route_snapshot']['authorizedAttempts']=1;store.radar_limits['maxFallbackAttemptsPerEffect']=9;calls=[]
    def transport(url,headers,payload,method):calls.append(1);raise HTTPError(url,429,'synthetic',{},None)
    assert invoke(store,data,transport)['status']=='unavailable'
    assert calls==[1]


def test_wallet_denial_on_fallback_cannot_turn_a_paid_first_attempt_into_a_free_to_repeat_receipt():
    store,data=setup();calls=[];debits=[]
    req=SimpleNamespace(**data,model_dump=lambda:copy.deepcopy(data))
    def transport(url,headers,payload,method):calls.append(1);raw=response(payload);raw['answers']={};return raw
    def debit():
        debits.append(1)
        if len(debits)==2:raise HTTPException(status_code=402,detail='radar_ai_credits_insufficient')
    def execute():return execute_radar_receipt(store,action=data['task'],request=req,debit=debit,validate_effect=False,compute=lambda before:decide_radar_action(store,data=data,before_call=before,transport=transport))
    result=execute()
    assert result['status']=='unavailable'
    assert execute()==result
    assert calls==[1] and len(debits)==2
    assert store.list('radar_analysis_receipts')[0]['status']=='completed'
    assert [item['transport_outcome'] for item in store.list('radar_effect_receipts')]==['received','not_started']
