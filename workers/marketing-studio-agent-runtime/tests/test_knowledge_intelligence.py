import os
import unittest

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from fastapi.testclient import TestClient

from yux_agent_runtime.api import create_app
from yux_agent_runtime.knowledge_intelligence import KnowledgeIntelligenceService
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


class FakeLlm:
    def chat_completion(self, **_kwargs):
        return {
            "provider": "openrouter",
            "model": "test-model",
            "content": '''{"summary":"Atuação nacional.","facts":[
              {"statement":"A empresa atende todo o Brasil.","category":"company","evidence_excerpt":"atende todo o Brasil","source_locator":"page:3","confidence":0.95,"usefulness":0.9,"agent_profiles":["ai_sdr_comercial_1"],"sensitivity":"public"},
              {"statement":"Possui mil clientes.","category":"proof","evidence_excerpt":"mil clientes","source_locator":"page:3","confidence":0.8,"usefulness":0.8,"agent_profiles":[],"sensitivity":"public"}
            ],"discarded":[],"warnings":[]}''',
        }


class FakeWebsiteLlm:
    def chat_completion(self, **_kwargs):
        return {
            "provider": "openrouter",
            "model": "test-model",
            "content": '''{"suggestions":[
              {"suggestion_kind":"profile","field_path":"tradeName","suggested_value":"YUX","evidence_excerpt":"YUX Solucoes em IA","source_url":"https://yux.test/","confidence":0.98},
              {"suggestion_kind":"brand","field_path":"visualIdentity","suggested_value":{"logoUrl":"https://yux.test/logo.svg","colors":["#5519ff"]},"evidence_excerpt":"Cores detectadas no site: #5519ff","source_url":"https://yux.test/","confidence":0.9},
              {"suggestion_kind":"brand","field_path":"forbiddenTopics","suggested_value":["precos"],"evidence_excerpt":"YUX Solucoes em IA","source_url":"https://yux.test/","confidence":0.5},
              {"suggestion_kind":"profile","field_path":"industry","suggested_value":"Tecnologia","evidence_excerpt":"consultoria juridica","source_url":"https://yux.test/","confidence":0.7}
            ],"warnings":[]}''',
        }


class KnowledgeIntelligenceTest(unittest.TestCase):
    def setUp(self):
        self.service = KnowledgeIntelligenceService(FakeLlm(), model="test-model")

    def test_rejects_facts_without_literal_evidence(self):
        result = self.service.curate([{"locator": "page:3", "body": "A YUX atende todo o Brasil com consultoria."}])
        self.assertEqual(len(result["facts"]), 1)
        self.assertEqual(result["facts"][0]["source_locator"], "page:3")
        self.assertIn("atende todo o Brasil", result["facts"][0]["evidence_excerpt"])
        self.assertIn("rejected_unverifiable_fact:page:3", result["warnings"])

    def test_api_requires_token_and_returns_grounded_facts(self):
        client = TestClient(create_app(InMemoryAgentRuntimeStore(), self.service))
        payload = {"organization_id": "org-1", "sections": [{"locator": "page:3", "body": "A YUX atende todo o Brasil com consultoria."}]}
        self.assertEqual(client.post("/knowledge/curate", json=payload).status_code, 401)
        response = client.post("/knowledge/curate", headers={"Authorization": "Bearer test-runtime-token"}, json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["facts"]), 1)

    def test_website_profile_only_accepts_allowed_grounded_suggestions(self):
        service = KnowledgeIntelligenceService(FakeWebsiteLlm(), model="test-model")
        result = service.extract_company_profile([{"url": "https://yux.test/", "title": "YUX", "content": "YUX Solucoes em IA para empresas. Cores detectadas no site: #5519ff"}])
        self.assertEqual(len(result["suggestions"]), 2)
        self.assertEqual(result["suggestions"][0]["field_path"], "tradeName")
        self.assertEqual(result["suggestions"][1]["field_path"], "visualIdentity")
        self.assertIn("rejected_unverifiable_suggestion:forbiddenTopics", result["warnings"])
        self.assertIn("rejected_unverifiable_suggestion:industry", result["warnings"])


if __name__ == "__main__":
    unittest.main()
