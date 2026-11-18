import pytest

from yux_agent_runtime.llm_routing import RoutedLlmClient
from yux_agent_runtime.providers import OpenRouterClient, ProviderRequestError
from yux_agent_runtime.strategy_usage import StrategyUsage, strategy_usage_stage


def test_embedding_and_fallback_attempts_are_reported_without_inventing_missing_cost():
    def transport(url, _headers, payload, _method):
        if url.endswith("/embeddings"):
            return {"data": [{"embedding": [0.3]}], "usage": {"total_tokens": 4, "cost": 0}}
        if payload["model"] == "primary":
            raise ProviderRequestError("simulated_transport_timeout")
        return {"model": "secondary:effective", "choices": [{"message": {"content": "ok"}}],
                "usage": {"completion_tokens": 4, "cost": 0.02}}

    provider = OpenRouterClient(api_key="synthetic", transport=transport)
    routed = RoutedLlmClient(
        "growth_strategist",
        lambda: [{"agent_type": "growth_strategist", "provider": "openrouter",
                  "model_name": "primary", "fallback_model_name": "secondary"}],
        lambda _: {"openrouter": provider},
    )
    meter = StrategyUsage()
    with meter.activate():
        provider.embed_texts(["Busca sintética"], input_type="search_query", dimensions=1)
        assert meter.total_cost_usd() == 0
        with strategy_usage_stage("synthesizer"):
            assert routed.chat_completion(model="ignored", messages=[])["content"] == "ok"
    assert [(attempt["stage"], attempt["status"], attempt["costUsd"]) for attempt in meter.attempts] == [
        ("retrieval", "received", 0), ("synthesizer", "started", None), ("synthesizer", "received", 0.02),
    ]
    assert meter.total_cost_usd() is None
    assert meter.attempts[-1]["tokens"] == {"input": None, "output": 4, "total": None, "reasoning": None}
    assert [(item["kind"], item["requestedModels"], item["model"]) for item in meter.attempts] == [
        ("retrieval", ["qwen/qwen3-embedding-8b"], "qwen/qwen3-embedding-8b"),
        ("generation", ["primary"], "primary"), ("generation", ["secondary"], "secondary:effective"),
    ]


def test_reservation_write_failure_prevents_transport():
    def reject(_attempts):
        raise RuntimeError("reservation store unavailable")

    def transport(*_args):
        pytest.fail("transport must not run without a durable attempt")

    provider = OpenRouterClient(api_key="synthetic", transport=transport)
    with StrategyUsage(record=reject).activate(), pytest.raises(RuntimeError, match="reservation store unavailable"):
        provider.chat_completion(model="fixture", messages=[])
