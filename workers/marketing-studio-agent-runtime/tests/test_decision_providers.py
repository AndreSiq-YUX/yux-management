import copy
import json
from pathlib import Path
import pytest
from yux_agent_runtime.decision_providers import OpenRouterDecisionsAlphaV1Provider, DecisionContractError, DecisionEffectUncertain
from yux_agent_runtime.providers import ProviderAuthorizationError

QUESTIONS = dict(fit=dict(type='choice', instructions='Compatível com o perfil?', criteria=dict(compatible='Há suporte positivo.', outside_profile='Há contradição clara.', investigate='Faltam evidências.')))
SYNTHETIC_RESPONSE = dict(id='fixture-not-a-live-response', model='typesafe/jev-1.13-fixture', provider='fixture-provider', answers=dict(fit=dict(type='choice', choice='investigate', probabilities=dict(compatible=.1, outside_profile=.2, investigate=.7))), usage=dict(input_tokens=100, output_tokens=20, cost=.0000042))


@pytest.mark.parametrize('model', ['typesafe/jev-1.13', 'openai/gpt-6-luna-decisions'])
def test_one_general_decisions_request_per_exact_model_preserves_usage_and_snapshot(model):
    calls = []
    response = {**copy.deepcopy(SYNTHETIC_RESPONSE), 'model': model + '-fixture'}
    def transport(url, headers, payload, method):
        calls.append(payload)
        assert url == 'https://openrouter.ai/api/alpha/decisions'
        assert method == 'POST'
        assert payload == dict(model=model, state=dict(text='Evidência pública.'), questions=QUESTIONS)
        assert 'models' not in payload
        return response
    result = OpenRouterDecisionsAlphaV1Provider(transport=transport).decide(model=model, state=dict(text='Evidência pública.'), questions=QUESTIONS)
    assert len(calls) == 1
    assert result['answers']['fit']['choice'] == 'investigate'
    assert result['answers']['fit']['confidence'] is None
    assert result['modelSnapshot'] == model + '-fixture'
    assert result['usage']['costUsd'] == '0.0000042'
    assert result['requestId'] == response['id']
    assert result['adapterVersion'] == 'openrouter-decisions-alpha-v1'


def test_default_cannot_call_a_paid_model_even_if_a_key_is_supplied():
    with pytest.raises(ProviderAuthorizationError, match='decision_paid_authorization_required'):
        OpenRouterDecisionsAlphaV1Provider(api_key='fixture-not-real').decide(model='fixture/model', state={}, questions=QUESTIONS)


@pytest.mark.parametrize('patch', [dict(answers={}), dict(answers=dict(fit=dict(type='choice', choice='invented', probabilities={}))), dict(model='unrequested/model')])
def test_alpha_contract_drift_preserves_response_without_an_automatic_retry(patch):
    raw = {**copy.deepcopy(SYNTHETIC_RESPONSE), **patch}
    calls = []
    def transport(*args):
        calls.append(args)
        return raw
    with pytest.raises(DecisionContractError, match='decision_contract_changed') as caught:
        OpenRouterDecisionsAlphaV1Provider(transport=transport).decide(model='typesafe/jev-1.13', state={}, questions=QUESTIONS)
    assert caught.value.response == raw
    assert len(calls) == 1


def test_timeout_after_send_is_uncertain_and_is_not_replayed():
    calls = []
    def transport(*args):
        calls.append(args)
        raise TimeoutError('must not expose credentials or raw infrastructure details')
    with pytest.raises(DecisionEffectUncertain, match='decision_effect_uncertain'):
        OpenRouterDecisionsAlphaV1Provider(transport=transport).decide(model='typesafe/jev-1.13', state={}, questions=QUESTIONS)
    assert len(calls) == 1


def test_official_documentary_example_is_not_marked_as_a_real_radar_response():
    directory = Path(__file__).resolve().parents[3] / 'contracts/radar/fixtures/openrouter-decisions-alpha-v1'
    manifest = json.loads((directory / 'manifest.json').read_text())
    assert manifest['realResponses'] == []
    assert manifest['fixtures'][0]['kind'] == 'official_example'
    raw = json.loads((directory / manifest['fixtures'][0]['file']).read_text())
    result = OpenRouterDecisionsAlphaV1Provider(transport=lambda *args: raw).decide(model='typesafe/jev-1.13', state={}, questions=dict(team=dict(type='choice', criteria=dict(account='A', frontend='B', payments='C'))))
    assert result['answers']['team']['choice'] == 'payments'
    assert result['answers']['team']['confidence'] == .75
