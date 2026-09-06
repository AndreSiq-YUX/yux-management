from __future__ import annotations

import argparse
from decimal import Decimal
import importlib.util
import json
from pathlib import Path
import re
import sys

import pytest

from yux_agent_runtime.providers import ProviderRequestError


ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = ROOT / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


runner = load_script("run_strategic_quality")
scorer = load_script("score_strategic_quality")
CASES = ROOT / "evals" / "strategic-quality" / "cases.jsonl"


def runner_args(maximum: str) -> argparse.Namespace:
    return argparse.Namespace(
        cases=CASES,
        conditions="no_knowledge,current,extended",
        repeats=2,
        max_cost_brl=Decimal(maximum),
        usd_brl=None,
        seed=20260905,
        output=ROOT / "evals" / "results" / "ignored.json",
    )


def test_corpus_has_required_sample_shape_and_nonzero_budget() -> None:
    cases = runner.load_cases(CASES)
    assert len(cases) == 24
    assert sum(case["holdout"] for case in cases) == 6
    assert {category: sum(case["category"] == category for case in cases) for category in runner.CATEGORIES} == {
        category: 6 for category in runner.CATEGORIES
    }
    assert runner.projected_cost(cases, 2, list(runner.CONDITIONS)) == Decimal("86.4")


def test_runner_rejects_batch_before_provider_when_budget_is_too_low(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "unused")
    with pytest.raises(ValueError, match="strategic_quality_budget_exceeded"):
        runner.run_batch(runner_args("86.39"))


def test_runner_requires_live_provider_credential(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ProviderRequestError, match="missing_openrouter_api_key"):
        runner.run_batch(runner_args("100"))


def test_generated_knowledge_reference_has_complete_governance_identity() -> None:
    source = runner.candidate("diag-01", 0, "Fonte publicada")
    assert source["publication_id"]
    assert source["item_id"]
    assert source["use_mode"] == "quotable"
    assert len(source["source_content_hash"]) == 64
    assert len(source["binding_fingerprint"]) == 64


def test_runner_exercises_real_harness_path_for_all_144_responses(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeRecordingClient:
        def __init__(self):
            self.last_call = None

        def chat_completion(self, **kwargs):
            prompt = "\n".join(item["content"] for item in kwargs["messages"])
            refs = re.findall(r"yux:[0-9a-f-]+", prompt)
            content = json.dumps({
                "kind": "message",
                "reply": "Diagnóstico verificável com limites e próximo passo.",
                "understood": {"summary": "Solicitação compreendida."},
                "questions": [],
                "readiness": {"status": "ready_for_brief_confirmation", "knownFacts": [], "assumptions": [], "missing": []},
                "brief": {"objective": "Avaliar a decisão comercial", "mode": "assisted"},
                "suggestedActions": [],
                "sourceRefs": refs[:1],
            })
            self.last_call = {
                "provider": "openrouter", "model": kwargs["model"], "content": content,
                "finish_reason": "stop", "input_tokens": 10, "output_tokens": 10, "total_tokens": 20,
                "cost_usd": None, "raw_response_id": "fake", "prompt_hash": "a" * 64,
            }
            return self.last_call

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-only")
    monkeypatch.setattr(runner.RecordingClient, "from_env", classmethod(lambda cls: FakeRecordingClient()))
    checkpoints = []
    report = runner.run_batch(runner_args("100"), lambda current: checkpoints.append(current["sample"]["responses"]))
    assert report["status"] == "awaiting_blind_review"
    assert report["sample"]["responses"] == 144
    assert report["budget"]["accountedBrl"] == "86.4"
    assert checkpoints[-1] == 144
    governed = [item for item in report["executions"] if item["sources"]]
    assert governed
    assert all(item["sourceValidation"]["emitted"] == item["sourceValidation"]["structurallyValid"] for item in governed)


def synthetic_report() -> dict:
    executions = []
    relevance = {}
    for case_number in range(24):
        case_id = f"case-{case_number:02d}"
        relevance[case_id] = case_number < 12
        for condition in runner.CONDITIONS:
            for repetition in (1, 2):
                response_id = f"{case_id}:{condition}:{repetition}"
                executions.append({
                    "responseId": response_id,
                    "caseId": case_id,
                    "condition": condition,
                    "sources": [{"id": "source"}],
                    "sourceValidation": {"emitted": 1, "structurallyValid": 1},
                })
    return {"executions": executions, "caseRelevance": relevance, "status": "awaiting_blind_review"}


def reviews_for(report: dict, evaluator_id: str, overrides: dict[str, int] | None = None) -> list[dict]:
    overrides = overrides or {}
    rows = []
    for execution in report["executions"]:
        relevant = report["caseRelevance"][execution["caseId"]]
        condition = execution["condition"]
        score = 1 if condition == "no_knowledge" else 2
        if condition == "extended" and relevant:
            score = 3
        score = overrides.get(execution["responseId"], score)
        rows.append({
            "evaluatorId": evaluator_id,
            "responseId": execution["responseId"],
            "scores": {dimension: score for dimension in scorer.DIMENSIONS},
            "gates": {gate: True for gate in scorer.GATES},
            "validReferences": 1,
            "justification": "Nota baseada na resposta cega.",
        })
    return rows


def test_two_independent_reviews_can_pass_measured_acceptance() -> None:
    report = synthetic_report()
    result = scorer.score_report(report, reviews_for(report, "reviewer-a"), reviews_for(report, "reviewer-b"))
    assert result["acceptance"]["status"] == "passed"
    assert result["metrics"]["relevantMeanGain"] == 1
    assert result["metrics"]["otherMeanDelta"] == 0
    assert result["metrics"]["validReferenceRate"] == 1
    assert result["evaluators"] == ["reviewer-a", "reviewer-b"]


def test_same_evaluator_or_large_unresolved_disagreement_is_rejected() -> None:
    report = synthetic_report()
    first = reviews_for(report, "reviewer-a")
    with pytest.raises(ValueError, match="two_distinct_evaluators"):
        scorer.score_report(report, first, reviews_for(report, "reviewer-a"))

    response_id = report["executions"][0]["responseId"]
    second = reviews_for(report, "reviewer-b", {response_id: 4})
    result = scorer.score_report(report, first, second)
    assert result["status"] == "needs_adjudication"
    assert result["disagreements"] == [{
        "responseId": response_id,
        "dimensions": list(scorer.DIMENSIONS),
        "status": "unresolved",
    }]


def test_structurally_invalid_reference_cannot_count_as_valid() -> None:
    report = synthetic_report()
    report["executions"][0]["sourceValidation"]["structurallyValid"] = 0
    result = scorer.score_report(report, reviews_for(report, "reviewer-a"), reviews_for(report, "reviewer-b"))
    assert result["metrics"]["validReferenceRate"] < 1
