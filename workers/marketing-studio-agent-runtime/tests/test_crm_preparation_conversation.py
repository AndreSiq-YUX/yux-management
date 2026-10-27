import unittest
from copy import deepcopy

from yux_agent_runtime.mission_contracts import MissionConversationTurnRequestWire
from yux_agent_runtime.mission_conversation import normalize_mission_conversation_response
from yux_agent_runtime.mission_router import MissionRouter


class CrmPreparationConversationTest(unittest.TestCase):
    def test_prepare_request_routes_to_preparation_even_when_the_objective_mentions_the_future_radar_or_campaign(self):
        route = MissionRouter().route({'mission': {'objective': 'Preparar funil e e-mails para depois importar leads do Radar',
            'mode': 'prepare', 'parameters': {}}, 'action_pack': {'key': 'crm_preparation'},
            'pack_catalog': [{'key': 'crm_preparation'}, {'key': 'funnel_nurture'}, {'key': 'radar_prospecting'}]})
        self.assertEqual(route.selected_pack_keys, ['crm_preparation'])
        self.assertEqual(route.specialist_profiles, ['funnel_nurture'])
        self.assertFalse(route.clarification_questions)

    def test_contradictory_ready_state_keeps_missing_context_and_returns_a_valid_message(self):
        request = MissionConversationTurnRequestWire.model_validate({
            'schemaVersion': 1, 'organization_id': 'org-a', 'conversation_id': 'conversation-a',
            'audience': 'client_user', 'user_message': 'Preparar os rascunhos do CRM e e-mails',
            'allowedActionPacks': [{'key': 'crm_preparation', 'version': '1.0.0', 'contentHash': 'a' * 64}],
        })
        for status in ('ready_for_plan', 'ready_for_brief_confirmation'):
            for category, expected in (('integration', 'needs_configuration'), ('offer', 'needs_information')):
                with self.subTest(status=status, category=category):
                    parsed = {'kind': 'brief_confirmation', 'reply': 'Podemos preparar os rascunhos após resolver este ponto.',
                        'questions': [], 'readiness': {'status': status, 'missing': [{
                            'key': 'required_input', 'category': category, 'reason': 'Falta uma informação obrigatória.',
                            'requiredFor': ['mission_planning']}]},
                        'brief': {'packKeys': ['crm_preparation'], 'mode': 'prepare'}, 'suggestedActions': [], 'sourceRefs': []}
                    original = deepcopy(parsed)
                    result = normalize_mission_conversation_response(parsed, request=request, retrieval_context={},
                        retrieval_trace_id='run-a', provider={})
                    self.assertEqual(result.readiness.status, expected)
                    self.assertEqual(result.readiness.missing[0].key, 'required_input')
                    self.assertEqual(result.kind, 'message')
                    self.assertEqual(result.reply, parsed['reply'])
                    self.assertEqual(parsed, original)

