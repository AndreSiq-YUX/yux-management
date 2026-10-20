"""Loopback integration fixture. Never uses a live provider or arbitrary DB."""
import os
from urllib.parse import urlsplit
import uvicorn
from yux_agent_runtime.api import create_app
from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore

target=urlsplit(os.environ['DATABASE_URL'])
if target.hostname!='127.0.0.1' or target.path!='/yux_radar_research_test':
    raise RuntimeError('isolated_radar_test_database_required')


def transport(url,headers,payload,method):
    assert url=='https://openrouter.ai/api/alpha/decisions' and method=='POST'
    if payload['model']=='fixture/timeout': raise TimeoutError('synthetic transport failure')
    if payload['model']=='fixture/invalid': return dict(model=payload['model'],id='fixture-invalid',provider='fixture',answers={},usage=dict(cost=.00001,input_tokens=30,output_tokens=5))
    answers={}
    for key,question in payload['questions'].items():
        selected='investigate' if key=='action' else 'more_evidence_needed' if key=='reason' else 'none'
        if payload['model']=='fixture/outside': selected='outside_profile' if key=='action' else 'outside_activity' if key=='reason' else next((option for option in question['criteria'] if option!='none'),'none')
        if selected not in question['criteria']: selected=next(iter(question['criteria']))
        answers[key]=dict(type='choice',choice=selected,probabilities={option:int(option==selected) for option in question['criteria']})
    return dict(model=payload['model']+'-snapshot',id='fixture-response',provider='fixture',answers=answers,usage=dict(cost=.00001,input_tokens=30,output_tokens=5))


def research_transport(url,headers,payload,method):
    from urllib.error import HTTPError
    assert url=='https://api.perplexity.ai/v1/agent' and method=='POST'
    assert isinstance(payload['model'],str) and 'models' not in payload
    if payload['model']=='fixture/timeout':raise TimeoutError('synthetic timeout')
    if payload['model']=='fixture/rejected':raise HTTPError(url,429,'synthetic rejection',{},None)
    if payload['model']=='fixture/invalid':return dict(id=None,output=[])
    return dict(id='fixture-agent-response',status='completed',model=payload['model'],
                output=[dict(type='search_results',contents=[dict(id=1,source='web',url='https://alfa.example/',snippet='Empresa Alfa CNPJ 37335118000180. Contato compras@alfa.example.')]),dict(type='message',content=[dict(type='output_text',text='Contato encontrado [web:1].',annotations=[])])],
                usage=dict(input_tokens=30,output_tokens=20,cost=dict(currency='USD',total_cost=.006,input_cost=.001,output_cost=.002,tool_calls_cost=.003)))


uvicorn.run(create_app(store=PostgresAgentRuntimeStore(),decision_transport=transport,research_transport=research_transport),host='127.0.0.1',port=int(os.environ['RADAR_DECISION_TEST_PORT']),log_level='error')
