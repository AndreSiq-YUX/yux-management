import json
import pytest
from yux_agent_runtime.company_strategy_context import CompanyStrategyContextService
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.customer_context import CustomerContextService
from yux_agent_runtime.mission_conversation import build_mission_source_catalog


def store_with_strategy(external=True):
    content = {'schemaVersion': 1, 'title': 'Estratégia interna', 'objective': 'Desenvolver novos mercados', 'summary': 'Margem interna 25% e negociação reservada.', 'sections': [
        {'id': 'section-internal', 'kind': 'diagnosis', 'title': 'Análise interna', 'body': 'Comparar concorrentes e margens.', 'agentUse': 'internal'},
        *([{'id': 'section-public', 'kind': 'constraints', 'title': 'Limites', 'body': 'Atender somente PR com oferta confirmada.', 'agentUse': 'external_guidance'}] if external else []),
    ], 'references': {'productIds': [], 'documentIds': []}}
    return InMemoryAgentRuntimeStore(tables={
        'company_strategies': [{'id': 'strategy-a', 'organization_id': 'org-a', 'published_revision_id': 'revision-a', 'draft_revision_id': 'draft-a', 'is_primary': True}],
        'company_strategy_revisions': [{'id': 'revision-a', 'organization_id': 'org-a', 'strategy_id': 'strategy-a', 'revision_number': 1, 'content': content}, {'id': 'draft-a', 'organization_id': 'org-a', 'strategy_id': 'strategy-a', 'revision_number': 2, 'content': {**content, 'summary':'Rascunho secreto jamais publicado.'}}],
        'company_strategy_publications': [{'organization_id':'org-a','strategy_id':'strategy-a','revision_id':'revision-a'}],
    })


def retrieve(store, audience='client_user', query='mercados'):
    return CompanyStrategyContextService(store).retrieve(organization_id='org-a', contract_id=None, profile_key='growth_strategist', audience=audience, query=query)


def test_sdr_receives_only_external_guidance_and_no_draft():
    result = retrieve(store_with_strategy(), 'external_contact')
    text = json.dumps(result, ensure_ascii=False)
    assert 'Atender somente PR' in text
    assert 'Margem interna' not in text
    assert 'Análise interna' not in text
    assert 'Estratégia interna' not in text
    assert 'Rascunho secreto' not in text


def test_empty_external_guidance_has_no_internal_fallback():
    assert retrieve(store_with_strategy(False), 'external_contact')['strategy_context']['selected'] == []


def test_publication_refresh_changes_context_hash_and_archived_is_removed():
    store = store_with_strategy()
    first = retrieve(store)
    store.tables['company_strategies'][0]['published_revision_id'] = 'draft-a'
    store.tables['company_strategy_publications'].append({'organization_id':'org-a','strategy_id':'strategy-a','revision_id':'draft-a'})
    second = retrieve(store)
    assert second['strategy_context']['contextHash'] != first['strategy_context']['contextHash']
    store.tables['company_strategies'][0]['archived_at'] = '2026-10-26'
    assert retrieve(store)['strategy_context']['selected'] == []


def test_customer_context_and_mission_catalog_include_the_published_strategy():
    result = CustomerContextService(store_with_strategy()).retrieve(organization_id='org-a', contract_id=None, profile_key='growth_strategist', query='mercados')
    assert result['company_strategy_context']['selected'][0]['revisionId'] == 'revision-a'
    sources = build_mission_source_catalog(result, 'client_user')
    assert sources[0].kind == 'company_strategy'
    assert sources[0].ref == 'customer:strategy:revision-a'
    assert sources[0].publicationId is None


def test_actual_provider_payload_receives_strategy_and_mission_keeps_its_source():
    from test_mission_conversation import MissionConversationWorkflowTest, request
    helper = MissionConversationWorkflowTest()
    store = helper.make_store()
    store.tables.update(store_with_strategy().tables)
    captured = []
    def cite_strategy(body):
        body['sourceRefs'].append('customer:strategy:revision-a')
        return body
    response = helper.make_workflow(captured, store, cite_strategy).respond(request())
    payload = json.dumps(captured[0], ensure_ascii=False)
    assert 'company_strategy_context' in payload
    assert 'Atender somente PR com oferta confirmada.' in payload
    assert 'Rascunho secreto' not in payload
    assert any(source.kind == 'company_strategy' for source in response.sources)


def test_missing_mandatory_strategy_limits_blocks_an_executable_proposal():
    from test_mission_conversation import MissionConversationWorkflowTest, request
    helper = MissionConversationWorkflowTest()
    store = helper.make_store()
    store.tables.update(store_with_strategy().tables)
    store.tables['company_strategy_revisions'][0]['content']['sections'][1]['body'] = 'Uma restrição obrigatória muito extensa. ' * 300
    response = helper.make_workflow([], store).respond(request())
    assert response.kind == 'blocked'
    assert response.brief.packKeys == []
    assert response.readiness.status == 'needs_configuration'
