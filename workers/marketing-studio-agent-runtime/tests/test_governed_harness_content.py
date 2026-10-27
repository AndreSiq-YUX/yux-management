import unittest

from yux_agent_runtime.harness import compose_prompt
from yux_agent_runtime.retrieval import StrategyRetrievalService


class AuthorizedStore:
    def __init__(self, content):
        self.content = content

    def search_authorized(self, **kwargs):
        return [{'namespace': 'strategy', 'id': 'approved-card', 'publication_id': 'published',
                 'item_id': 'item-a', 'content': self.content, 'source_content_hash': 'a' * 64,
                 'use_mode': 'internal_reasoning', 'combined_score': 1}]

    def log_retrieval_query(self, payload):
        return payload


class GovernedHarnessContentTest(unittest.TestCase):
    def retrieve(self, content, budget=5000):
        return StrategyRetrievalService(AuthorizedStore(content), max_context_chars=budget).retrieve_strategy_context(
            profile_key='growth_strategist', organization_id='org-a', client_id=None,
            contract_id='contract-a', audience='client_user', intent='strategy', stage=None,
            query='recorrência e expansão', max_cards=8, max_chunks=4, approved_only=True,
        )

    def prompt(self, retrieved):
        return compose_prompt({'system_prompt': 'Atue como estrategista.'},
                              {'agent_type': 'growth_strategist', 'base_prompt': 'Ajude esta empresa.'},
                              {'strategy_context': {'concept_cards': retrieved['cards']}})

    def test_governed_body_reaches_model_instead_of_only_its_title(self):
        body = 'Segmentação por valor\nPriorize recorrência e potencial de expansão, não apenas volume de nomes.'
        prompt = self.prompt(self.retrieve(body))
        self.assertIn('Priorize recorrência e potencial de expansão', prompt['context_block'])
        self.assertNotIn('Priorize recorrência', prompt['system_prompt'])

    def test_prompt_uses_the_budgeted_excerpt_without_reintroducing_full_source(self):
        body = 'Estratégia\n' + ('Avalie recorrência antes de expandir o mercado. ' * 40) + 'FIM_FORA_DO_ORCAMENTO'
        retrieved = self.retrieve(body, budget=200)
        prompt = self.prompt(retrieved)
        self.assertLessEqual(len(retrieved['context_text']), 200)
        self.assertIn('Avalie recorrência', prompt['context_block'])
        self.assertNotIn('FIM_FORA_DO_ORCAMENTO', prompt['context_block'])
        self.assertIn('FIM_FORA_DO_ORCAMENTO', retrieved['cards'][0]['content'])
        self.assertIn(retrieved['cards'][0]['context_excerpt'], retrieved['context_text'])

    def test_legacy_card_preserves_diagnosis_decision_and_anti_patterns(self):
        prompt = self.prompt({'cards': [{'id': 'old', 'concept': 'Recorrência',
            'diagnosis_questions': ['Quem recompra todo mês?'],
            'decision_rules': ['Priorize recompra antes de aquisição.'],
            'anti_patterns': ['Não confundir interesse com demanda recorrente.']}]})
        for text in ['Quem recompra todo mês?', 'Priorize recompra antes de aquisição.',
                     'Não confundir interesse com demanda recorrente.']:
            self.assertIn(text, prompt['context_block'])

    def test_authorized_empty_result_does_not_fall_back_to_unapproved_cards(self):
        store = AuthorizedStore('unused')
        store.search_authorized = lambda **kwargs: []
        store.list_cards = lambda: [{'id': 'private', 'concept': 'SEGREDO_NAO_PUBLICADO'}]
        retrieved = StrategyRetrievalService(store).retrieve_strategy_context(
            profile_key='growth_strategist', organization_id='org-a', client_id=None,
            intent='strategy', stage=None, query='consulta', max_cards=8, max_chunks=4, approved_only=True)
        self.assertNotIn('SEGREDO_NAO_PUBLICADO', self.prompt(retrieved)['context_block'])
