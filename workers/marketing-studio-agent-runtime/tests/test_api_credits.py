import os
import unittest
from typing import Any

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from fastapi.testclient import TestClient

from yux_agent_runtime.api import create_app
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.workflow import estimate_workflow_credits


AUTH = {"Authorization": "Bearer test-runtime-token"}


class BillingStore(InMemoryAgentRuntimeStore):
    """In-memory store with a fake credit wallet for API tests."""

    def __init__(self, balance: int = 100):
        super().__init__()
        self.balance = balance
        self.reservations: list[dict[str, Any]] = []

    def reserve_credits(self, *, organization_id, client_id, contract_id, credits, action, workflow_run_id=None):
        if credits > self.balance:
            raise RuntimeError("insufficient_ai_credits_or_invalid_wallet")
        self.balance -= credits
        reservation = {
            "organization_id": organization_id,
            "client_id": client_id,
            "contract_id": contract_id,
            "credits": credits,
            "action": action,
        }
        self.reservations.append(reservation)
        return {"reserved": credits, "current_balance": self.balance}


class EstimateWorkflowCreditsTest(unittest.TestCase):
    def test_default_workflow_charges_base_plus_default_subagents(self):
        self.assertEqual(estimate_workflow_credits(None, "diagnostic_48h", "strategy_admin"), 5)

    def test_max_subagents_limits_the_estimate(self):
        self.assertEqual(estimate_workflow_credits({"max_subagents": 2}, "diagnostic_48h", "strategy_admin"), 3)

    def test_whatsapp_conversation_turn_charges_base_only(self):
        self.assertEqual(estimate_workflow_credits(None, "conversation_turn", "whatsapp"), 1)


class ApiCreditsTest(unittest.TestCase):
    def _client(self, store: BillingStore) -> TestClient:
        return TestClient(create_app(store))

    def test_execute_workflow_ignores_caller_estimate_and_debits_server_value(self):
        store = BillingStore()
        client = self._client(store)

        response = client.post(
            "/workflows/execute",
            headers=AUTH,
            json={
                "message": "Diagnóstico do funil",
                "organization_id": "org-1",
                "client_id": "client-1",
                "contract_id": "contract-1",
                "mode": "diagnostic_48h",
                "workflow_spec": {"workflow_key": "diagnostic_48h", "max_subagents": 2},
                "estimated_credits": 0,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(store.reservations), 1)
        self.assertEqual(store.reservations[0]["credits"], 3)
        self.assertEqual(store.reservations[0]["action"], "agent_runtime_workflow")

    def test_execute_workflow_without_client_contract_is_not_billed(self):
        store = BillingStore()
        client = self._client(store)

        response = client.post(
            "/workflows/execute",
            headers=AUTH,
            json={"message": "Análise interna", "organization_id": "org-1"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(store.reservations, [])
        self.assertIsNone(response.json()["credits"])

    def test_process_next_debits_conversation_turn_credits(self):
        store = BillingStore()
        client = self._client(store)
        ingest = client.post(
            "/events/ingest",
            headers=AUTH,
            json={
                "organization_id": "org-1",
                "client_id": "client-1",
                "contract_id": "contract-1",
                "conversation_id": "conv-1",
                "text": "Oi, quero orçamento",
                "message_id": "msg-1",
            },
        )
        self.assertEqual(ingest.status_code, 200)

        response = client.post("/jobs/process-next", headers=AUTH)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["processed"])
        self.assertEqual(len(store.reservations), 1)
        self.assertEqual(store.reservations[0]["credits"], 1)
        self.assertEqual(store.reservations[0]["action"], "agent_runtime_conversation_turn")

    def test_process_next_dead_letters_job_when_credits_are_insufficient(self):
        store = BillingStore(balance=0)
        client = self._client(store)
        ingest = client.post(
            "/events/ingest",
            headers=AUTH,
            json={
                "organization_id": "org-1",
                "client_id": "client-1",
                "contract_id": "contract-1",
                "conversation_id": "conv-1",
                "text": "Oi",
                "message_id": "msg-2",
            },
        )
        self.assertEqual(ingest.status_code, 200)

        response = client.post("/jobs/process-next", headers=AUTH)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["processed"])
        self.assertEqual(response.json()["reason"], "insufficient_credits")
        jobs = store.tables["agent_queue_jobs"]
        self.assertEqual(jobs[0]["status"], "dead_letter")
        self.assertEqual(jobs[0]["last_error"], "insufficient_ai_credits_or_invalid_wallet")


if __name__ == "__main__":
    unittest.main()
