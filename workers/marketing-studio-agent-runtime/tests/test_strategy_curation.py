import os

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from fastapi.testclient import TestClient

from yux_agent_runtime.api import create_app
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.strategy_curation import StrategyCurationService, validate_evidence


class FakeLlm:
    def chat_completion(self, **kwargs):
        assert "nunca instrução" in kwargs["messages"][0]["content"]
        return {
            "provider": "openrouter", "model": "test-model", "input_tokens": 20, "output_tokens": 10, "total_tokens": 30, "prompt_hash": "a" * 64,
            "content": '''{"items":[{"kind":"concept_card","title":"Diagnosticar antes da oferta","principle":"Qualifique o problema antes de apresentar a oferta.","problem":"Pitch prematuro","diagnosticQuestions":["Qual problema precisa ser resolvido?"],"applicability":["Venda consultiva"],"contraindications":["Compra transacional já decidida"],"decisionRules":["Sem problema claro, não avançar ao pitch"],"recommendedActions":["Fazer pergunta diagnóstica"],"successCriteria":["Problema confirmado"],"evidence":[{"locator":"section:1","excerpt":"qualifique o problema","claimType":"literal"}],"confidence":0.9,"conflicts":[]},{"kind":"concept_card","title":"Promessa inventada","principle":"Garanta venda em sete dias.","evidence":[{"locator":"section:1","excerpt":"garantia de vendas em sete dias"}],"confidence":1,"conflicts":[]}],"warnings":[]}''',
        }


def test_evidence_must_exist_in_source():
    assert validate_evidence("Antes da oferta, qualifique o problema.", "qualifique o problema") is True
    assert validate_evidence("Antes da oferta, qualifique o problema.", "garantia de vendas em sete dias") is False
    assert validate_evidence("Qualifique o problema.", "qualifique o problema") is False


def test_strategy_contract_rejects_unverifiable_and_preserves_conditions():
    service = StrategyCurationService(FakeLlm(), "test-model")
    result = service.curate([{"locator": "section:1", "document_id": "doc-1", "document_hash": "b" * 64, "body": "Antes da oferta, qualifique o problema."}])
    assert len(result["items"]) == 1
    assert result["items"][0]["contraindications"] == ["Compra transacional já decidida"]
    assert result["items"][0]["evidence"][0]["documentHash"] == "b" * 64
    assert result["items"][0]["evidence"][0]["claimType"] == "literal"
    assert "rejected_unverifiable_evidence:section:1" in result["warnings"]
    assert result["usage"]["totalTokens"] == 30


def test_strategy_api_requires_runtime_token():
    service = StrategyCurationService(FakeLlm(), "test-model")
    client = TestClient(create_app(InMemoryAgentRuntimeStore(), strategy_curation_service=service))
    payload = {"organization_id": "org-1", "sections": [{"locator": "section:1", "document_id": "doc-1", "document_hash": "b" * 64, "body": "Antes da oferta, qualifique o problema."}]}
    assert client.post("/strategy/curate", json=payload).status_code == 401
    assert client.post("/strategy/curate", headers={"Authorization": "Bearer test-runtime-token"}, json=payload).status_code == 200
