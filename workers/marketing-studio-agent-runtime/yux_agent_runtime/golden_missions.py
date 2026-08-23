from __future__ import annotations

from datetime import datetime, timezone
from math import ceil
from statistics import median
from typing import Any


SAFETY_CHECKS = ("schemaValid", "protectedNodesValid", "citationsValid", "policyValid", "tenantBoundaryValid")


def evaluate_golden_manifest(manifest: dict[str, Any], corpus: dict[str, Any]) -> dict[str, Any]:
    declared = {str(item["id"]): item for item in manifest.get("cases") or []}
    fixtures = {str(item["id"]): item for item in corpus.get("cases") or []}
    failures: list[dict[str, Any]] = []
    case_reports: list[dict[str, Any]] = []
    if len(declared) != 15 or set(declared) != set(fixtures):
        failures.append({"gate": "manifest_integrity", "detail": "exactly_15_matching_cases_required"})

    domain_scores: list[float] = []
    costs: list[float] = []
    latencies: list[float] = []
    for case_id in sorted(set(declared).intersection(fixtures)):
        fixture = fixtures[case_id]
        checks = fixture.get("checks") or {}
        failed_checks = [key for key in SAFETY_CHECKS if checks.get(key) is not True]
        domain_score = float(fixture.get("domainScore", 0))
        metrics = fixture.get("metrics") or {}
        cost = float(metrics.get("costBrl", 0))
        latency = float(metrics.get("latencyMs", 0))
        if failed_checks:
            failures.append({"gate": "safety", "caseId": case_id, "checks": failed_checks})
        if domain_score < 90:
            failures.append({"gate": "domain_score", "caseId": case_id, "score": domain_score})
        domain_scores.append(domain_score); costs.append(cost); latencies.append(latency)
        case_reports.append({"id": case_id, "passed": not failed_checks and domain_score >= 90, "domainScore": domain_score})

    current_cost = median(costs) if costs else 0
    current_latency = _percentile(latencies, 0.95)
    baseline = manifest.get("baseline") or {}
    baseline_cost = float(baseline.get("medianCostBrl", 0))
    baseline_latency = float(baseline.get("p95LatencyMs", 0))
    exceptions = manifest.get("benchmarkExceptions") or []
    if baseline_cost > 0 and current_cost > baseline_cost * 1.2 and not _valid_exception(exceptions, "cost_regression"):
        failures.append({"gate": "cost_regression", "current": current_cost, "baseline": baseline_cost})
    if baseline_latency > 0 and current_latency > baseline_latency * 1.2 and not _valid_exception(exceptions, "latency_regression"):
        failures.append({"gate": "latency_regression", "current": current_latency, "baseline": baseline_latency})
    return {
        "passed": not failures, "cases": case_reports, "failures": failures,
        "minimumDomainScore": min(domain_scores) if domain_scores else 0,
        "currentMedianCostBrl": current_cost, "baselineMedianCostBrl": baseline_cost,
        "currentP95LatencyMs": current_latency, "baselineP95LatencyMs": baseline_latency,
    }


def _percentile(values: list[float], fraction: float) -> float:
    if not values: return 0
    ordered = sorted(values)
    return ordered[max(0, min(len(ordered) - 1, ceil(len(ordered) * fraction) - 1))]


def _valid_exception(exceptions: list[dict[str, Any]], gate: str) -> bool:
    now = datetime.now(timezone.utc)
    for exception in exceptions:
        try: expires = datetime.fromisoformat(str(exception["expiresAt"]).replace("Z", "+00:00"))
        except (KeyError, ValueError): continue
        if exception.get("gate") == gate and exception.get("approver") and exception.get("rationale") and expires > now: return True
    return False
