import pytest
from pydantic import ValidationError
from yux_agent_runtime.radar_contracts import DecisionContextV1

def context(target):
    return dict(schemaVersion=1,organizationId='00000000-0000-4000-8000-000000000001',campaignId='00000000-0000-4000-8000-000000000002',candidateId='00000000-0000-4000-8000-000000000003',configurationRevision=1,task='radar_initial_triage',contextVersion='radar-decision-context-v2',identity=dict(name='Alfa'),criteria=dict(targets=[target]),evidence=[],options=[])

def test_nested_campaign_targets_are_validated_without_rewriting_v1_receipt_material():
    target=dict(key='main',label='Alvo principal',definition='Atividade empresarial',priority='primary',cnaes=['1234567'])
    parsed=DecisionContextV1.model_validate(context(target))
    assert parsed.criteria == context(target)['criteria']
    for invalid in [{**target,'priority':'invented'},{**target,'tools':'injected'},{**target,'cnaes':['wrong']},{**target,'definition':'x'*1201}]:
        with pytest.raises(ValidationError):
            DecisionContextV1.model_validate(context(invalid))
