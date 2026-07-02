import unittest

from yux_agent_runtime.radar import RadarCompanyInput, build_radar_workflow_spec, radar_policy_decision, synthesize_radar_output
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.workflow import StrategyWorkflowEngine


class RadarWorkflowTest(unittest.TestCase):
    def test_policy_decision_blocks_automatic_send(self):
        decision = radar_policy_decision()

        self.assertEqual(decision["status"], "requires_human_approval")
        self.assertFalse(decision["canSendAutomatically"])
        self.assertTrue(decision["canConvertToLead"])
        self.assertIn("message", decision["requiredReviewFields"])

    def test_synthesizes_radar_output_with_score_and_message(self):
        output = synthesize_radar_output(
            RadarCompanyInput(
                name="Clinica Boa Vida",
                segment="clinicas",
                city="Londrina",
                state="PR",
                website_url="https://boavida.com.br",
                channels=("email",),
                evidence=("Site publico encontrado.",),
            )
        )

        self.assertEqual(output["recommended_offer"], "Diagnostico YUX 48h")
        self.assertGreaterEqual(output["score"]["total_score"], 70)
        self.assertFalse(output["policyDecision"]["canSendAutomatically"])

    def test_strategy_engine_executes_radar_workflow_with_subagents(self):
        store = InMemoryAgentRuntimeStore()
        engine = StrategyWorkflowEngine(store)
        result = engine.execute(
            message="Analise oportunidade local para Clinica Boa Vida em Londrina",
            profile_key="ai_sdr_comercial_1",
            source="radar",
            organization_id="org-1",
            mode="commercial_radar_local_niche",
            workflow_spec=build_radar_workflow_spec(max_subagents=3),
            retrieval_context={"cards": [{"id": "card-radar", "concept": "Diagnostico 48h"}], "chunks": []},
            autonomy_policies=[
                {
                    "profile_key": "ai_sdr_comercial_1",
                    "channel": "strategy_admin",
                    "autonomy_mode": "approval_required",
                    "status": "active",
                }
            ],
        )

        self.assertIn(result["run"]["status"], ["waiting_approval", "succeeded"])
        self.assertEqual(len(store.tables["strategy_subagent_runs"]), 3)
        self.assertEqual(store.tables["agent_execution_runs"][0]["workflow_key"], "commercial_radar_local_niche")

    def test_strategy_engine_uses_default_radar_spec_when_not_provided(self):
        store = InMemoryAgentRuntimeStore()
        engine = StrategyWorkflowEngine(store)
        result = engine.execute(
            message="Analise oportunidade local para Clinica Boa Vida em Londrina",
            profile_key="ai_sdr_comercial_1",
            source="radar",
            organization_id="org-1",
            mode="commercial_radar_local_niche",
            retrieval_context={"cards": [], "chunks": []},
            autonomy_policies=[
                {
                    "profile_key": "ai_sdr_comercial_1",
                    "channel": "strategy_admin",
                    "autonomy_mode": "approval_required",
                    "status": "active",
                }
            ],
        )

        self.assertEqual(result["synthesis"]["workflow_key"], "commercial_radar_local_niche")
        self.assertEqual(len(store.tables["strategy_subagent_runs"]), 5)


if __name__ == "__main__":
    unittest.main()
