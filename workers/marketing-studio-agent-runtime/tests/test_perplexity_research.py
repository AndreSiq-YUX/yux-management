import pytest
from urllib.error import HTTPError
from yux_agent_runtime.perplexity_research import PerplexityAgentResearchProvider, research_with_fallback, ResearchEffectUncertain
from yux_agent_runtime.providers import ProviderAuthorizationError


def reply():
    return dict(id='research-1',status='completed',model='fixture/model',output=[],usage=dict(cost=dict(currency='USD',input_cost=.001,output_cost=.002,tool_calls_cost=.003,total_cost=.006)))


def test_perplexity_never_inherits_openai_or_openrouter_environment_secret(monkeypatch):
    from yux_agent_runtime.runtime_factory import _provider_api_key
    monkeypatch.setenv('OPENAI_API_KEY','synthetic-openai')
    monkeypatch.setenv('OPENROUTER_API_KEY','synthetic-router')
    key,_=_provider_api_key(object(),'perplexity')
    assert key is None


def test_explicit_model_and_only_web_tools_with_documented_step_limit():
    sent=[];captured=[]
    def transport(url,headers,payload,method):
        sent.append((url,payload));return reply()
    provider=PerplexityAgentResearchProvider(transport=transport,received=captured.append)
    result=provider.research(model='fixture/model',context=dict(identity=dict(name='Empresa Alfa'),gaps=['website']),max_steps=3,max_output_tokens=4000)
    assert sent[0][0]=='https://api.perplexity.ai/v1/agent'
    body=sent[0][1]
    assert body['model']=='fixture/model' and body['max_steps']==3
    assert body['tools']==[dict(type='web_search'),dict(type='fetch_url')]
    assert not {'models','preset','max_tool_calls'} & body.keys()
    assert captured==[reply()]
    assert result['usage']['costUsd']==.006  # not .012 by double counting


def test_timeout_never_falls_back_or_retries():
    calls=[]
    def transport(*args):
        calls.append(args);raise TimeoutError()
    with pytest.raises(ResearchEffectUncertain):
        research_with_fallback(models=['fixture/model','fixture/fallback'],context=dict(identity=dict(name='Alfa'),gaps=['website']),transport=transport)
    assert len(calls)==1


def test_confirmed_rejection_has_separate_observable_attempt_and_receipt():
    calls=[];receipts=[]
    def transport(url,headers,body,method):
        calls.append(body['model'])
        if len(calls)==1:raise HTTPError(url,429,'rate',{},None)
        return reply()
    result=research_with_fallback(models=['fixture/model','fixture/fallback'],context=dict(identity=dict(name='Alfa'),gaps=['website']),transport=transport,received=lambda model,raw:receipts.append((model,raw)))
    assert calls==['fixture/model','fixture/fallback']
    assert len(result['attempts'])==2 and receipts[0][0]=='fixture/fallback'
    assert result['attempts'][0]['status']=='rejected'


def test_live_agent_requires_explicit_estimated_budget_approval():
    with pytest.raises(ProviderAuthorizationError,match='research_estimated_budget_approval_required'):
        PerplexityAgentResearchProvider(api_key='not-a-real-key',allow_paid=True).research(model='fixture/model',context=dict(identity=dict(name='Alfa'),gaps=['website']))


def test_estimated_budget_stops_fallback_before_another_charge():
    calls=[]
    def transport(url,headers,body,method):
        calls.append(body['model']);raise HTTPError(url,503,'unavailable',{},None)
    with pytest.raises(ProviderAuthorizationError,match='research_estimated_budget_reached'):
        research_with_fallback(models=['fixture/model','fixture/fallback'],context=dict(identity=dict(name='Alfa')),transport=transport,
                               budget=dict(mode='estimated_monitored',estimatedUsdPerAttempt=.01,maxCostUsd=.015))
    assert calls==['fixture/model']


def test_actual_overrun_is_recorded_without_claiming_a_hard_ceiling():
    result=research_with_fallback(models=['fixture/model'],context=dict(identity=dict(name='Alfa')),transport=lambda *args:reply(),
                                  budget=dict(mode='estimated_monitored',estimatedUsdPerAttempt=.001,maxCostUsd=.002))
    assert result['budget']['usedUsd']==.006
    assert result['budget']['exceeded'] is True
    assert result['budget']['hardCeiling'] is False


def test_unsafe_known_urls_or_forbidden_free_parameters_never_reach_transport():
    calls=[]
    provider=PerplexityAgentResearchProvider(transport=lambda *args:calls.append(args))
    for context in [dict(identity=dict(name='Alfa'),urls=['http://127.0.0.1']),dict(identity=dict(name='Alfa'),blocked_urls=['https://alfa.example']),dict(identity=dict(name='Alfa'),preset='pro-search')]:
        with pytest.raises(ValueError):provider.research(model='fixture/model',context=context)
    assert calls==[]


def test_receipted_parser_failure_keeps_reply_and_free_revalidation_never_rebuys():
    from types import SimpleNamespace
    from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
    from yux_agent_runtime.perplexity_research import run_radar_deep_research,normalize_research_response
    from yux_agent_runtime.radar_receipts import execute_radar_receipt,revalidate_radar_receipt
    route=dict(id='route',version=1,agent_type='radar_deep_research',kind='research',protocol='perplexity-agent-v1',provider='perplexity',model_name='fixture/model',status='active',research_config=dict(enabled=True,allowEstimatedBudget=True,maxAttempts=1,maxSteps=3,estimatedUsdPerAttempt=.01,budgetUsdPerResearch=.02))
    store=InMemoryAgentRuntimeStore(dict(model_routing_rules=[route]))
    data=dict(organization_id='org',request_id='request',enabled=True,context=dict(identity=dict(name='Alfa'),gaps=['website']),route_snapshot=dict(id='route',version=1,attempts=[dict(provider='perplexity',modelName='fixture/model')]))
    request=SimpleNamespace(**data,model_dump=lambda:data)
    calls=[]
    def transport(*args):calls.append(1);return dict(id=None,output=[])
    with pytest.raises(ValueError):
        execute_radar_receipt(store,action='radar_deep_research',request=request,debit=lambda:None,validate_effect=False,compute=lambda before:run_radar_deep_research(store,data=data,before_call=before,transport=transport))
    receipt=store.list('radar_analysis_receipts')[0]
    effect=store.list('radar_effect_receipts')[0]
    assert effect['response_body']['upstream_response']==dict(id=None,output=[])
    with pytest.raises(ValueError):
        revalidate_radar_receipt(store,organization_id='org',action='radar_deep_research',request_id='request',input_hash=receipt['input_hash'],validate=lambda raw,saved:normalize_research_response(raw['upstream_response']))
    assert calls==[1]
