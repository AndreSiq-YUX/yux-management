import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from yux_agent_runtime.api import create_app
from yux_agent_runtime.mission_contracts import MissionConversationTurnResponseWire
from yux_agent_runtime.providers import ProviderRequestError
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


class MissionDiagnosticsTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"YUX_AGENT_RUNTIME_TOKEN": "test-token"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.request = {
            "schemaVersion": 1,
            "organization_id": "10000000-0000-4000-8000-000000000001",
            "conversation_id": "10000000-0000-4000-8000-000000000002",
            "audience": "client_user", "user_message": "private-client@example.com secret-content",
            "transcript": [], "operationalContext": {},
            "allowedActionPacks": [], "allowedCapabilityKeys": [],
        }

    def post(self, workflow, body=None):
        client = TestClient(create_app(InMemoryAgentRuntimeStore(), mission_conversation_workflow=workflow),
                            raise_server_exceptions=False)
        with self.assertLogs("yux_agent_runtime.api", level="ERROR") as captured:
            response = client.post("/missions/conversations/turn", headers={"Authorization": "Bearer test-token"},
                                   json=self.request if body is None else body)
        self.assertEqual(len(captured.records), 1)
        record = captured.records[0].getMessage()
        for private in ("private-client@example.com", "secret-content", "test-token", "sk-private-key"):
            self.assertNotIn(private, record)
        return response, json.loads(record)

    def test_unknown_source_code_logs_without_model_reference_content(self):
        class Workflow:
            def respond(self, _request):
                raise ValueError("mission_conversation_unknown_source_ref:private-client@example.com sk-private-key")

        response, diagnostic = self.post(Workflow())
        self.assertEqual(response.status_code, 422)
        self.assertEqual(diagnostic["code"], "mission_conversation_unknown_source_ref")
        self.assertEqual(diagnostic["conversation_id"], self.request["conversation_id"])
        self.assertEqual(diagnostic["frames"][-1]["function"], "respond")

    def test_response_validation_logs_field_and_type_without_inputs(self):
        class Workflow:
            def respond(self, request):
                return MissionConversationTurnResponseWire.model_validate({"reply": request.user_message})

        response, diagnostic = self.post(Workflow())
        self.assertEqual(response.status_code, 422)
        self.assertEqual(diagnostic["code"], "response_validation_failed")
        self.assertTrue(any(item["location"] == ["kind"] and item["type"] == "missing"
                            for item in diagnostic["validation_errors"]))

    def test_request_validation_logs_before_workflow_without_dynamic_extra_keys(self):
        class Workflow:
            def respond(self, _request):
                raise AssertionError("Workflow must not run")

        response, diagnostic = self.post(Workflow(), {**self.request, "sk-private-key": "secret-content"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(diagnostic["stage"], "request")
        self.assertEqual(diagnostic["validation_errors"][0]["location"], ["body", "[field]"])

    def test_invalid_json_logs_position_not_document(self):
        class Workflow:
            def respond(self, _request):
                json.loads("sk-private-key private-client@example.com")

        response, diagnostic = self.post(Workflow())
        self.assertEqual(response.status_code, 422)
        self.assertEqual(diagnostic["code"], "invalid_json")
        self.assertEqual(diagnostic["line"], 1)

    def test_unexpected_failure_keeps_500_and_logs_no_exception_message(self):
        class Workflow:
            def respond(self, _request):
                raise RuntimeError("sk-private-key secret-content")

        response, diagnostic = self.post(Workflow())
        self.assertEqual(response.status_code, 500)
        self.assertEqual(diagnostic["status"], 500)
        self.assertEqual(diagnostic["exception_type"], "RuntimeError")

    def test_provider_failure_keeps_503_without_provider_credentials(self):
        class Workflow:
            def respond(self, _request):
                raise ProviderRequestError("Authorization Bearer sk-private-key secret-content")

        response, diagnostic = self.post(Workflow())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "mission_conversation_provider_unavailable")
        self.assertEqual(diagnostic["stage"], "provider")

    def test_other_endpoints_keep_default_validation_without_mission_logs(self):
        client = TestClient(create_app(InMemoryAgentRuntimeStore()))
        with self.assertNoLogs("yux_agent_runtime.api", level="ERROR"):
            response = client.post("/workflows/execute", headers={"Authorization": "Bearer test-token"}, json={})
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
