import unittest
from copy import deepcopy

from yux_agent_runtime.mission_account_availability import enforce_account_availability


def snapshot(*, connected='connected', enabled=True, planning=True):
    return {'accountAvailability': {'authority': 'server', 'organizationId': 'org-a',
        'tools': [{'key': 'radar', 'title': 'Radar Comercial', 'enabled': enabled, 'planningAvailable': planning, 'blockers': []},
                  {'key': 'whatsapp', 'title': 'WhatsApp', 'enabled': True, 'planningAvailable': False,
                   'blockers': ['integration_not_enabled_for_account']}],
        'connections': [{'key': 'whatsapp', 'status': connected}]}}


def response(reply):
    return {'kind': 'questions', 'reply': reply, 'questions': [
        {'key': 'connection', 'label': 'O WhatsApp está conectado nesta conta?'},
        {'key': 'economics', 'label': 'Qual pedido mínimo mantém a entrega rentável?'}],
        'brief': {'packKeys': []}, 'suggestedActions': [],
        'readiness': {'status': 'needs_information', 'knownFacts': [], 'assumptions': [], 'missing': [
            {'key': 'connection', 'category': 'integration', 'reason': 'Confirmar se o WhatsApp está conectado', 'requiredFor': ['mission_planning']},
            {'key': 'economics', 'category': 'offer', 'reason': 'Pedido mínimo rentável', 'requiredFor': ['mission_planning']}]}}


class MissionAdvisoryResponseTest(unittest.TestCase):
    def test_account_question_never_erases_useful_strategy_or_blocks_consulting(self):
        text = ('Eu começaria pelas cozinhas industriais, pois combinam compra em volume e recorrência.\n\n'
                'Como hipótese de expansão, testaria redes regionais de hotéis depois de validar margem e logística.\n\n'
                'No CRM, separaria interesse, qualificação, amostra e proposta; uma recusa encerra a cadência.')
        parsed = response(text)
        original = deepcopy(parsed)
        result = enforce_account_availability(parsed, snapshot(connected='not_connected'), 'org-a')
        self.assertIn(text, result['reply'])
        self.assertEqual([q['key'] for q in result['questions']], ['economics'])
        self.assertEqual([m['key'] for m in result['readiness']['missing']], ['economics'])
        self.assertEqual(result['readiness']['status'], 'needs_information')
        self.assertEqual(parsed, original)

    def test_only_the_configuration_sentence_is_corrected(self):
        text = ('Priorize recorrência e concentração geográfica. O WhatsApp está conectado nesta conta? '
                'Podemos preparar uma abordagem por segmento e exemplos de mensagens para revisão.')
        result = enforce_account_availability(response(text), snapshot(connected='not_connected'), 'org-a')
        self.assertIn('Priorize recorrência e concentração geográfica.', result['reply'])
        self.assertIn('Podemos preparar uma abordagem por segmento', result['reply'])
        self.assertNotIn('O WhatsApp está conectado nesta conta?', result['reply'])

    def test_wrong_module_claim_is_corrected_without_removing_the_recommendation(self):
        parsed = response('O Radar Comercial não está habilitado nesta conta. Eu organizaria a captação por segmento e região.')
        parsed['questions'] = []
        parsed['readiness']['missing'] = []
        result = enforce_account_availability(parsed, snapshot(enabled=True, planning=True), 'org-a')
        self.assertNotIn('Radar Comercial não está habilitado', result['reply'])
        self.assertIn('Eu organizaria a captação por segmento e região.', result['reply'])

    def test_a_missing_technical_metadata_field_does_not_replace_the_answer(self):
        parsed = response('A oportunidade principal é reduzir o esforço de compra recorrente do cliente.')
        parsed['questions'] = []
        result = enforce_account_availability(parsed, snapshot(connected='unverified'), 'org-a')
        self.assertEqual(result['reply'], parsed['reply'])
        self.assertNotIn('connection', [m['key'] for m in result['readiness']['missing']])

    def test_correct_state_statement_and_business_permissions_remain_natural(self):
        parsed = response('O Radar Comercial está habilitado nesta conta. Podemos comparar segmentos antes de escolher uma pesquisa.')
        parsed['questions'] = [{'key': 'consent', 'label': 'Você autoriza usar o nome de um cliente na prova social?'}]
        parsed['readiness']['missing'] = []
        result = enforce_account_availability(parsed, snapshot(), 'org-a')
        self.assertEqual(result, parsed)

    def test_concrete_execution_keeps_connection_blocker_without_asking_the_customer_to_verify(self):
        parsed = response('Vou preparar o envio pelo WhatsApp para sua aprovação.')
        parsed.update(kind='brief_confirmation', brief={'packKeys': ['funnel_nurture_v1']})
        parsed['readiness']['status'] = 'ready_for_brief_confirmation'
        result = enforce_account_availability(parsed, snapshot(connected='not_connected'), 'org-a')
        self.assertEqual(result['readiness']['status'], 'needs_configuration')
        self.assertTrue(any(m['category'] == 'integration' for m in result['readiness']['missing']))
        self.assertNotIn('connection', [q['key'] for q in result['questions']])

    def test_publicity_connection_is_not_inferred_from_a_prospecting_campaign(self):
        operational = snapshot()
        operational['accountAvailability']['connections'].append({'key': 'ads_provider', 'status': 'not_connected'})
        parsed = response('O Radar Comercial está habilitado nesta conta? Podemos preparar uma campanha de prospecção.')
        parsed['questions'] = []
        parsed['readiness']['missing'] = []
        result = enforce_account_availability(parsed, operational, 'org-a')
        self.assertNotIn('anúncios', result['reply'])
        self.assertIn('Podemos preparar uma campanha de prospecção.', result['reply'])

    def test_central_email_availability_is_not_described_as_an_absent_service(self):
        operational = snapshot()
        operational['accountAvailability']['tools'].append({'key': 'email', 'title': 'E-mail', 'enabled': True, 'planningAvailable': True})
        operational['accountAvailability']['connections'].append({'key': 'email', 'status': 'unverified', 'platformAvailable': True})
        parsed = response('O E-mail está conectado nesta conta? Eu prepararia uma primeira mensagem breve com uma proposta de valor específica.')
        parsed['questions'] = []
        parsed['readiness']['missing'] = []
        result = enforce_account_availability(parsed, operational, 'org-a')
        self.assertIn('configurado na plataforma', result['reply'])
        self.assertIn('proposta de valor específica.', result['reply'])
        self.assertNotIn('E-mail não está conectado', result['reply'])
