import unittest
from copy import deepcopy

from yux_agent_runtime.mission_contracts import MissionConversationTurnRequestWire
from yux_agent_runtime.mission_conversation import normalize_mission_conversation_response
from yux_agent_runtime.mission_account_availability import enforce_account_availability


class MissionAccountAvailabilityTest(unittest.TestCase):
    def respond(self, *, enabled=True, planning=False, blockers=None, question=None, reply=None):
        payload = {
            'schemaVersion': 1, 'organization_id': 'org-a', 'conversation_id': 'conversation-a',
            'audience': 'client_user', 'user_message': 'Quais funcionalidades estão habilitadas?',
            'operationalContext': {'accountAvailability': {
                'authority': 'server', 'organizationId': 'org-a', 'enabledModules': ['radar'] if enabled else [],
                'actionAuthorization': 'not_granted_by_snapshot',
                'tools': [{'key': 'radar', 'title': 'Radar Comercial', 'enabled': enabled,
                           'planningAvailable': planning, 'blockers': blockers or []}],
            }},
        }
        parsed = {
            'kind': 'questions', 'reply': reply or 'Preciso confirmar se o Radar está habilitado nesta conta.',
            'understood': {}, 'questions': [question or {
                'key': 'radar_enabled', 'label': 'O Radar Comercial está habilitado e configurado nesta conta?',
                'whyNeeded': 'Confirmar disponibilidade', 'priority': 1, 'answerType': 'boolean', 'choices': [],
            }, {
                'key': 'consent', 'label': 'Você autoriza a pesquisa? O contato externo será decidido separadamente.',
                'whyNeeded': 'Decisão de negócio', 'priority': 2, 'answerType': 'boolean', 'choices': [],
            }],
            'readiness': {'status': 'needs_information', 'knownFacts': [], 'assumptions': [], 'missing': [
                {'key': 'radar_enabled', 'category': 'integration', 'reason': 'Confirmar se o Radar está habilitado', 'requiredFor': ['mission_planning']},
                {'key': 'consent', 'category': 'consent', 'reason': 'Autorização de pesquisa', 'requiredFor': ['mission_planning']},
            ]},
            'brief': {'objective': 'Captar empresas', 'packKeys': []}, 'suggestedActions': [], 'sourceRefs': [],
        }
        if question is not None:
            parsed['readiness']['missing'] = [item for item in parsed['readiness']['missing'] if item['key'] != 'radar_enabled']
        original = deepcopy(parsed)
        response = normalize_mission_conversation_response(parsed,
            request=MissionConversationTurnRequestWire.model_validate(payload), retrieval_context={},
            retrieval_trace_id='run-account', provider={})
        self.assertEqual(parsed, original)
        return response

    def test_replaces_configuration_question_with_actual_integration_blocker_and_keeps_consent(self):
        response = self.respond(blockers=['integration_not_enabled_for_account'])
        self.assertEqual([q.key for q in response.questions], ['consent'])
        self.assertIn('integração com Missões ainda não está liberada', response.reply)
        self.assertNotIn('Preciso confirmar', response.reply)
        self.assertEqual([item.key for item in response.readiness.missing], ['consent'])
        self.assertEqual(response.readiness.status, 'needs_information')
        self.assertEqual(response.brief.packKeys, [])
        self.assertEqual(response.suggestedActions, [])

    def test_enabled_and_disabled_are_stated_without_asking_the_client_to_verify(self):
        enabled = self.respond(planning=True)
        self.assertIn('disponível para planejamento', enabled.reply)
        self.assertNotIn('está habilitado e configurado nesta conta?', enabled.reply)
        disabled = self.respond(enabled=False, blockers=['module_not_enabled'])
        self.assertIn('não está habilitado nesta conta', disabled.reply)
        self.assertEqual([q.key for q in disabled.questions], ['consent'])

    def test_does_not_discard_a_business_choice_or_question_about_external_tools(self):
        for label in ['Você deseja usar o Radar para esta estratégia?', 'Quais ferramentas externas à YUX estão conectadas ao seu site?']:
            with self.subTest(label=label):
                question = {'key': 'business', 'label': label, 'whyNeeded': 'Definir estratégia', 'priority': 1, 'answerType': 'text', 'choices': []}
                response = self.respond(question=question, reply='Vamos definir a estratégia de captação.')
                self.assertIn('business', [q.key for q in response.questions])
                self.assertEqual(response.reply, 'Vamos definir a estratégia de captação.')

    def test_also_catches_the_question_when_only_in_free_text(self):
        question = {'key': 'offer', 'label': 'Qual oferta devemos apresentar?', 'whyNeeded': 'Definir a oferta', 'priority': 1, 'answerType': 'text', 'choices': []}
        response = self.respond(question=question, reply='O Radar Comercial está habilitado nessa conta?')
        self.assertNotIn('nessa conta?', response.reply)
        self.assertIn('offer', [q.key for q in response.questions])

    def test_preserves_business_availability_questions(self):
        for label in ['Quais horários estão disponíveis para contato pelo WhatsApp?', 'Quais ofertas estão disponíveis para a campanha?']:
            with self.subTest(label=label):
                parsed = {'kind': 'questions', 'reply': label, 'questions': [{'key': 'schedule', 'label': label}],
                    'readiness': {'status': 'needs_information', 'missing': [{'key': 'schedule', 'category': 'deadline', 'reason': label, 'requiredFor': []}]}}
                snapshot = {'accountAvailability': {'authority': 'server', 'organizationId': 'org-a', 'tools': [
                    {'key': 'whatsapp', 'title': 'WhatsApp', 'enabled': True, 'planningAvailable': True},
                    {'key': 'campaign', 'title': 'Campanha', 'enabled': True, 'planningAvailable': True}]}}
                self.assertEqual(enforce_account_availability(parsed, snapshot, 'org-a'), parsed)

    def test_connection_blocker_is_explained_and_kept_without_asking_the_user(self):
        for state, expected in [('not_connected', 'não está conectado'), ('unverified', 'Não foi possível verificar')]:
            with self.subTest(state=state):
                snapshot = {'accountAvailability': {'authority': 'server', 'organizationId': 'org-a',
                    'tools': [{'key': 'whatsapp', 'title': 'WhatsApp', 'enabled': True, 'planningAvailable': True, 'blockers': []}],
                    'connections': [{'key': 'whatsapp', 'status': state}]}}
                parsed = {'kind': 'questions', 'reply': 'O WhatsApp está conectado nesta conta?',
                    'questions': [{'key': 'connection', 'label': 'O WhatsApp está conectado nesta conta?'}],
                    'readiness': {'status': 'needs_information', 'missing': [{'key': 'connection', 'category': 'integration', 'reason': 'O WhatsApp está conectado nesta conta?', 'requiredFor': []}]}}
                result = enforce_account_availability(parsed, snapshot, 'org-a')
                self.assertEqual(result['questions'], [])
                self.assertIn(expected, result['reply'])
                self.assertEqual(result['readiness']['status'], 'needs_information')
                self.assertEqual(result['readiness']['missing'], [])

    def test_configuration_missing_field_is_resolved_even_without_a_question_card(self):
        parsed = {'kind': 'message', 'reply': 'Vamos continuar.', 'questions': [], 'readiness': {
            'status': 'needs_information', 'missing': [{'key': 'radar_enabled', 'category': 'integration',
                'reason': 'Confirmar se o Radar está habilitado nesta conta', 'requiredFor': []}]}}
        operational = {'accountAvailability': {'authority': 'server', 'organizationId': 'org-a', 'tools': [
            {'key': 'radar', 'title': 'Radar Comercial', 'enabled': False, 'planningAvailable': False}]}}
        result = enforce_account_availability(parsed, operational, 'org-a')
        self.assertEqual(result['reply'], 'Vamos continuar.')
        self.assertEqual(result['readiness']['missing'], [])


if __name__ == '__main__':
    unittest.main()
