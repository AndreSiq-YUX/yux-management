import unittest

from yux_agent_runtime.customer_context import CustomerContextService
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


class CustomerContextTest(unittest.TestCase):
    def setUp(self):
        self.store = InMemoryAgentRuntimeStore(tables={
            "organization_company_profiles": [
                {"id": "company-a", "organization_id": "org-a", "trade_name": "YUX", "industry": "IA", "positioning": "crescimento"},
                {"id": "company-b", "organization_id": "org-b", "trade_name": "Outra empresa", "industry": "Varejo"},
            ],
            "marketing_brand_profiles": [
                {"id": "brand-a", "organization_id": "org-a", "contract_id": "contract-a", "status": "active", "tone_of_voice": "consultivo", "brand_voice_summary": "Clara e direta", "vocabulary_dont": ["garantido"], "forbidden_topics": ["resultado garantido"], "compliance_notes": "Não prometer resultados."},
                {"id": "brand-b", "organization_id": "org-b", "contract_id": "contract-b", "status": "active", "brand_voice_summary": "Marca B"},
            ],
            "marketing_products_services": [{"id": "product-a", "organization_id": "org-a", "status": "active", "name": "Radar YUX", "description": "Captação ativa"}],
            "knowledge_sources": [
                {"id": "source-a", "organization_id": "org-a", "status": "published", "visibility": "both", "allowed_agent_profile_keys": [], "blocked_agent_profile_keys": []},
                {"id": "source-blocked", "organization_id": "org-a", "status": "published", "visibility": "both", "allowed_agent_profile_keys": [], "blocked_agent_profile_keys": ["ai_sdr_comercial_1"]},
                {"id": "source-internal", "organization_id": "org-a", "status": "published", "visibility": "internal", "allowed_agent_profile_keys": [], "blocked_agent_profile_keys": []},
                {"id": "source-draft", "organization_id": "org-a", "status": "draft", "visibility": "both"},
                {"id": "source-b", "organization_id": "org-b", "status": "published", "visibility": "both"},
            ],
            "knowledge_entries": [
                {"id": "entry-a", "organization_id": "org-a", "source_id": "source-a", "title": "Oferta YUX", "body": "Diagnóstico antes da proposta.", "status": "published"},
                {"id": "entry-blocked", "organization_id": "org-a", "source_id": "source-blocked", "title": "Bloqueado", "body": "Não deve aparecer.", "status": "published"},
                {"id": "entry-internal", "organization_id": "org-a", "source_id": "source-internal", "title": "Nota interna", "body": "Nunca enviar ao contato.", "status": "published"},
                {"id": "entry-draft", "organization_id": "org-a", "source_id": "source-draft", "title": "Rascunho", "body": "Ainda não publicado.", "status": "draft"},
                {"id": "entry-b", "organization_id": "org-b", "source_id": "source-b", "title": "Segredo B", "body": "Nunca deve vazar.", "status": "published"},
            ],
            "marketing_knowledge_documents": [
                {"id": "doc-a", "organization_id": "org-a", "source_id": "source-a", "status": "published"},
            ],
            "marketing_knowledge_chunks": [
                {"id": "chunk-keyword", "organization_id": "org-a", "document_id": "doc-a", "entry_id": "entry-a", "chunk_kind": "curated_fact", "curation_status": "approved", "body": "Diagnóstico comercial tradicional.", "quality_score": 0.8, "embedding": [0.0, 1.0]},
                {"id": "chunk-semantic", "organization_id": "org-a", "document_id": "doc-a", "entry_id": "entry-a", "chunk_kind": "curated_fact", "curation_status": "approved", "body": "Mapeamento completo da operação.", "quality_score": 0.9, "embedding": [1.0, 0.0], "source_locator": "page:4"},
            ],
        })

    def test_retrieves_only_published_tenant_safe_context(self):
        result = CustomerContextService(self.store).retrieve(
            organization_id="org-a", contract_id="contract-a", profile_key="ai_sdr_comercial_1", query="diagnóstico proposta", external=True
        )
        text = str(result)
        self.assertIn("Diagnóstico comercial tradicional", text)
        self.assertIn("resultado garantido", text)
        self.assertNotIn("Não deve aparecer", text)
        self.assertNotIn("Nunca enviar ao contato", text)
        self.assertNotIn("Ainda não publicado", text)
        self.assertNotIn("Segredo B", text)
        self.assertEqual(result["brand_profile_id"], "brand-a")

    def test_prefers_semantically_matching_approved_curated_fact(self):
        class Embeddings:
            def embed_query(self, _query):
                return [1.0, 0.0]

        result = CustomerContextService(self.store, embedding_service=Embeddings()).retrieve(
            organization_id="org-a", contract_id="contract-a", profile_key="ai_sdr_comercial_1", query="diagnóstico", external=True
        )
        self.assertEqual(result["company_chunks"][0]["id"], "company:chunk-semantic")
        self.assertEqual(result["company_chunks"][0]["source_locator"], "page:4")


if __name__ == "__main__":
    unittest.main()
