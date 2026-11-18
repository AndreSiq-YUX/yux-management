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
pilot_comparison = load_script("compare_agent_pilots")
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


def pilot_capture(provenance="simulated"):
    tool = pilot_comparison
    cases, corpus_hash = tool.load_cohort()
    batch = tool.capture_template(cases, corpus_hash)
    route = {"provider": "fixture-transport", "modelSnapshot": "model:test"}
    batch["provenance"] = provenance
    if provenance == "live":
        batch["authorization"] = {"approvalReference": "fixture authorization", "ceilingBrl": "100", "routes": [route]}
    for key, versions in batch["versions"].items():
        versions.update({condition: tool.digest((key, condition)) for condition in tool.CONDITIONS})
    for index, row in enumerate(batch["executions"]):
        case = cases[row["caseId"]]
        ref = f"customer:{case['id']}"
        row["input"]["contextSnapshotHash"] = tool.digest(case["id"])
        row["input"]["reviewContext"] = ["Condições sintéticas autorizadas para o caso."]
        row.update(
            **route, traceId=f"fixture-{row['responseId']}", configurationHash=batch["versions"][tool.snapshot_key(case)][row["condition"]],
            authorizedSources=[{"ref": ref, "version": "1", "contentHash": tool.digest(ref),
                                "reviewExcerpt": "Trecho sintético liberado para revisão.", "private": "server-only"}],
            retrievedReferences=[ref], citations=[ref], answer="Resposta sintética.", latencyMs=index + 1,
            attempts=[{"kind": "generation", "costBrl": "0.01", "inputTokens": 11, "outputTokens": 9}],
            outcome={"accepted": False, "acceptedOnFirstReview": False, "priceOrScopeCorrected": None},
        )
    return cases, batch


def pilot_reviews(cases, batch, reviewer):
    return [
        {"responseId": row["responseId"], "evaluatorId": reviewer, "justification": "Teste sintético do avaliador.",
         "scores": {key: 3 if row["condition"] == "candidate" and cases[row["caseId"]]["target"] else 2 for key in scorer.DIMENSIONS},
         "validCitationIndexes": list(range(len(row["citations"]))), "gates": {key: True for key in pilot_comparison.PILOT_GATES}}
        for row in batch["executions"]
    ]


def test_pilot_cohort_keeps_the_existing_cases_and_blinds_the_new_pilot_pairs():
    tool = pilot_comparison
    cases, batch = pilot_capture()
    tool.validate_capture(batch, cases, batch["corpusHash"])
    assert len(cases) == 40
    assert len(batch["executions"]) == 160
    packet = tool.blind_packet(batch["executions"], cases)
    assert len(packet["responses"]) == 160
    assert set(packet["responses"][0]) == {"responseId", "caseId", "flow", "turns", "context", "answer", "citations", "authorizedSources"}
    assert set(packet["responses"][0]["authorizedSources"][0]) == {"ref", "version", "contentHash", "reviewExcerpt"}
    result = tool.compare(batch, cases, pilot_reviews(cases, batch, "A"), pilot_reviews(cases, batch, "B"))
    assert {group["acceptance"] for group in result["groups"].values()} == {"not_evaluated"}
    assert result["groups"]["mission_reference"]["holdoutCases"] == 6
    assert result["groups"]["villeman_massas"]["holdoutCases"] == 2
    assert "diagnosis:current" in result["groups"]["yux_captacao"]["economics"]
    assert "proposal:current" in result["groups"]["yux_captacao"]["economics"]
    assert result["batchBudget"] == "pending"


def test_pilot_validation_rejects_missing_run_changed_inputs_changed_model_and_unapproved_route():
    tool = pilot_comparison
    cases, batch = pilot_capture("live")
    corpus_hash = batch["corpusHash"]
    row = batch["executions"].pop()
    with pytest.raises(ValueError, match="paired_capture_coverage_invalid"):
        tool.validate_capture(batch, cases, corpus_hash)
    batch["executions"].append(row)
    trace = row["traceId"]
    row["traceId"] = batch["executions"][0]["traceId"]
    with pytest.raises(ValueError, match="unique_live_trace_required"):
        tool.validate_capture(batch, cases, corpus_hash)
    row["traceId"] = trace
    row["input"]["reviewContext"] = ["A política comercial mudou durante a comparação."]
    with pytest.raises(ValueError, match="paired_input_source_or_model_changed"):
        tool.validate_capture(batch, cases, corpus_hash)
    row["input"]["reviewContext"] = ["Condições sintéticas autorizadas para o caso."]
    row["modelSnapshot"] = "second-model"
    with pytest.raises(ValueError, match="provider_or_model_outside_authorization"):
        tool.validate_capture(batch, cases, corpus_hash)
    batch["authorization"]["routes"].append({"provider": row["provider"], "modelSnapshot": row["modelSnapshot"]})
    with pytest.raises(ValueError, match="paired_input_source_or_model_changed"):
        tool.validate_capture(batch, cases, corpus_hash)


def test_critical_missing_reference_blocks_only_its_pilot_and_survives_a_score_disagreement():
    tool = pilot_comparison
    cases, batch = pilot_capture("live")
    unsafe = next(row for row in batch["executions"] if row["caseId"] == "vm-continuacao" and row["condition"] == "candidate")
    unsafe["citations"] = []
    a, b = pilot_reviews(cases, batch, "A"), pilot_reviews(cases, batch, "B")
    next(row for row in b if row["responseId"] == unsafe["responseId"])["scores"]["evidence"] = 0
    result = tool.compare(batch, cases, a, b)
    group = result["groups"]["villeman_massas"]
    assert group["acceptance"] == "failed"
    assert any(item["responseId"] == unsafe["responseId"] for item in group["criticalViolations"])
    assert group["disagreements"][0]["resolved"] is False
    assert result["groups"]["yux_captacao"]["acceptance"] == "passed"


def test_pilot_reference_rate_counts_only_citations_both_reviewers_confirm():
    tool = pilot_comparison
    cases, batch = pilot_capture("live")
    row = next(row for row in batch["executions"] if row["caseId"] == "vm-continuacao")
    row["citations"] *= 2
    a, b = pilot_reviews(cases, batch, "A"), pilot_reviews(cases, batch, "B")
    next(review for review in a if review["responseId"] == row["responseId"])["validCitationIndexes"] = [0]
    next(review for review in b if review["responseId"] == row["responseId"])["validCitationIndexes"] = [1]
    group = tool.compare(batch, cases, a, b)["groups"]["villeman_massas"]
    assert group["referenceValidation"] == {"emitted": 33, "valid": 31, "rate": 31 / 33}
    assert "insufficient_valid_references" in group["reasons"]
    assert group["acceptance"] == "failed"


def test_pilot_economics_include_all_attempts_and_keep_unknown_cost_and_zero_denominators_pending():
    tool = pilot_comparison
    cases, batch = pilot_capture("live")
    one = batch["executions"][0]
    second_attempt = {"kind": "generation", "costBrl": "0.03", "inputTokens": 10, "outputTokens": 0}
    one["attempts"].insert(0, second_attempt)
    result = tool.economics(batch["executions"])
    assert result["attempts"] == {"generation": 161}
    assert result["totalCostBrl"] == "1.63"
    assert result["costPerApprovedBrl"] is None
    assert result["latencyP95Ms"] == 152
    one["outcome"]["accepted"] = True
    assert tool.economics(batch["executions"])["costPerApprovedBrl"] == "1.63"
    second_attempt["costBrl"] = None
    row = batch["executions"][-1]
    row["attempts"] = None
    result = tool.economics(batch["executions"])
    assert result["totalCostBrl"] is None
    assert result["knownCostSubtotalBrl"] == "1.59"
    assert result["inputTokens"] is None
    assert result["costPerApprovedBrl"] is None
    batch["authorization"]["ceilingBrl"] = "1"
    comparison = tool.compare(batch, cases, pilot_reviews(cases, batch, "A"), pilot_reviews(cases, batch, "B"))
    assert comparison["batchBudget"] == "exceeded"
