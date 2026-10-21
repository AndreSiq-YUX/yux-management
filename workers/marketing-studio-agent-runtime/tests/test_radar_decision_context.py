import json
import pytest
from yux_agent_runtime.radar_decision_context import build_radar_decision_context, ContextIncomplete


def test_deterministic_utf8_bounded_context_keeps_relevant_and_contradictory_evidence():
    evidence = [dict(id=f'page-{i}', source_url=f'https://empresa.example/{i}', text='Navegação. ' * 1000 + 'Produção para empresas em São Paulo. 🍝 ' * 100, role='activity', primary=True) for i in range(8)]
    evidence.append(dict(id='contradiction', source_url='https://empresa.example/about', text='Não fornecemos para indústrias. Apenas varejo.', role='activity', contradictory=True))
    data = dict(identity=dict(name='Empresa Açúcar', cnpj='12345678000190'), criteria=dict(segment='Produção para empresas'), evidence=evidence)
    result = build_radar_decision_context(data, model='fixture/model')
    assert result == build_radar_decision_context({**data, 'evidence': list(reversed(evidence))}, model='fixture/model')
    assert result['byteCount'] <= 24000
    assert len(json.dumps(result['state'], ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()) <= 16000
    assert len(result['state']['evidence']) <= 6
    assert 'contradiction' in result['evidenceMap']
    assert result['omittedEvidenceIds']
    assert all(len(item['text'].encode()) <= 1500 for item in result['state']['evidence'])
    assert any('Produção para empresas' in item['text'] for item in result['state']['evidence'])
    assert '\ufffd' not in json.dumps(result, ensure_ascii=False)
    assert result['contextVersion'] == 'radar-decision-context-v1'


def test_does_not_truncate_essential_identity_or_accept_images_and_duplicate_ids():
    with pytest.raises(ContextIncomplete, match='context_incomplete'):
        build_radar_decision_context(dict(identity=dict(name='x' * 20000), criteria={}, evidence=[]), model='fixture/model')
    with pytest.raises(ValueError, match='decision_text_only'):
        build_radar_decision_context(dict(identity={}, criteria={}, evidence=[dict(id='image', image_url='data:image/png;base64,fake')]), model='fixture/model')
    item = dict(id='duplicate', source_url='https://empresa.example/', text='Conteúdo público verificável.')
    with pytest.raises(ValueError, match='decision_duplicate_evidence'):
        build_radar_decision_context(dict(identity={}, criteria={}, evidence=[item, item]), model='fixture/model')


def test_long_unpunctuated_navigation_does_not_hide_the_relevant_tail():
    text = ' - '.join(f'Seção de navegação {index}' for index in range(600)) + ' Fornecemos refeições para indústrias em São Paulo.'
    result = build_radar_decision_context(dict(identity={}, criteria=dict(segment='refeições para indústrias'), evidence=[dict(id='source', source_url='https://empresa.example/', text=text)]), model='fixture/model')
    assert 'Fornecemos refeições para indústrias' in result['state']['evidence'][0]['text']


def test_v2_preserves_compact_registry_without_excerpting_and_persists_the_decision_step():
    registry_text='Atividade cadastrada e principal. ' * 25
    data=dict(context_version='radar-decision-context-v2',step=3,identity=dict(name='Empresa'),criteria={},evidence=[dict(id='registry',source_url='https://cnpja.com/office/12345678000190',text=registry_text,role='registry',primary=True)])
    packed=build_radar_decision_context(data,model='fixture/model',policy=dict(excerptBytes=200))
    assert packed['state']['evidence'][0]['role']=='registry'
    assert packed['state']['evidence'][0]['text']==registry_text
    assert packed['state']['step']==3
    assert packed['contextVersion']=='radar-decision-context-v2'
