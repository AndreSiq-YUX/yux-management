"""Prepare and score frozen pilot captures. This program only accesses local files."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from hashlib import sha256
import json
from math import ceil
from pathlib import Path
import random
import re
from statistics import median, pstdev
from uuid import UUID, uuid4

from score_strategic_quality import DIMENSIONS, GATES, read_jsonl, validate_reviews

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "evals" / "strategic-quality"
PILOTS = ("villeman_massas", "yux_captacao")
GROUPS = ("mission_reference", *PILOTS)
CONDITIONS = ("current", "candidate")
REPEATS = (1, 2)
PILOT_GATES = (*GATES, "commercialIntegrity", "externalAudience", "executionTruth")
RELEASE_AUDIENCES = {
    "presales": {"internal_operator"},
    "mission_intake": {"internal_operator", "client_user"},
    "mission_supervisor": {"client_user"},
}
RELEASE_FLOWS = {
    "villeman_massas": {"mission_intake", "mission_supervisor"},
    "yux_captacao": set(RELEASE_AUDIENCES),
}
PRESALES_SCOPE_FLAG = "STRATEGY_PRESALES_PILOT_SCOPES"
MISSION_SCOPE_FLAG = "ACTION_ENGINE_PROMPT_PILOT_SCOPES"
PILOT_FLAGS = {
    PRESALES_SCOPE_FLAG: "STRATEGY_PRESALES_PILOT_ORGANIZATION_IDS",
    MISSION_SCOPE_FLAG: "ACTION_ENGINE_PROMPT_PILOT_ORGANIZATION_IDS",
}
PILOT_FLAG_NAMES = set(PILOT_FLAGS) | set(PILOT_FLAGS.values())
MISSION_SCOPE_SUFFIXES = {
    ("mission_intake", "internal_operator"): "mission-intake-internal",
    ("mission_intake", "client_user"): "mission-intake-client",
    ("mission_supervisor", "client_user"): "mission-planning",
}


def digest(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def load_cohort():
    reference = read_jsonl(CORPUS / "cases.jsonl")
    pilot_cases = read_jsonl(CORPUS / "pilot-cases.jsonl")
    require(len(reference) == 24 and sum(case["holdout"] is True for case in reference) == 6,
            "mission_reference_corpus_invalid")
    for pilot in PILOTS:
        cases = [case for case in pilot_cases if case["pilot"] == pilot]
        require({case["target"] for case in cases} == {False, True} and any(case["holdout"] for case in cases),
                "pilot_requires_target_regression_and_holdout")
    cases = {
        case["id"]: {**case, "pilot": "mission_reference", "flow": "mission", "turns": [case["message"]],
                     "target": case["relevantToExtended"], "requiresEvidence": False}
        for case in reference
    }
    cases.update({case["id"]: {**case, "outcomeKind": case.get("outcomeKind", "mission" if case["flow"] == "mission" else "proposal")}
                  for case in pilot_cases})
    require(len(cases) == len(reference) + len(pilot_cases) and all(case["pilot"] in GROUPS for case in cases.values()),
            "pilot_corpus_identity_invalid")
    return cases, digest({"reference": reference, "pilots": pilot_cases})


def snapshot_key(case):
    return f"{case['pilot']}:{case['flow']}"


def capture_template(cases, corpus_hash):
    return {
        "schemaVersion": 1, "corpusHash": corpus_hash, "provenance": "simulated",
        "authorization": None,
        "versions": {key: {condition: None for condition in CONDITIONS} for key in sorted({snapshot_key(case) for case in cases.values()})},
        "executions": [
            {"responseId": str(uuid4()), "caseId": case_id, "condition": condition, "repetition": repetition,
             "input": {"turns": case["turns"], "contextSnapshotHash": None, "reviewContext": []}, "modelSnapshot": None,
             "provider": None, "traceId": None, "configurationHash": None, "authorizedSources": None,
             "retrievedReferences": None, "citations": None, "answer": None, "attempts": None,
             "latencyMs": None, "outcome": {"accepted": None, "acceptedOnFirstReview": None, "priceOrScopeCorrected": None}}
            for case_id, case in cases.items() for condition in CONDITIONS for repetition in REPEATS
        ],
    }


def hash_value(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def opaque_response_id(value):
    try:
        return isinstance(value, str) and str(UUID(value)) == value and UUID(value).version == 4
    except (AttributeError, ValueError):
        return False


def nonnegative_integer(value):
    return type(value) is int and value >= 0


def amount(value):
    require(isinstance(value, str), "cost_requires_decimal_string")
    try:
        result = Decimal(value)
    except InvalidOperation as error:
        raise ValueError("cost_requires_decimal_string") from error
    require(result.is_finite() and result >= 0, "invalid_reported_cost")
    return result


def provider_model(record):
    values = tuple(record.get(key) for key in ("provider", "modelSnapshot"))
    require(all(isinstance(value, str) and value.strip() for value in values), "effective_provider_and_model_required")
    return values


def validate_capture(batch, cases, corpus_hash):
    require(batch.get("schemaVersion") == 1 and batch.get("corpusHash") == corpus_hash, "frozen_corpus_mismatch")
    require(batch.get("provenance") in ("live", "simulated"), "capture_provenance_required")
    approved_routes = None
    if batch["provenance"] == "live":
        authorization = batch.get("authorization") or {}
        require(isinstance(authorization.get("routes"), list) and authorization["routes"]
                and isinstance(authorization.get("approvalReference"), str) and authorization["approvalReference"].strip()
                and amount(authorization.get("ceilingBrl")) > 0, "recorded_paid_authorization_required")
        approved_routes = {provider_model(route) for route in authorization["routes"]}
    versions = batch.get("versions") or {}
    for key in {snapshot_key(case) for case in cases.values()}:
        pair = versions.get(key) or {}
        require(all(hash_value(pair.get(condition)) for condition in CONDITIONS)
                and pair["current"] != pair["candidate"], "two_frozen_configurations_required")
    expected = {(case_id, condition, repetition) for case_id in cases for condition in CONDITIONS for repetition in REPEATS}
    seen, ids, traces, snapshots = set(), set(), set(), {}
    for execution in batch.get("executions") or []:
        case_id, condition, repetition = (execution.get(key) for key in ("caseId", "condition", "repetition"))
        row = (case_id, condition, repetition)
        require(row in expected and row not in seen and type(repetition) is int, "paired_capture_coverage_invalid")
        seen.add(row)
        identifier = execution.get("responseId")
        require(opaque_response_id(identifier) and identifier not in ids, "opaque_unique_response_id_required")
        ids.add(identifier)
        if batch["provenance"] == "live":
            trace_id = execution.get("traceId")
            require(isinstance(trace_id, str) and trace_id.strip() and trace_id not in traces, "unique_live_trace_required")
            traces.add(trace_id)
        route = provider_model(execution)
        require(approved_routes is None or route in approved_routes, "provider_or_model_outside_authorization")
        case = cases[case_id]
        require(execution.get("configurationHash") == versions[snapshot_key(case)][condition], "configuration_drift")
        source_snapshot = execution.get("authorizedSources")
        require(isinstance(source_snapshot, list) and all(
            isinstance(item, dict) and isinstance(item.get("ref"), str) and item["ref"]
            and isinstance(item.get("version"), str) and item["version"] and hash_value(item.get("contentHash"))
            and (item.get("reviewExcerpt") is None or isinstance(item["reviewExcerpt"], str))
            for item in source_snapshot
        ), "authorized_source_snapshot_invalid")
        source_refs = {item["ref"] for item in source_snapshot}
        require(len(source_refs) == len(source_snapshot), "duplicate_authorized_source")
        supplied = execution.get("input") or {}
        context = supplied.get("reviewContext")
        require(supplied.get("turns") == case["turns"] and hash_value(supplied.get("contextSnapshotHash"))
                and isinstance(context, list) and all(isinstance(item, str) for item in context), "frozen_input_mismatch")
        frozen = (digest(supplied), digest(sorted(source_snapshot, key=lambda source: source["ref"])), route)
        require(snapshots.setdefault(case_id, frozen) == frozen, "paired_input_source_or_model_changed")
        retrieved = execution.get("retrievedReferences")
        citations = execution.get("citations")
        require(isinstance(retrieved, list) and all(isinstance(ref, str) for ref in retrieved)
                and isinstance(citations, list) and all(isinstance(ref, str) for ref in citations), "reference_lists_required")
        require(isinstance(execution.get("answer"), str) and nonnegative_integer(execution.get("latencyMs")), "answer_and_latency_required")
        validate_economics(execution, approved_routes)
    require(seen == expected, "paired_capture_coverage_invalid")


def validate_economics(execution, approved_routes):
    attempts = execution.get("attempts")
    require(attempts is None or isinstance(attempts, list), "invalid_attempt_records")
    for attempt in attempts or []:
        require(isinstance(attempt, dict) and attempt.get("kind") in ("generation", "retrieval") and "costBrl" in attempt, "invalid_attempt_record")
        if approved_routes is not None:
            provider, model = provider_model(attempt)
            requested = attempt.get("requestedModels")
            require(isinstance(requested, list) and requested and all(isinstance(item, str) and item.strip() for item in requested),
                    "attempt_requested_models_required")
            require(all((provider, name) in approved_routes for name in (model, *requested)), "attempt_route_outside_authorization")
        if attempt["costBrl"] is not None:
            amount(attempt["costBrl"])
        require(all(attempt.get(key) is None or nonnegative_integer(attempt[key])
                    for key in ("inputTokens", "outputTokens", "reasoningTokens")), "invalid_attempt_tokens")
    outcome = execution.get("outcome") or {}
    require(isinstance(outcome, dict), "invalid_outcome_review")
    for key in ("accepted", "acceptedOnFirstReview", "priceOrScopeCorrected"):
        require(outcome.get(key) is None or isinstance(outcome[key], bool), "invalid_outcome_review")
    require(outcome.get("acceptedOnFirstReview") is not True or outcome.get("accepted") is True, "first_review_requires_acceptance")


def attach_metered_attempts(batch, receipts):
    executions = [row for row in batch["executions"] if row.get("traceId")]
    by_trace = {row["traceId"]: row for row in executions}
    require(len(by_trace) == len(executions), "unique_live_trace_required")
    require(isinstance(receipts, dict) and receipts.keys() <= by_trace.keys(), "metered_trace_outside_capture")
    for trace_id, entries in receipts.items():
        require(isinstance(entries, list), "invalid_attempt_records")
        row = by_trace[trace_id]
        imported = []
        for attempt in entries:
            require(isinstance(attempt, dict) and attempt.get("status") in ("started", "received"), "invalid_metered_attempt")
            tokens = attempt.get("tokens") or {}
            require(isinstance(tokens, dict), "invalid_attempt_tokens")
            kind = attempt.get("kind") or ("retrieval" if attempt.get("stage") == "retrieval" else "generation")
            imported.append({
                "kind": kind, "provider": attempt.get("provider"), "modelSnapshot": attempt.get("model"),
                "requestedModels": attempt.get("requestedModels"), "costBrl": attempt.get("costBrl"),
                "inputTokens": tokens.get("input"), "outputTokens": tokens.get("output"), "reasoningTokens": tokens.get("reasoning"),
            })
        require(row.get("attempts") in (None, imported), "metered_attempts_would_replace_existing_capture")
        row["attempts"] = imported
        validate_economics(row, None)
    return batch


def blind_packet(executions, cases):
    # The packet omits configuration, condition, costs, holdouts and expected answers.
    public_rows = [{
        "responseId": row["responseId"], "caseId": row["caseId"], "flow": cases[row["caseId"]]["flow"],
        "turns": row["input"]["turns"], "context": row["input"]["reviewContext"], "answer": row["answer"], "citations": row["citations"],
        "authorizedSources": [{key: item[key] for key in ("ref", "version", "contentHash", "reviewExcerpt") if key in item}
                              for item in row["authorizedSources"] if item["ref"] in row["retrievedReferences"]],
    } for row in executions]
    random.SystemRandom().shuffle(public_rows)
    return {"schemaVersion": 1, "responses": public_rows}


def compare(batch, cases, first, second, resolutions=()):
    executions = batch["executions"]
    left, evaluator_a = validate_reviews(executions, first, "a", gate_keys=PILOT_GATES)
    right, evaluator_b = validate_reviews(executions, second, "b", gate_keys=PILOT_GATES)
    require(evaluator_a != evaluator_b, "strategic_quality_requires_two_distinct_evaluators")
    reviews = {response["responseId"]: response for response in resolutions}
    require(len(reviews) == len(resolutions) and reviews.keys() <= left.keys(), "invalid_adjudication_coverage")
    per_group = defaultdict(list)
    for row in executions:
        case = cases[row["caseId"]]
        response_id = row["responseId"]
        a, b = left[response_id], right[response_id]
        divergent = [key for key in DIMENSIONS if abs(a["scores"][key] - b["scores"][key]) > 1]
        resolved_score = None
        if divergent and response_id in reviews:
            resolution = reviews[response_id]
            require(str(resolution.get("justification") or "").strip()
                    and all(type(resolution.get("scores", {}).get(key)) is int and 0 <= resolution["scores"][key] <= 4
                            for key in DIMENSIONS), "invalid_adjudication")
            resolved_score = Fraction(sum(resolution["scores"][key] for key in DIMENSIONS), len(DIMENSIONS))
        score = resolved_score if divergent else Fraction(sum(a["scores"][key] + b["scores"][key] for key in DIMENSIONS), 2 * len(DIMENSIONS))
        gates = [key for key in PILOT_GATES if not a["gates"][key] or not b["gates"][key]]
        authorized = {item["ref"] for item in row["authorizedSources"]}
        retrieved = set(row["retrievedReferences"])
        cited = len(row["citations"])
        structural = {index for index, ref in enumerate(row["citations"]) if ref in authorized and ref in retrieved}
        valid = len(structural & valid_citation_indexes(a, cited) & valid_citation_indexes(b, cited))
        if retrieved - authorized:
            gates.append("retrievalScope")
        if len(structural) < cited or case["requiresEvidence"] and valid == 0:
            gates.append("requiredEvidenceOrCitationIntegrity")
        per_group[case["pilot"]].append((case, row, score, divergent, gates, cited, valid))
    groups = {group: summarize_group(per_group[group], batch["provenance"]) for group in GROUPS}
    economic = economics(executions)
    budget = "pending"
    if batch["provenance"] == "live":
        ceiling = amount(batch["authorization"]["ceilingBrl"])
        known = economic["knownCostSubtotalBrl"]
        if known is not None and amount(known) > ceiling:
            budget = "exceeded"
        elif economic["totalCostBrl"] is not None and economic["attempts"].get("generation", 0) > 0:
            budget = "within_ceiling"
    return {
        "schemaVersion": 1, "corpusHash": batch["corpusHash"], "provenance": batch["provenance"],
        "versions": {key: {condition: batch["versions"][key][condition] for condition in CONDITIONS}
                     for key in sorted({snapshot_key(case) for case in cases.values()})},
        "evaluators": [evaluator_a, evaluator_b], "groups": groups,
        "batchEconomics": economic, "batchBudget": budget,
    }


def valid_citation_indexes(review, cited):
    indexes = review.get("validCitationIndexes")
    require(isinstance(indexes, list) and all(nonnegative_integer(index) and index < cited for index in indexes)
            and len(set(indexes)) == len(indexes), "invalid_review_citation_indexes")
    return set(indexes)


def summarize_group(rows, provenance):
    scores = defaultdict(list)
    disagreements, critical = [], []
    emitted = valid = 0
    for case, row, score, divergent, gates, cited, valid_count in rows:
        emitted += cited
        valid += valid_count
        if divergent:
            disagreements.append({"responseId": row["responseId"], "dimensions": divergent, "resolved": score is not None})
        if gates:
            critical.append({"responseId": row["responseId"], "gates": gates})
        if score is not None:
            scores[(case["id"], row["condition"])].append(score)
    cohort = {case["id"]: case for case, *_ in rows}
    deltas = {}
    for case_id in cohort:
        current, candidate = (scores[(case_id, condition)] for condition in CONDITIONS)
        if len(current) == len(candidate) == len(REPEATS):
            deltas[case_id] = (sum(candidate) - sum(current)) / len(REPEATS)
    targeted = [delta for case_id, delta in deltas.items() if cohort[case_id]["target"]]
    other = [delta for case_id, delta in deltas.items() if not cohort[case_id]["target"]]
    held = [delta for case_id, delta in deltas.items() if cohort[case_id]["holdout"]]
    rate = Fraction(valid, emitted) if emitted else None
    reasons = []
    if any(not item["resolved"] for item in disagreements):
        reasons.append("unresolved_disagreement")
    if any(not row["answer"].strip() for _, row, *_ in rows):
        reasons.append("response_missing")
    if critical:
        reasons.append("critical_violation")
    if rate is None or rate < Fraction(95, 100):
        reasons.append("insufficient_valid_references")
    if not targeted or sum(targeted) / len(targeted) < Fraction(4, 10):
        reasons.append("target_gain_below_minimum")
    if not other or sum(other) / len(other) < Fraction(-2, 10):
        reasons.append("regression_above_maximum")
    grouped_economics, by_category = defaultdict(list), defaultdict(list)
    for case, row, *_ in rows:
        grouped_economics[(case.get("outcomeKind", "mission"), row["condition"])].append(row)
        by_category[(case["category"], row["condition"])].append(row)
    return {
        "acceptance": "not_evaluated" if provenance == "simulated" else "failed" if reasons else "passed",
        "reasons": reasons, "cases": len(cohort), "holdoutCases": sum(case["holdout"] for case in cohort.values()),
        "responses": len(rows), "disagreements": disagreements, "criticalViolations": critical,
        "referenceValidation": {"emitted": emitted, "valid": valid, "rate": float(rate) if rate is not None else None},
        "target": delta_statistics(targeted), "remaining": delta_statistics(other), "holdout": delta_statistics(held),
        "economics": {f"{outcome}:{condition}": economics(entries) for (outcome, condition), entries in grouped_economics.items()},
        "economicsByCategory": {f"{category}:{condition}": economics(entries) for (category, condition), entries in by_category.items()},
    }


def delta_statistics(values):
    return {
        "pairedCases": len(values), "meanDelta": float(sum(values) / len(values)) if values else None,
        "populationStdDev": pstdev(map(float, values)) if values else None,
    }


def economics(executions):
    attempts = [attempt for row in executions for attempt in row.get("attempts") or []]
    unmetered = sum(row.get("attempts") is None for row in executions)
    missing_costs = sum(attempt["costBrl"] is None for attempt in attempts)
    costs = [amount(attempt["costBrl"]) for attempt in attempts if attempt["costBrl"] is not None]
    total = sum(costs, Decimal(0)) if not unmetered and not missing_costs else None
    outcomes = [row.get("outcome") or {} for row in executions]
    reviewed = [outcome for outcome in outcomes if outcome.get("accepted") is not None]
    approvals = sum(outcome["accepted"] is True for outcome in reviewed)
    first_reviews = [outcome["acceptedOnFirstReview"] for outcome in reviewed if outcome.get("acceptedOnFirstReview") is not None]
    corrections = [outcome["priceOrScopeCorrected"] for outcome in reviewed if outcome.get("priceOrScopeCorrected") is not None]
    latencies = sorted(row["latencyMs"] for row in executions)
    return {
        "totalCostBrl": str(total) if total is not None else None,
        "knownCostSubtotalBrl": str(sum(costs, Decimal(0))) if costs or total is not None else None,
        "unmeteredExecutions": unmetered, "attemptsWithoutCost": missing_costs,
        "attempts": dict(Counter(attempt["kind"] for attempt in attempts)),
        "meanCallsPerCase": len(attempts) / len(executions) if executions and not unmetered else None,
        "inputTokens": total_tokens(attempts, unmetered, "inputTokens"),
        "outputTokens": total_tokens(attempts, unmetered, "outputTokens"),
        "reasoningTokens": total_tokens([attempt for attempt in attempts if attempt["kind"] == "generation"], unmetered, "reasoningTokens"),
        "approved": approvals, "awaitingReview": len(executions) - len(reviewed),
        "firstReviewSample": len(first_reviews),
        "firstReviewAcceptRate": sum(first_reviews) / len(first_reviews) if first_reviews else None,
        "priceOrScopeCorrectionSample": len(corrections), "priceOrScopeCorrections": sum(corrections) if corrections else None,
        "costPerApprovedBrl": str(total / approvals) if total is not None and approvals and len(reviewed) == len(executions) else None,
        "latencyMedianMs": median(latencies) if latencies else None,
        "latencyP95Ms": latencies[ceil(0.95 * len(latencies)) - 1] if latencies else None,
    }


def total_tokens(attempts, unmetered, field):
    values = [attempt.get(field) for attempt in attempts]
    return sum(values) if not unmetered and all(value is not None for value in values) else None


def recorded_text(value):
    return isinstance(value, str) and bool(value.strip())


def scope_id(value):
    if not isinstance(value, str):
        return False
    try:
        identifier = UUID(value)
        return str(identifier) == value and identifier.int != 0
    except ValueError:
        return False


def scoped_record(record, fingerprint):
    return (isinstance(record, dict) and record.get("scopeFingerprint") == fingerprint
            and recorded_text(record.get("reference")))


def activation_entry(scope):
    account_contract = f"{scope['organizationId']}:{scope['contractId']}"
    if scope["flow"] == "presales":
        return PRESALES_SCOPE_FLAG, account_contract
    suffix = MISSION_SCOPE_SUFFIXES[(scope["flow"], scope["audience"])]
    return MISSION_SCOPE_FLAG, f"{account_contract}:{suffix}"


def approved_activation_scopes(report):
    approved = {flag: [] for flag in PILOT_FLAGS}
    for scope in report:
        if not scope["supervisedBlockers"]:
            flag, entry = activation_entry(scope)
            approved[flag].append(entry)
    return {flag: sorted(entries) for flag, entries in approved.items()}


def activation_config_values(values):
    require(isinstance(values, dict) and values.keys() == PILOT_FLAG_NAMES
            and all(isinstance(value, str) for value in values.values()), "four_pilot_flag_values_required")
    return {flag: {entry.strip().lower() for entry in value.split(",") if entry.strip()} for flag, value in values.items()}


def check_activation_config(release, config):
    require(isinstance(config, dict) and config.get("environment") == release["environment"]
            and config.get("revision") == release["revision"], "activation_environment_or_revision_mismatch")
    current = activation_config_values(config.get("current"))
    proposed = activation_config_values(config.get("proposed"))
    organizations = {flag: set() for flag in PILOT_FLAGS}
    for scope in release["scopes"]:
        flag, _ = activation_entry(scope)
        organizations[flag].add(scope["organizationId"])
        if release["observation"][scope["pilot"]]["criticalViolation"]:
            for affected in PILOT_FLAGS:
                organizations[affected].add(scope["organizationId"])

    blockers = {}
    for flag, legacy in PILOT_FLAGS.items():
        target = organizations[flag]
        approved = set(release["supervisedActivationScopes"][flag])
        scoped = {entry for entry in proposed[flag] if entry.split(":", 1)[0] in target}
        if scoped - approved:
            blockers.setdefault(flag, []).append("scope_without_current_approval")
        if any(entry.split(":", 1)[0] not in target for entry in current[flag] ^ proposed[flag]):
            blockers.setdefault(flag, []).append("scope_outside_release_changed")
        if proposed[legacy] & target:
            blockers.setdefault(legacy, []).append("legacy_organization_activation_too_broad")
        if (current[legacy] ^ proposed[legacy]) - target:
            blockers.setdefault(legacy, []).append("organization_outside_release_changed")
    return {"blockers": blockers}


def check_release(manifest, corpus_hash, quality=None):
    require(isinstance(manifest, dict) and manifest.get("schemaVersion") == 1 and recorded_text(manifest.get("environment"))
            and isinstance(manifest.get("revision"), str) and re.fullmatch(r"[0-9a-f]{40}", manifest["revision"]),
            "release_environment_and_git_revision_required")
    scopes = manifest.get("scopes")
    require(isinstance(scopes, list) and scopes and all(isinstance(row, dict) for row in scopes), "release_scopes_required")
    report, scopes_seen, organizations, contracts, decisions = [], set(), {}, {}, set()
    covered_paths = defaultdict(set)
    sample = Counter()
    insufficient, critical = set(), set()
    quality_ready = (isinstance(quality, dict) and quality.get("schemaVersion") == 1 and quality.get("corpusHash") == corpus_hash
                     and quality.get("provenance") == "live" and quality.get("batchBudget") == "within_ceiling"
                     and all((quality.get("groups") or {}).get(group, {}).get("acceptance") == "passed" for group in GROUPS))
    for row in scopes:
        pilot, flow, audience = (row.get(key) for key in ("pilot", "flow", "audience"))
        organization, contract = row.get("organizationId"), row.get("contractId")
        require(all(recorded_text(item) for item in (pilot, flow, audience)) and pilot in PILOTS
                and flow in RELEASE_FLOWS[pilot] and audience in RELEASE_AUDIENCES[flow] and scope_id(organization) and scope_id(contract)
                and hash_value(row.get("candidateHash")), "invalid_pilot_release_scope")
        require(organizations.setdefault(pilot, organization) == organization
                and contracts.setdefault(contract, organization) == organization, "release_scope_identity_conflict")
        scope = {key: row[key] for key in ("pilot", "organizationId", "contractId", "flow", "audience", "candidateHash")}
        fingerprint = digest({**scope, "environment": manifest["environment"], "revision": manifest["revision"]})
        path = (pilot, contract, flow, audience)
        require(path not in scopes_seen, "duplicate_pilot_release_scope")
        scopes_seen.add(path)
        covered_paths[pilot].add((flow, audience))
        blockers = []
        for key in ("journey", "rollback"):
            evidence = row.get(key)
            if not scoped_record(evidence, fingerprint) or evidence.get("result") != "passed":
                blockers.append(f"{key}_evidence_required")
        for key in ("commercialApproval", "technicalApproval"):
            approval = row.get(key)
            if (not scoped_record(approval, fingerprint) or approval.get("decision") != "approved"
                    or not recorded_text(approval.get("reviewer"))):
                blockers.append(f"{key}_required")
        if not blockers and row["commercialApproval"]["reference"].strip() == row["technicalApproval"]["reference"].strip():
            blockers.append("separate_approval_records_required")
        observed = row.get("decisions", [])
        require(isinstance(observed, list), "invalid_observed_pilot_decision")
        for decision in observed:
            require(scoped_record(decision, fingerprint) and recorded_text(decision.get("id"))
                    and decision["id"] not in decisions and decision.get("decision") in ("accepted", "rejected")
                    and decision.get("mode") == "draft"
                    and type(decision.get("criticalViolation")) is bool
                    and decision.get("case") in ("standard", "insufficient_information"), "invalid_observed_pilot_decision")
            decisions.add(decision["id"])
            sample[pilot] += 1
            if decision["case"] == "insufficient_information":
                insufficient.add(pilot)
            if decision["criticalViolation"]:
                critical.add(pilot)
        comparison_key = f"{pilot}:{'presales' if flow == 'presales' else 'mission'}"
        matched = quality_ready and (quality.get("versions") or {}).get(comparison_key, {}).get("candidate") == row["candidateHash"]
        report.append({**scope, "scopeFingerprint": fingerprint, "supervisedBlockers": blockers, "qualityMatched": matched})
    require(len(set(organizations.values())) == len(organizations), "release_pilots_must_use_separate_organizations")
    for row in report:
        if row["pilot"] in critical:
            row["supervisedBlockers"].append("critical_pilot_violation")
    observation = {pilot: {"reviewedDecisions": sample[pilot], "includesInsufficientInformation": pilot in insufficient,
                           "criticalViolation": pilot in critical} for pilot in PILOTS}
    expansion_blockers = []
    for pilot, flows in RELEASE_FLOWS.items():
        required = {(flow, audience) for flow in flows for audience in RELEASE_AUDIENCES[flow]}
        if required - covered_paths[pilot]:
            expansion_blockers.append(f"{pilot}_flows_incomplete")
    if not all(not row["supervisedBlockers"] for row in report):
        expansion_blockers.append("supervised_approval_required")
    if not all(row["qualityMatched"] for row in report):
        expansion_blockers.append("approved_quality_and_budget_for_candidate_required")
    for pilot in PILOTS:
        if sample[pilot] < 10 or pilot not in insufficient:
            expansion_blockers.append(f"{pilot}_observation_incomplete")
    return {"schemaVersion": 1, "environment": manifest["environment"], "revision": manifest["revision"], "scopes": report,
            "observation": observation, "expansionBlockers": expansion_blockers,
            "supervisedActivationScopes": approved_activation_scopes(report)}


def main():
    parser = argparse.ArgumentParser(description="Evaluate pilot captures and release records from local files.")
    parser.add_argument("action", choices=("template", "attach-attempts", "blind", "score", "check-release"))
    parser.add_argument("--capture", type=Path)
    parser.add_argument("--review-a", type=Path)
    parser.add_argument("--review-b", type=Path)
    parser.add_argument("--adjudications", type=Path)
    parser.add_argument("--runtime-receipts", type=Path)
    parser.add_argument("--release-manifest", type=Path)
    parser.add_argument("--activation-config", type=Path)
    parser.add_argument("--phase", choices=("supervised", "expansion"), default="supervised")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.activation_config and args.action != "check-release":
        parser.error("--activation-config requires check-release")
    cases, corpus_hash = load_cohort()
    scoring = args.action == "score" or (args.action == "check-release" and args.phase == "expansion")
    if scoring and (not args.capture or not args.review_a or not args.review_b):
        parser.error("--capture and two independent review files are required")
    if scoring:
        batch = json.loads(args.capture.read_text(encoding="utf-8"))
        validate_capture(batch, cases, corpus_hash)
        quality = compare(batch, cases, read_jsonl(args.review_a), read_jsonl(args.review_b),
                          read_jsonl(args.adjudications) if args.adjudications else ())
    if args.action == "template":
        result = capture_template(cases, corpus_hash)
    elif args.action == "score":
        result = quality
    elif args.action == "check-release":
        if not args.release_manifest:
            parser.error("--release-manifest is required")
        result = check_release(json.loads(args.release_manifest.read_text(encoding="utf-8")), corpus_hash,
                               quality if scoring else None)
        if args.activation_config:
            config = json.loads(args.activation_config.read_text(encoding="utf-8"))
            result["activationConfig"] = check_activation_config(result, config)
    else:
        if not args.capture:
            parser.error("--capture is required")
        batch = json.loads(args.capture.read_text(encoding="utf-8"))
        if args.action == "attach-attempts":
            if not args.runtime_receipts:
                parser.error("--runtime-receipts is required")
            require(batch.get("schemaVersion") == 1 and batch.get("corpusHash") == corpus_hash, "frozen_corpus_mismatch")
            result = attach_metered_attempts(batch, json.loads(args.runtime_receipts.read_text(encoding="utf-8")))
        else:
            validate_capture(batch, cases, corpus_hash)
            result = blind_packet(batch["executions"], cases)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2, sort_keys=True)
        output.write("\n")
    if args.action == "score":
        if result["batchBudget"] != "within_ceiling" or any(group["acceptance"] != "passed" for group in result["groups"].values()):
            return 2
    if args.action == "check-release":
        blockers = result["expansionBlockers"] if args.phase == "expansion" else any(
            scope["supervisedBlockers"] for scope in result["scopes"])
        if blockers or result.get("activationConfig", {}).get("blockers"):
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
