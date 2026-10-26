import json
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.portfolio_context import CompanyPortfolioContextService

def test_retrieves_product_31_by_relevance_and_keeps_brand_and_external_limits():
    store=InMemoryAgentRuntimeStore(tables={
        'company_represented_businesses':[{'id':'brand','organization_id':'org','name':'Massas A','status':'active','commercial_conditions':'Margem interna reservada','authorized_lines':['Massas'],'service_regions':['PR']}],
        'marketing_products_services':[{'id':str(i),'organization_id':'org','contract_id':'contract','represented_business_id':'brand','status':'active','name':'Lasanha especial' if i==31 else f'Produto {i}','description':'Congelado','metadata':{'packaging':'1 kg','storageConditions':'Congelado','secret':'Margem interna'}} for i in range(40)]
    })
    result=CompanyPortfolioContextService(store).retrieve(organization_id='org',contract_id='contract',profile_key='ai_sdr_comercial_1',audience='external_contact',query='Lasanha especial')
    assert result['items'][0]['id']=='31'
    assert result['items'][0]['representedBusinessName']=='Massas A'
    assert result['items'][0]['packaging']=='1 kg'
    assert result['items'][0]['commercialAvailability']=='unconfirmed'
    assert 'Margem interna' not in json.dumps(result,ensure_ascii=False)
    page=store.retrieve_company_portfolio(organization_id='org',contract_id='contract',profile_key='growth_strategist',audience='client_user',query='',represented_business_ids=[],offset=20,limit=20)
    assert len(page['items'])==20 and page['total']==40

def test_portfolio_reaches_actual_mission_provider_and_retains_conditions():
    from test_mission_conversation import MissionConversationWorkflowTest, request
    helper=MissionConversationWorkflowTest()
    store=helper.make_store()
    store.tables['company_represented_businesses']=[{'id':'brand','organization_id':'org-a','name':'Marca de teste','status':'active','authorized_lines':['Massas'],'service_regions':['PR']}]
    store.tables['marketing_products_services']=[{'id':'product','organization_id':'org-a','contract_id':'contract-a','status':'active','represented_business_id':'brand','name':'Lasanha especial','description':'Congelada','metadata':{'packaging':'1 kg','commercialAvailability':'unconfirmed'}}]
    captured=[]
    helper.make_workflow(captured,store).respond(request())
    rendered=json.dumps(captured,ensure_ascii=False)
    assert 'Portfólio da empresa' in rendered
    assert 'Lasanha especial' in rendered
    assert 'unconfirmed' in rendered
