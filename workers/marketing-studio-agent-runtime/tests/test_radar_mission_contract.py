from copy import deepcopy

import pytest

from yux_agent_runtime.contracts import AgentContractError, validate_mission_plan


def radar_contract():
    capabilities = [
        ('pack.inspect', 'radar.campaign.inspect'),
        ('pack.campaign', 'radar.campaign.create'),
        ('pack.preflight', 'radar.capture.preflight'),
        ('pack.capture', 'radar.capture.start'),
        ('pack.await', 'radar.operation.await'),
        ('pack.results', 'radar.results.inspect'),
        ('pack.evaluate', 'system.evaluation.checkpoint'),
    ]
    request = {
        'mission': {'id': 'radar-pilot'},
        'action_pack': {'key': 'radar_prospecting', 'semanticVersion': '1.0.0', 'contentHash': 'a' * 64,
                        'protectedStepKeys': [key for key, _ in capabilities]},
        'capabilities': [{'key': capability, 'version': 1} for _, capability in capabilities],
    }
    plan = {
        'schemaVersion': 1, 'missionId': 'radar-pilot',
        'actionPack': {'key': 'radar_prospecting', 'version': '1.0.0', 'templateHash': 'a' * 64},
        'estimatedEconomics': {'currency': 'BRL', 'totalExecutionCost': '0'},
        'steps': [{'stepKey': key, 'capabilityKey': capability, 'capabilityVersion': 1,
                   'dependsOn': [capabilities[index - 1][0]] if index else [],
                   'timeoutSeconds': 300, 'maxAttempts': 1,
                   'effect': 'external' if key == 'pack.capture' else 'none',
                   'approvalRequired': key == 'pack.capture'}
                  for index, (key, capability) in enumerate(capabilities)],
    }
    return request, plan


def test_radar_uses_its_commercial_checkpoint_without_a_revenue_metrics_step():
    request, plan = radar_contract()
    assert validate_mission_plan(plan, request) == plan


@pytest.mark.parametrize('removed', ['pack.await', 'pack.results', 'pack.evaluate'])
def test_radar_cannot_remove_protected_wait_results_or_checkpoint(removed):
    request, plan = radar_contract()
    plan['steps'] = [step for step in plan['steps'] if step['stepKey'] != removed]
    with pytest.raises(AgentContractError, match='mission_plan_protected_step_missing'):
        validate_mission_plan(plan, request)


def test_radar_still_requires_capture_approval():
    request, plan = radar_contract()
    plan['steps'][3]['approvalRequired'] = False
    with pytest.raises(AgentContractError, match='mission_plan_external_approval_required'):
        validate_mission_plan(plan, request)


def test_other_packs_keep_the_revenue_economics_checkpoint_requirement():
    request, plan = deepcopy(radar_contract())
    request['action_pack']['key'] = plan['actionPack']['key'] = 'revenue_recovery'
    with pytest.raises(AgentContractError, match='mission_plan_economics_checkpoint_missing'):
        validate_mission_plan(plan, request)
