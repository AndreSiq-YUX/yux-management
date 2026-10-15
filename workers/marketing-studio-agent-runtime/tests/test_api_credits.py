import os
import unittest
from unittest.mock import patch
from typing import Any

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from fastapi.testclient import TestClient

from yux_agent_runtime.api import create_app
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.workflow import estimate_workflow_credits
from yux_agent_runtime.mission_contracts import MissionConversationTurnResponseWire
from yux_agent_runtime.providers import ProviderRequestError


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
    def test_completed_radar_request_is_recovered_without_another_analysis_or_credit(self):
        store = BillingStore()
        payload = dict(organization_id='org', client_id='client', contract_id='contract', enabled=True,
                       request_id='receipt-example', identity={}, evidence=[dict(id='p', source_url='https://example.test', text='Empresa teste', kind='institutional_candidate')])
        def process(_store, **kwargs):
            kwargs['before_call']()
            return dict(scope='unresolved', reason='Sem identidade suficiente', claims=[])
        with patch('yux_agent_runtime.api.resolve_radar_presence', side_effect=process) as analysis:
            client = self._client(store)
            first = client.post('/radar/resolve-presence', headers=AUTH, json=payload)
            second = client.post('/radar/resolve-presence', headers=AUTH, json=payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.json(), first.json())
        self.assertEqual(analysis.call_count, 1)
        self.assertEqual(store.balance, 99)

    def test_radar_request_id_cannot_be_reused_with_changed_evidence(self):
        payload = dict(organization_id='org', enabled=True, request_id='receipt-conflict', identity={},
                       evidence=[dict(id='p', source_url='https://example.test', text='Empresa teste', kind='institutional_candidate')])
        with patch('yux_agent_runtime.api.resolve_radar_presence', return_value=dict(scope='unresolved', reason='Sem suporte suficiente', claims=[])) as analysis:
            client = self._client(BillingStore())
            self.assertEqual(client.post('/radar/resolve-presence', headers=AUTH, json=payload).status_code, 200)
            changed = {**payload, 'identity': {'name': 'Outra empresa'}}
            self.assertEqual(client.post('/radar/resolve-presence', headers=AUTH, json=changed).status_code, 409)
        self.assertEqual(analysis.call_count, 1)

    def test_radar_uncertain_call_is_not_automatically_replayed(self):
        payload = dict(organization_id='org', enabled=True, request_id='receipt-uncertain', identity={},
                       evidence=[dict(id='p', source_url='https://example.test', text='Empresa teste', kind='institutional_candidate')])
        def process(_store, **kwargs):
            kwargs['before_call']()
            raise ProviderRequestError('provider_http_500')
        with patch('yux_agent_runtime.api.resolve_radar_presence', side_effect=process) as analysis:
            client = self._client(BillingStore())
            client.post('/radar/resolve-presence', headers=AUTH, json=payload)
            self.assertEqual(client.post('/radar/resolve-presence', headers=AUTH, json=payload).status_code, 409)
        self.assertEqual(analysis.call_count, 1)

    def test_radar_does_not_mislabel_unexpected_processing_error_as_insufficient_credits(self):
        store = BillingStore()
        payload = dict(organization_id='org', client_id='client', contract_id='contract', enabled=True,
                       request_id='run:presence:hash', identity={}, evidence=[dict(id='p', source_url='https://example.test', text='Empresa teste', kind='institutional_candidate')])
        with patch('yux_agent_runtime.api.resolve_radar_presence', side_effect=RuntimeError('unexpected_private_detail')):
            response = TestClient(create_app(store), raise_server_exceptions=False).post('/radar/resolve-presence', headers=AUTH, json=payload)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('unexpected_private_detail', response.text)

    def test_radar_keeps_provider_credit_error_distinct_from_internal_wallet_rejection(self):
        payload = dict(organization_id='org', enabled=True, request_id='request', identity={},
                       evidence=[dict(id='p', source_url='https://example.test', text='Empresa teste', kind='institutional_candidate')])
        with patch('yux_agent_runtime.api.resolve_radar_presence', side_effect=ProviderRequestError('provider_http_402')):
            response = self._client(BillingStore()).post('/radar/resolve-presence', headers=AUTH, json=payload)
        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.json()['detail'], 'openrouter_credit_required')

    def test_radar_credit_rejection_is_explicit_and_prevents_provider_call(self):
        from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore
        from test_runtime_credit_policy import FakeCursor, FakeConnection
        for endpoint, body in [('/radar/resolve-presence', {'identity': {}, 'evidence': [dict(id='p', source_url='https://example.test', text='Empresa teste', kind='institutional_candidate')]}),
                               ('/radar/qualify', {'criteria': {}, 'evidence': [dict(id='p', source_url='https://example.test', text='Empresa teste')]})]:
            for wallet, code in [(None, 'radar_ai_wallet_missing'), ({'id': 'wallet'}, 'radar_ai_credits_insufficient')]:
                with self.subTest(endpoint=endpoint, code=code):
                    cursor = FakeCursor(); cursor.rows = [None, wallet]
                    durable = PostgresAgentRuntimeStore('postgresql://test')
                    durable._connection = lambda: FakeConnection(cursor)
                    durable._row_factory = lambda: None
                    store = BillingStore(); store.reserve_credits = durable.reserve_credits
                    def process(_store, **kwargs):
                        kwargs['before_call']()
                        self.fail('A rejected reservation must never reach the provider')
                    name = 'resolve_radar_presence' if endpoint.endswith('resolve-presence') else 'qualify_radar_business'
                    with patch('yux_agent_runtime.api.' + name, side_effect=process):
                        response = self._client(store).post(endpoint, headers=AUTH, json={**body, 'organization_id': 'org', 'client_id': 'client', 'contract_id': 'contract', 'enabled': True, 'request_id': 'request'})
                    self.assertEqual(response.status_code, 402)
                    self.assertEqual(response.json()['detail'], code)

    def _client(self, store: BillingStore, conversation_workflow=None) -> TestClient:
        return TestClient(create_app(store, mission_conversation_workflow=conversation_workflow))

    def test_health_requires_runtime_auth_without_calling_a_paid_provider(self):
        client = self._client(BillingStore())
        self.assertEqual(client.get("/health").status_code, 401)
        self.assertEqual(client.get("/health", headers=AUTH).json(), {
            "status": "ok", "service": "yux-agent-harness-runtime",
            "deployment": {"commit": "unrecorded", "manifestSha256": "unrecorded"},
        })

    @staticmethod
    def _mission_turn_request():
        return {
            "schemaVersion": 1, "organization_id": "org-1", "client_id": "client-1",
            "contract_id": "contract-1", "conversation_id": "conversation-1",
            "audience": "client_user", "user_message": "Quero uma campanha",
            "transcript": [], "rollingSummary": "", "currentBrief": {},
            "operationalContext": {}, "allowedActionPacks": [], "allowedCapabilityKeys": [],
        }

    @staticmethod
    def _conversation_response():
        return MissionConversationTurnResponseWire.model_validate({
            "schemaVersion": 1, "kind": "message", "reply": "Vamos começar.",
            "understood": {}, "questions": [],
            "readiness": {"status": "needs_information", "knownFacts": [], "assumptions": [], "missing": []},
            "brief": {"objective": "", "requestedOutcome": ""}, "suggestedActions": [], "sources": [],
            "retrievalTraceId": "trace-1", "contextHash": "a" * 64,
            "usage": {"inputTokens": 10, "outputTokens": 5, "totalTokens": 15},
        })

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

    def test_mission_conversation_turn_debits_one_server_side_credit(self):
        class Conversation:
            def respond(self, _request):
                return ApiCreditsTest._conversation_response()

        store = BillingStore()
        response = self._client(store, Conversation()).post(
            "/missions/conversations/turn", headers=AUTH, json=self._mission_turn_request()
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["retrievalTraceId"], "trace-1")
        self.assertEqual(store.reservations[0]["credits"], 1)
        self.assertEqual(store.reservations[0]["action"], "agent_runtime_mission_conversation_turn")

    def test_mission_conversation_turn_returns_402_before_provider_when_credits_are_insufficient(self):
        class Conversation:
            called = False

            def respond(self, _request):
                self.called = True
                return ApiCreditsTest._conversation_response()

        conversation = Conversation()
        response = self._client(BillingStore(balance=0), conversation).post(
            "/missions/conversations/turn", headers=AUTH, json=self._mission_turn_request()
        )

        self.assertEqual(response.status_code, 402)
        self.assertFalse(conversation.called)

    def test_mission_conversation_turn_maps_contract_and_provider_failures(self):
        class InvalidContract:
            def respond(self, _request):
                raise ValueError("mission_conversation_question_keys_duplicate")

        class UnavailableProvider:
            def respond(self, _request):
                raise ProviderRequestError("timeout")

        invalid = self._client(BillingStore(), InvalidContract()).post(
            "/missions/conversations/turn", headers=AUTH, json=self._mission_turn_request()
        )
        unavailable = self._client(BillingStore(), UnavailableProvider()).post(
            "/missions/conversations/turn", headers=AUTH, json=self._mission_turn_request()
        )

        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(unavailable.status_code, 503)
        self.assertEqual(unavailable.json()["detail"], "mission_conversation_provider_unavailable")


if __name__ == "__main__":
    unittest.main()
