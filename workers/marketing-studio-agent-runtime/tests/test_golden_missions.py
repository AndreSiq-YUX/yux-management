from __future__ import annotations

import copy
import json
from pathlib import Path

from yux_agent_runtime.golden_missions import evaluate_golden_manifest
from yux_agent_runtime.model_profiles import ModelProfile, build_model_trace
from yux_agent_runtime.providers import OpenRouterClient


ROOT = Path(__file__).resolve().parents[1]


def test_profile_and_provider_trace_pin_resolved_model_parameters_and_prompt_hash() -> None:
    profile = ModelProfile(
        key="mission_supervisor", version=1, provider="openrouter", model="openai/gpt-5-mini",
        temperature=0.2, max_tokens=2400, timeout_seconds=60, max_cost_brl="5",
        fallback_profile_keys=[], prompt_bundle_hash="a" * 64,
    )
    trace = build_model_trace(profile, "openai/gpt-5-mini-2026-08-01", [{"role": "user", "content": "sanitized"}], {"input_tokens": 10})
    assert trace["resolvedModelId"] == "openai/gpt-5-mini-2026-08-01"
    assert trace["parameters"] == {"temperature": 0.2, "maxTokens": 2400, "timeoutSeconds": 60}
    assert len(trace["promptHash"]) == 64

    client = OpenRouterClient(api_key="test", transport=lambda *_args: {
        "id": "run-1", "model": "resolved/model-v2", "choices": [{"message": {"content": "{}"}}],
        "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3},
    })
    response = client.chat_completion(model="requested/model", messages=[{"role": "user", "content": "safe"}], max_tokens=100, temperature=0.1)
    assert response["model"] == "resolved/model-v2"
    assert response["request_parameters"] == {"temperature": 0.1, "max_tokens": 100}
    assert len(response["prompt_hash"]) == 64


def test_fifteen_case_corpus_passes_every_promotion_gate() -> None:
    manifest = json.loads((ROOT / "golden-missions" / "manifest.json").read_text(encoding="utf-8"))
    corpus = json.loads((ROOT / "golden-missions" / "fixtures" / "corpus.json").read_text(encoding="utf-8"))
    report = evaluate_golden_manifest(manifest, corpus)
    assert len(report["cases"]) == 15
    assert report["passed"] is True
    assert report["minimumDomainScore"] >= 90


def test_cost_or_latency_regression_above_twenty_percent_fails_promotion() -> None:
    manifest = json.loads((ROOT / "golden-missions" / "manifest.json").read_text(encoding="utf-8"))
    corpus = json.loads((ROOT / "golden-missions" / "fixtures" / "corpus.json").read_text(encoding="utf-8"))
    regressed = copy.deepcopy(corpus)
    for case in regressed["cases"]:
        case["metrics"]["costBrl"] = 99
        case["metrics"]["latencyMs"] = 99999
    report = evaluate_golden_manifest(manifest, regressed)
    assert report["passed"] is False
    assert {failure["gate"] for failure in report["failures"]} >= {"cost_regression", "latency_regression"}
