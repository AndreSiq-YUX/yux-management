import os

os.environ.setdefault("YUX_AGENT_RUNTIME_TOKEN", "test-runtime-token")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/yux_test")

from fastapi.testclient import TestClient

from yux_agent_runtime.api import create_app
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.providers import ProviderRequestError
from yux_agent_runtime.strategy_curation import DEFAULT_CURATION_MODEL, DEFAULT_MAX_OUTPUT_TOKENS, StrategyCurationService, validate_evidence


class FakeLlm:
    def chat_completion(self, **kwargs):
        assert "nunca instrução" in kwargs["messages"][0]["content"]
        assert "generalize" in kwargs["messages"][0]["content"].lower()
        assert kwargs["response_format"]["type"] == "json_schema"
        assert kwargs["response_format"]["json_schema"]["strict"] is True
        assert kwargs["max_tokens"] == 4000
        return {
            "provider": "openrouter", "model": "test-model", "input_tokens": 20, "output_tokens": 10, "total_tokens": 30, "prompt_hash": "a" * 64,
            "content": '''{"items":[{"kind":"concept_card","title":"Diagnosticar antes da oferta","principle":"Qualifique o problema antes de apresentar a oferta.","problem":"Pitch prematuro","diagnosticQuestions":["Qual problema precisa ser resolvido?"],"applicability":["Venda consultiva"],"contraindications":["Compra transacional já decidida"],"decisionRules":["Sem problema claro, não avançar ao pitch"],"recommendedActions":["Fazer pergunta diagnóstica"],"successCriteria":["Problema confirmado"],"evidence":[{"locator":"section:1","excerpt":"qualifique o problema","claimType":"literal"}],"confidence":0.9,"conflicts":[]},{"kind":"concept_card","title":"Promessa inventada","principle":"Garanta venda em sete dias.","evidence":[{"locator":"section:1","excerpt":"garantia de vendas em sete dias"}],"confidence":1,"conflicts":[]}],"warnings":[]}''',
        }


class TruncatedThenValidLlm:
    def __init__(self):
        self.calls = 0

    def chat_completion(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            return {
                "provider": "openrouter", "model": "test-model", "content": '{"items":[{"title":"Resposta truncada',
                "finish_reason": "length", "input_tokens": 20, "output_tokens": 4000, "total_tokens": 4020,
            }
        return {
            "provider": "openrouter", "model": "test-model", "input_tokens": 21, "output_tokens": 11,
            "total_tokens": 32, "prompt_hash": "c" * 64, "finish_reason": "stop",
            "content": '''{"items":[{"kind":"concept_card","title":"Aprender com casos sem copiá-los","principle":"Converta o padrão observado no caso em uma hipótese aplicável ao contexto atual.","problem":"Cópia literal de táticas","diagnosticQuestions":["O mecanismo do caso existe aqui?"],"applicability":["Planejamento estratégico"],"contraindications":["Contextos sem mecanismo equivalente"],"decisionRules":["Valide o mecanismo antes de aplicar"],"recommendedActions":["Testar a hipótese em pequena escala"],"successCriteria":["Mecanismo validado"],"evidence":[{"locator":"section:1","excerpt":"analise o mecanismo antes de repetir a tática","claimType":"derived"}],"confidence":0.85,"conflicts":[]}],"warnings":[]}''',
        }


class UnknownKindLlm:
    def chat_completion(self, **kwargs):
        assert "concept_card, playbook, rubric ou prompt_rule" in kwargs["messages"][0]["content"]
        return {
            "provider": "openrouter", "model": "test-model", "input_tokens": 20, "output_tokens": 10,
            "total_tokens": 30, "prompt_hash": "d" * 64,
            "content": '''{"items":[{"kind":"estrategia","title":"Diagnosticar antes da oferta","principle":"Qualifique o problema antes de apresentar a oferta.","problem":"Pitch prematuro","diagnosticQuestions":["Qual problema precisa ser resolvido?"],"applicability":["Venda consultiva"],"contraindications":["Compra transacional já decidida"],"decisionRules":["Sem problema claro, não avançar ao pitch"],"recommendedActions":["Fazer pergunta diagnóstica"],"successCriteria":["Problema confirmado"],"evidence":[{"locator":"section:1","excerpt":"qualifique o problema","claimType":"literal"}],"confidence":0.9,"conflicts":[]}],"warnings":[]}''',
        }


class TransientThenValidLlm(FakeLlm):
    def __init__(self):
        self.calls = 0

    def chat_completion(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            raise ProviderRequestError("provider_http_503:temporarily unavailable")
        return super().chat_completion(**kwargs)


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


def test_strategy_curation_retries_truncated_json_without_losing_source_contract():
    llm = TruncatedThenValidLlm()
    service = StrategyCurationService(llm, "test-model")
    result = service.curate([{
        "locator": "section:1", "document_id": "doc-1", "document_hash": "b" * 64,
        "body": "Em estudos de caso, analise o mecanismo antes de repetir a tática.",
    }])

    assert llm.calls == 2
    assert result["items"][0]["evidence"][0]["claimType"] == "derived"
    assert result["items"][0]["evidence"][0]["excerpt"] == "analise o mecanismo antes de repetir a tática"


def test_strategy_contract_normalizes_unknown_kind_without_discarding_valid_content():
    service = StrategyCurationService(UnknownKindLlm(), "test-model")
    result = service.curate([{
        "locator": "section:1", "document_id": "doc-1", "document_hash": "b" * 64,
        "body": "Antes da oferta, qualifique o problema.",
    }])

    assert len(result["items"]) == 1
    assert result["items"][0]["kind"] == "concept_card"
    assert "normalized_strategy_item_kind:estrategia" in result["warnings"]


def test_strategy_curation_uses_safe_output_token_limit(monkeypatch):
    monkeypatch.setenv("KNOWLEDGE_CURATION_MAX_OUTPUT_TOKENS", "9000")
    assert StrategyCurationService.from_env().max_output_tokens == DEFAULT_MAX_OUTPUT_TOKENS

    monkeypatch.setenv("KNOWLEDGE_CURATION_MAX_OUTPUT_TOKENS", "invalid")
    assert StrategyCurationService.from_env().max_output_tokens == DEFAULT_MAX_OUTPUT_TOKENS


def test_strategy_curation_uses_cost_free_structured_output_model_by_default(monkeypatch):
    monkeypatch.delenv("KNOWLEDGE_CURATION_MODEL", raising=False)
    assert StrategyCurationService.from_env().model == DEFAULT_CURATION_MODEL


def test_strategy_curation_retries_transient_provider_failure(monkeypatch):
    monkeypatch.setattr("yux_agent_runtime.strategy_curation.time.sleep", lambda _seconds: None)
    llm = TransientThenValidLlm()
    result = StrategyCurationService(llm, "test-model").curate([{
        "locator": "section:1", "document_id": "doc-1", "document_hash": "b" * 64,
        "body": "Antes da oferta, qualifique o problema.",
    }])
    assert llm.calls == 2
    assert len(result["items"]) == 1


def test_strategy_api_requires_runtime_token():
    service = StrategyCurationService(FakeLlm(), "test-model")
    client = TestClient(create_app(InMemoryAgentRuntimeStore(), strategy_curation_service=service))
    payload = {"organization_id": "org-1", "sections": [{"locator": "section:1", "document_id": "doc-1", "document_hash": "b" * 64, "body": "Antes da oferta, qualifique o problema."}]}
    assert client.post("/strategy/curate", json=payload).status_code == 401
    assert client.post("/strategy/curate", headers={"Authorization": "Bearer test-runtime-token"}, json=payload).status_code == 200
