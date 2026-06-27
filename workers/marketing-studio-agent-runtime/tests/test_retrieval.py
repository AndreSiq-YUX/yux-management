import unittest

from yux_agent_runtime.retrieval import (
    InMemoryStrategyKnowledgeStore,
    StrategyRetrievalService,
    retrieve_strategy_context,
    set_default_strategy_retrieval_service,
)


CARDS = [
    {
        "id": "card-growth-1",
        "concept": "Comercial 2",
        "category": "retencao",
        "visibility": "internal_only",
        "source_scope": "internal",
        "problem_solved": "Clientes compram uma vez e desaparecem.",
        "trigger_signals": ["sem follow-up pos-venda"],
        "diagnosis_questions": ["Quando foi a ultima segunda compra?"],
        "decision_rules": ["Priorize recorrencia antes de aquisicao fria."],
        "recommended_actions": ["Criar carteira de clientes."],
        "allowed_agent_profile_keys": ["growth_strategist", "customer_growth_comercial_2"],
        "stage_tags": ["recurring_customer"],
        "retrieval_tags": ["recorrencia", "ltv"],
        "human_review_status": "approved",
        "updated_at": "2026-06-10T12:00:00Z",
    },
    {
        "id": "card-sdr-spin",
        "concept": "SPIN SDR",
        "category": "comercial_1",
        "visibility": "client_safe",
        "source_scope": "system",
        "problem_solved": "Lead levantou a mao, mas ainda nao foi diagnosticado.",
        "trigger_signals": ["pedido de orcamento", "interesse via whatsapp"],
        "diagnosis_questions": ["Qual situacao atual?", "Qual implicacao do problema?"],
        "decision_rules": ["Pergunte antes de apresentar solucao."],
        "recommended_actions": ["Conduzir diagnostico SPIN e registrar proximo passo."],
        "allowed_agent_profile_keys": ["ai_sdr_comercial_1"],
        "stage_tags": ["raised_hand"],
        "retrieval_tags": ["spin", "qualificacao", "whatsapp"],
        "human_review_status": "approved",
        "updated_at": "2026-06-11T12:00:00Z",
    },
    {
        "id": "card-support",
        "concept": "Suporte receptivo",
        "category": "suporte",
        "visibility": "client_safe",
        "source_scope": "system",
        "problem_solved": "Cliente precisa de resposta operacional sem pressao comercial.",
        "trigger_signals": ["duvida tecnica", "status de atendimento"],
        "diagnosis_questions": ["Qual problema precisa ser resolvido agora?"],
        "decision_rules": ["Nao criar pressao de venda em chamado de suporte."],
        "recommended_actions": ["Triar e encaminhar para a fila correta."],
        "allowed_agent_profile_keys": ["support_assistant"],
        "stage_tags": ["first_purchase_customer"],
        "retrieval_tags": ["suporte", "triagem"],
        "human_review_status": "approved",
        "updated_at": "2026-06-09T12:00:00Z",
    },
    {
        "id": "card-closing",
        "concept": "Fechamento de proposta",
        "category": "closing",
        "visibility": "internal_only",
        "source_scope": "internal",
        "problem_solved": "Quase-cliente travado por objecao de preco.",
        "trigger_signals": ["preco", "proposta parada"],
        "diagnosis_questions": ["Qual risco de nao decidir agora?"],
        "decision_rules": ["Trabalhe objecao sem prometer desconto nao aprovado."],
        "recommended_actions": ["Gerar follow-up de proposta com proxima acao clara."],
        "allowed_agent_profile_keys": ["ai_closer", "offer_conversion"],
        "stage_tags": ["almost_customer"],
        "retrieval_tags": ["proposta", "objecao", "preco"],
        "human_review_status": "approved",
        "updated_at": "2026-06-12T12:00:00Z",
    },
]

CHUNKS = [
    {
        "id": "chunk-growth-1",
        "chunk_text": "Recorrencia e aumento de LTV devem ser avaliados antes de comprar trafego frio.",
        "visibility": "internal_only",
        "source_scope": "internal",
        "allowed_agent_profile_keys": ["growth_strategist", "metrics_cash_mroi"],
        "stage_tags": ["recurring_customer"],
        "retrieval_tags": ["ltv", "recorrencia"],
        "human_review_status": "approved",
        "updated_at": "2026-06-10T12:00:00Z",
    },
    {
        "id": "chunk-sdr-1",
        "chunk_text": "O SDR deve diferenciar lead frio de levantada de mao e registrar o proximo passo.",
        "visibility": "client_safe",
        "source_scope": "system",
        "allowed_agent_profile_keys": ["ai_sdr_comercial_1"],
        "stage_tags": ["raised_hand"],
        "retrieval_tags": ["sdr", "follow-up"],
        "human_review_status": "approved",
        "updated_at": "2026-06-11T12:00:00Z",
    },
    {
        "id": "chunk-support-only",
        "chunk_text": "Atendimento receptivo deve resolver duvidas e evitar pressao comercial.",
        "visibility": "client_safe",
        "source_scope": "system",
        "allowed_agent_profile_keys": ["support_assistant"],
        "stage_tags": ["first_purchase_customer"],
        "retrieval_tags": ["suporte"],
        "human_review_status": "approved",
        "updated_at": "2026-06-09T12:00:00Z",
    },
]


class RetrievalTest(unittest.TestCase):
    def make_service(self, max_context_chars=5000):
        return StrategyRetrievalService(
            InMemoryStrategyKnowledgeStore(cards=CARDS, chunks=CHUNKS),
            max_context_chars=max_context_chars,
        )

    def test_growth_strategist_retrieves_broad_internal_cards_and_chunks(self):
        result = self.make_service().retrieve_strategy_context(
            profile_key="growth_strategist",
            organization_id="org-1",
            client_id="client-1",
            intent="diagnosis",
            stage="recurring_customer",
            query="recorrencia ltv comercial 2",
            max_cards=3,
            max_chunks=3,
        )

        self.assertEqual(result["cards"][0]["id"], "card-growth-1")
        self.assertEqual(result["chunks"][0]["id"], "chunk-growth-1")
        self.assertIn("Comercial 2", result["context_text"])
        self.assertEqual(result["retrieval_log"]["profile_key"], "growth_strategist")

    def test_sdr_retrieves_spin_stage_context_and_excludes_support_only(self):
        result = self.make_service().retrieve_strategy_context(
            profile_key="ai_sdr_comercial_1",
            organization_id=None,
            client_id=None,
            intent="qualification",
            stage="raised_hand",
            query="whatsapp lead levantou mao spin qualificacao",
            max_cards=5,
            max_chunks=5,
        )

        ids = {item["id"] for item in [*result["cards"], *result["chunks"]]}
        self.assertIn("card-sdr-spin", ids)
        self.assertIn("chunk-sdr-1", ids)
        self.assertNotIn("card-support", ids)
        self.assertNotIn("chunk-support-only", ids)

    def test_support_does_not_retrieve_closing_or_acquisition_context(self):
        result = self.make_service().retrieve_strategy_context(
            profile_key="support_assistant",
            organization_id=None,
            client_id=None,
            intent="support",
            stage="first_purchase_customer",
            query="duvida atendimento suporte proposta preco",
            max_cards=5,
            max_chunks=5,
        )

        card_ids = {item["id"] for item in result["cards"]}
        self.assertEqual(card_ids, {"card-support"})
        self.assertNotIn("card-closing", card_ids)

    def test_portal_safe_excludes_internal_only_records(self):
        result = self.make_service().retrieve_strategy_context(
            profile_key="ai_closer",
            organization_id=None,
            client_id=None,
            intent="proposal_follow_up",
            stage="almost_customer",
            query="proposta preco objecao",
            max_cards=5,
            max_chunks=5,
            portal_safe=True,
        )

        self.assertEqual(result["cards"], [])
        self.assertEqual(result["chunks"], [])
        self.assertEqual(result["retrieval_log"]["status"], "empty")

    def test_limits_cards_chunks_and_context_chars_by_item_boundary(self):
        result = self.make_service(max_context_chars=230).retrieve_strategy_context(
            profile_key="ai_sdr_comercial_1",
            organization_id=None,
            client_id=None,
            intent="qualification",
            stage="raised_hand",
            query="whatsapp spin qualificacao follow-up",
            max_cards=1,
            max_chunks=1,
        )

        self.assertLessEqual(len(result["cards"]), 1)
        self.assertLessEqual(len(result["chunks"]), 1)
        self.assertLessEqual(len(result["context_text"]), 230)
        self.assertIn("card-sdr-spin", result["retrieval_log"]["result_ids"])

    def test_retrieval_log_includes_filters_and_returned_ids(self):
        service = self.make_service()
        result = service.retrieve_strategy_context(
            profile_key="ai_sdr_comercial_1",
            organization_id="org-1",
            client_id="client-1",
            intent="qualification",
            stage="raised_hand",
            query="qualificacao spin",
            max_cards=2,
            max_chunks=2,
        )

        log = result["retrieval_log"]
        self.assertEqual(log["filters"]["profile_key"], "ai_sdr_comercial_1")
        self.assertEqual(log["filters"]["stage"], "raised_hand")
        self.assertEqual(log["query"], "qualificacao spin")
        self.assertIn("card-sdr-spin", log["result_ids"])
        self.assertEqual(service.store.retrieval_logs[-1]["result_card_ids"], ["card-sdr-spin"])

    def test_module_level_function_uses_configured_default_service(self):
        service = self.make_service()
        set_default_strategy_retrieval_service(service)

        result = retrieve_strategy_context(
            profile_key="support_assistant",
            organization_id=None,
            client_id=None,
            intent="support",
            stage="first_purchase_customer",
            query="suporte",
            max_cards=1,
            max_chunks=1,
        )

        self.assertEqual(result["cards"][0]["id"], "card-support")


if __name__ == "__main__":
    unittest.main()
