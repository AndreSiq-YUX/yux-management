from __future__ import annotations

import copy
import os
import unittest

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "mission-test-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from fastapi.testclient import TestClient

from yux_agent_runtime.api import create_app
from yux_agent_runtime.contracts import AgentContractError, validate_mission_plan
from yux_agent_runtime.mission import plan_mission
from yux_agent_runtime.mission_supervisor import MissionSupervisorError
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


def planning_input() -> dict:
    keys = [
        "pack.readiness", "pack.baseline", "pack.find_candidates", "pack.apply_exclusions", "pack.segment",
        "pack.approve_population", "pack.prepare_outreach", "pack.approve_canary", "pack.execute_outreach",
        "pack.wait_signals", "pack.collect_metrics_and_costs", "pack.evaluate",
    ]
    capabilities = [
        {"key": "crm.pipeline.snapshot", "version": 1, "effect": "none"},
        {"key": "human.task.create", "version": 1, "effect": "internal"},
    ]
    steps = []
    for index, key in enumerate(keys):
        capability = "crm.pipeline.snapshot" if index < 5 or index >= 9 else "human.task.create"
        steps.append({"stepKey": key, "dependsOn": [] if index == 0 else [keys[index - 1]], "capabilityKey": capability,
                      "capabilityVersion": 1, "input": {}, "timeoutSeconds": 300, "maxAttempts": 1,
                      "approvalRequired": "approve" in key, "effect": "none" if capability.startswith("crm") else "internal",
                      "outputBindings": {}})
    return {
        "organization_id": "org-1", "mission": {"id": "mission-1", "parameters": {}, "budget": {}},
        "action_pack": {"key": "revenue_recovery", "semanticVersion": "0.1.0", "contentHash": "a" * 64,
                        "protectedStepKeys": keys, "topologyTemplate": {"steps": []}},
        "readiness": {"ready": True}, "capabilities": capabilities,
        "proposed_plan": {"schemaVersion": 1, "missionId": "mission-1",
                          "actionPack": {"key": "revenue_recovery", "version": "0.1.0", "templateHash": "a" * 64},
                          "estimatedEconomics": {"currency": "BRL", "totalExecutionCost": "10"}, "steps": steps},
    }


class MissionPlanContractTests(unittest.TestCase):
    def test_rejects_capability_outside_catalog(self) -> None:
        value = planning_input()
        value["proposed_plan"]["steps"][0]["capabilityKey"] = "campaign.change_budget"
        with self.assertRaisesRegex(AgentContractError, "mission_plan_capability_not_allowed"):
            validate_mission_plan(value["proposed_plan"], value)

    def test_rejects_missing_economics_checkpoint(self) -> None:
        value = planning_input()
        value["proposed_plan"]["steps"] = [step for step in value["proposed_plan"]["steps"] if step["stepKey"] != "pack.collect_metrics_and_costs"]
        with self.assertRaisesRegex(AgentContractError, "mission_plan_protected_step_missing"):
            validate_mission_plan(value["proposed_plan"], value)

    def test_rejects_cycles_and_external_effect_without_approval(self) -> None:
        value = planning_input()
        value["proposed_plan"]["steps"][0]["dependsOn"] = ["pack.evaluate"]
        with self.assertRaisesRegex(AgentContractError, "mission_plan_cycle_detected"):
            validate_mission_plan(value["proposed_plan"], value)
        value = planning_input()
        value["proposed_plan"]["steps"][0].update({"effect": "external", "approvalRequired": False})
        with self.assertRaisesRegex(AgentContractError, "mission_plan_external_approval_required"):
            validate_mission_plan(value["proposed_plan"], value)

    def test_returns_typed_trace_without_persisting_action_engine_state(self) -> None:
        result = plan_mission(planning_input())
        self.assertEqual(result["trace"]["workflowKey"], "mission_revenue_recovery_pack_v0")
        self.assertEqual(result["trace"]["steps"], ["planner", "contract_verifier"])

    def test_generic_pack_never_uses_the_legacy_deterministic_fallback(self) -> None:
        value = planning_input()
        value.pop("proposed_plan")
        value["action_pack"].update({"key": "crm_funnel", "semanticVersion": "1.0.0"})
        with self.assertRaisesRegex(MissionSupervisorError, "mission_supervisor_model_unavailable"):
            plan_mission(value)

    def test_endpoint_requires_bearer_and_tenant(self) -> None:
        client = TestClient(create_app(store=InMemoryAgentRuntimeStore()))
        payload = planning_input()
        denied = client.post("/missions/plan", json=payload)
        self.assertEqual(denied.status_code, 401)
        accepted = client.post(
            "/missions/plan",
            json=payload,
            headers={"Authorization": f"Bearer {os.environ['YUX_AGENT_RUNTIME_TOKEN']}"},
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["plan"]["missionId"], "mission-1")

    def test_endpoint_rejects_invalid_tenant_before_planning(self) -> None:
        class RejectingTenantStore(InMemoryAgentRuntimeStore):
            def validate_tenant(self, organization_id, client_id=None, contract_id=None):
                return False

        client = TestClient(create_app(store=RejectingTenantStore()))
        response = client.post(
            "/missions/plan",
            json=planning_input(),
            headers={"Authorization": f"Bearer {os.environ['YUX_AGENT_RUNTIME_TOKEN']}"},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
