import unittest

from yux_agent_runtime.autonomy import resolve_autonomy_policy
from yux_agent_runtime.queue import AgentEventQueue, normalize_inbound_event
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.trace import sanitize_trace_payload
from yux_agent_runtime.workflow import StrategyWorkflowEngine, build_workflow_plan, classify_intent_and_stage, verify_output


class AgentHarnessRuntimeTest(unittest.TestCase):
    def test_trace_payload_masks_pii_and_hashes_full_message(self):
        safe = sanitize_trace_payload({"message": "Fale com ana@example.com pelo +55 11 99999-0000"})
        self.assertEqual(safe["message"]["preview"], "Fale com [email redacted] pelo [phone redacted]")
        self.assertIn("content_hash", safe["message"])

    def test_normalize_inbound_event_extracts_text_and_media_summary(self):
        normalized = normalize_inbound_event({"body": "Oi, quero orçamento", "attachments": [{"type": "audio"}], "phone": "5599"})

        self.assertEqual(normalized["content_text"], "Oi, quero orçamento")
        self.assertEqual(normalized["media_summary"], "1 midia(s) recebida(s)")
        self.assertEqual(normalized["normalized_payload"]["sender"], "5599")

    def test_queue_ingests_event_and_claims_job(self):
        store = InMemoryAgentRuntimeStore()
        queue = AgentEventQueue(store)
        result = queue.ingest_event({"conversation_id": "conv-1", "text": "Oi", "message_id": "msg-1"})

        self.assertEqual(result["event"]["status"], "received")
        self.assertEqual(result["job"]["status"], "queued")
        claimed = queue.claim_next_job("worker-1")
        self.assertEqual(claimed["status"], "running")
        self.assertEqual(claimed["attempt_count"], 1)

    def test_autonomy_policy_is_specific_and_blocks_sensitive_auto_send(self):
        decision = resolve_autonomy_policy(
            [
                {"id": "policy-default", "profile_key": "ai_sdr_comercial_1", "autonomy_mode": "suggestion", "status": "active"},
                {
                    "id": "policy-client",
                    "organization_id": "org-1",
                    "profile_key": "ai_sdr_comercial_1",
                    "action_key": "promise_discount",
                    "autonomy_mode": "auto_send",
                    "status": "active",
                },
            ],
            {
                "organization_id": "org-1",
                "profile_key": "ai_sdr_comercial_1",
                "channel": "whatsapp",
                "action_key": "promise_discount",
            },
            confidence=0.99,
        )

        self.assertEqual(decision.autonomy_mode, "approval_required")
        self.assertEqual(decision.reason, "sensitive_action_forces_approval")
        self.assertTrue(decision.requires_approval)

    def test_classifier_identifies_proposal_follow_up(self):
        classification = classify_intent_and_stage("Cliente pediu proposta e perguntou preço")

        self.assertEqual(classification["intent_key"], "proposal_follow_up")
        self.assertEqual(classification["stage_key"], "almost_customer")

    def test_workflow_plan_uses_configured_subagents(self):
        plan = build_workflow_plan(
            {
                "workflow_key": "diagnostic_48h",
                "max_subagents": 1,
                "subagent_specs": [{"key": "risk_auditor", "profile_key": "growth_strategist"}],
            },
            {"intent_key": "strategic_diagnosis"},
        )

        self.assertEqual(plan["workflow_key"], "diagnostic_48h")
        self.assertEqual([item["key"] for item in plan["subagents"]], ["risk_auditor"])

    def test_verifier_fails_when_required_terms_are_missing(self):
        result = verify_output({"analysis": "sem detalhes"}, {"minimum_score": 0.75}, ["crm", "caixa"])

        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["retry_recommended"])

    def test_strategy_workflow_records_trace_subagents_policy_and_learning_signal(self):
        store = InMemoryAgentRuntimeStore()
        engine = StrategyWorkflowEngine(store)
        result = engine.execute(
            message="Faça um diagnóstico 48h do funil e proposta",
            profile_key="growth_strategist",
            source="strategy_admin",
            organization_id="org-1",
            mode="diagnostic_48h",
            workflow_spec={"workflow_key": "diagnostic_48h", "max_subagents": 2},
            retrieval_context={"cards": [{"id": "card-1", "concept": "Comercial 2"}], "chunks": []},
            autonomy_policies=[{"profile_key": "growth_strategist", "channel": "strategy_admin", "autonomy_mode": "approval_required", "status": "active"}],
        )

        self.assertEqual(result["run"]["status"], "waiting_approval")
        self.assertEqual(result["policy"]["autonomy_mode"], "approval_required")
        self.assertGreaterEqual(len(store.tables["agent_execution_steps"]), 5)
        self.assertEqual(len(store.tables["strategy_subagent_runs"]), 2)
        self.assertEqual(len(store.tables["agent_learning_signals"]), 1)
        self.assertNotIn("agent_improvement_recommendations", store.tables)


if __name__ == "__main__":
    unittest.main()
