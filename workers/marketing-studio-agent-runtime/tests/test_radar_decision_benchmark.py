import json
from scripts.evaluate_radar_decisions import evaluate_cases, baseline_decide, main


def test_three_evaluators_receive_same_state_and_pending_cases_never_trigger_an_evaluator(capsys):
    case = dict(id='synthetic-test-only', partition='validation', labelStatus='reviewed', criteria=dict(segment='Perfil sintético'), identity=dict(name='Empresa de teste'), evidence=[dict(id='source', source_url='https://empresa.example/', text='Atividade pública sintética.')], expected='investigate')
    seen = []
    def evaluator(**kwargs):
        seen.append(kwargs)
        return dict(choice='investigate', probabilities=None, costUsd=None, latencyMs=0, provenance='synthetic_fixture')
    report = evaluate_cases([case], {'baseline-fixture': evaluator, 'jev-fixture': evaluator, 'luna-fixture': evaluator})
    assert len(seen) == 3
    assert seen[0]['state'] == seen[1]['state'] == seen[2]['state']
    assert seen[0]['questions'] == seen[1]['questions'] == seen[2]['questions']
    assert report['qualityStatus'] == 'not_evaluated'
    assert report['results'][0]['costUsd'] is None
    seen.clear()
    evaluate_cases([{**case, 'labelStatus': 'pending'}], {'baseline-fixture': evaluator})
    assert seen == []
    assert main([]) == 0
    assert json.loads(capsys.readouterr().out)['externalCalls'] == 0


def test_baseline_text_confidence_is_not_a_probability_and_production_prompt_is_untouched():
    class Client:
        def chat_completion(self, **kwargs):
            assert kwargs['model'] == 'fixture-baseline-model'
            assert kwargs.get('fallback_models') is None
            return dict(content=json.dumps(dict(choice='investigate', evidenceIds=['source'], reasonCode='evidence_missing', confidence=.99)), cost_usd=None)
    result = baseline_decide(client=Client(), model='fixture-baseline-model', state=dict(evidence=[dict(id='source')]), questions={})
    assert result['probabilities'] is None
    assert result['choice'] == 'investigate'


def test_gate_requires_real_reviewed_validation_and_never_enables_automatic_discard():
    from scripts.evaluate_radar_decisions import decision_scope_gate
    baseline = dict(sampleSize=40, confirmedPositiveCases=12, correct=35, investigations=12, falseDiscards=0, thirdPartyContacts=0, technicalLeaks=0, uncertainReplays=0,
                    p95LatencyMs=1000, totalCostUsd='0.01', provenance='real_response', modelSnapshot='fixture-baseline-snapshot', contextVersion='v1', datasetVersion='v1', partition='validation')
    contender = {**baseline, 'modelSnapshot': 'fixture-decision-snapshot'}
    assert decision_scope_gate(baseline, contender, dataset_ready=False)['decision'] == 'inconclusive'
    assert decision_scope_gate(baseline, contender, dataset_ready=True)['decision'] == 'keep_current'
    assert decision_scope_gate(baseline, {**contender, 'totalCostUsd': None}, dataset_ready=True)['decision'] == 'inconclusive'
    assert decision_scope_gate(baseline, {**contender, 'falseDiscards': 1, 'totalCostUsd': '0.001'}, dataset_ready=True)['decision'] == 'keep_current'
    assert decision_scope_gate(baseline, {**contender, 'totalCostUsd': '0.008'}, dataset_ready=True) == dict(decision='proceed', reasonCodes=['cost_improvement_without_regression'], automaticDiscardAllowed=False, requiresProductReview=True)
    assert decision_scope_gate(baseline, {**contender, 'provenance': 'synthetic_fixture', 'totalCostUsd': '0.001'}, dataset_ready=True)['decision'] == 'inconclusive'
    assert decision_scope_gate(baseline, {**contender, 'correct': 500}, dataset_ready=True)['decision'] == 'inconclusive'
    assert decision_scope_gate(baseline, {**contender, 'totalCostUsd': 'missing'}, dataset_ready=True)['decision'] == 'inconclusive'
