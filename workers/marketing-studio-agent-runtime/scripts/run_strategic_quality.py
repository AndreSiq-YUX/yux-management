from __future__ import annotations

import argparse
from dataclasses import dataclass
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import random
import sys
import time
from typing import Any
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from yux_agent_runtime.mission_conversation import MissionConversationWorkflow  # noqa: E402
from yux_agent_runtime.providers import OpenRouterClient, ProviderRequestError  # noqa: E402
from yux_agent_runtime.runtime_factory import build_strategy_workflow_engine  # noqa: E402
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore  # noqa: E402

CONDITIONS = ("no_knowledge", "current", "extended")
CATEGORIES = ("diagnosis", "positioning", "acquisition_relationship", "constraints")


@dataclass
class RecordingClient(OpenRouterClient):
    last_call: dict[str, Any] | None = None

    def chat_completion(self, **kwargs):  # type: ignore[no-untyped-def]
        response = super().chat_completion(**kwargs)
        self.last_call = response
        return response


class EvaluationStore(InMemoryAgentRuntimeStore):
    def __init__(self, case: dict[str, Any], condition: str):
        super().__init__(tables=base_tables(case))
        self.case = case
        self.condition = condition

    def _authorized_candidates(self):
        texts = [] if self.condition == "no_knowledge" else list(self.case.get("currentKnowledge") or [])
        if self.condition == "extended":
            texts += list(self.case.get("extendedKnowledge") or [])
        return [candidate(self.case["id"], index, text) for index, text in enumerate(texts)]

    def search_authorized(self, **_kwargs):
        return self._authorized_candidates()

    def retrieve_authorized_knowledge(self, **_kwargs):
        return self._authorized_candidates()

    def log_retrieval_query(self, payload):
        return payload


def load_cases(path: Path) -> list[dict[str, Any]]:
    cases = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    ids = [str(case.get("id")) for case in cases]
    counts = {category: sum(case.get("category") == category for case in cases) for category in CATEGORIES}
    if len(cases) != 24 or len(set(ids)) != 24 or any(counts[category] != 6 for category in CATEGORIES):
        raise ValueError("strategic_quality_requires_24_cases_six_per_category")
    if sum(case.get("holdout") is True for case in cases) != 6:
        raise ValueError("strategic_quality_requires_six_holdouts")
    if any(Decimal(str(case.get("estimatedCostBrl", "0"))) <= 0 for case in cases):
        raise ValueError("strategic_quality_cost_estimate_required")
    return cases


def projected_cost(cases: list[dict[str, Any]], repeats: int, conditions: list[str]) -> Decimal:
    return sum(Decimal(str(case["estimatedCostBrl"])) for case in cases) * repeats * len(conditions)


def run_batch(args: argparse.Namespace, checkpoint=None) -> dict[str, Any]:
    cases = load_cases(args.cases)
    conditions = [item.strip() for item in args.conditions.split(",") if item.strip()]
    if not conditions or any(item not in CONDITIONS for item in conditions):
        raise ValueError("strategic_quality_condition_invalid")
    if args.repeats < 1:
        raise ValueError("strategic_quality_repeats_invalid")
    maximum = Decimal(str(args.max_cost_brl))
    reserved = projected_cost(cases, args.repeats, conditions)
    if reserved > maximum:
        raise ValueError(f"strategic_quality_budget_exceeded:projected={reserved}:maximum={maximum}")
    if not os.getenv("OPENROUTER_API_KEY"):
        raise ProviderRequestError("missing_openrouter_api_key")

    rng = random.Random(args.seed)
    work = [(case, condition, repetition) for case in cases for condition in conditions for repetition in range(1, args.repeats + 1)]
    rng.shuffle(work)
    report: dict[str, Any] = {
        "schemaVersion": 1, "status": "running", "fixtureCorpus": False,
        "sample": {"cases": len(cases), "holdouts": 6, "conditions": conditions, "repeats": args.repeats, "responses": 0},
        "budget": {"maximumBrl": str(maximum), "projectedBrl": str(reserved), "accountedBrl": "0"},
        "caseRelevance": {case["id"]: bool(case.get("relevantToExtended")) for case in cases},
        "executions": [], "acceptance": {"evaluatorsRequired": 2, "status": "not_evaluated"},
    }
    executions: list[dict[str, Any]] = report["executions"]
    spent = Decimal("0")
    for case, condition, repetition in work:
        estimate = Decimal(str(case["estimatedCostBrl"]))
        if spent + estimate > maximum:
            raise ValueError("strategic_quality_budget_exhausted_before_call")
        client = RecordingClient.from_env()
        workflow = MissionConversationWorkflow(build_strategy_workflow_engine(EvaluationStore(case, condition), client))
        request = build_request(case, condition, repetition)
        started = time.perf_counter()
        response = workflow.respond(request)
        latency_ms = round((time.perf_counter() - started) * 1000)
        call = client.last_call or {}
        measured_usd = call.get("cost_usd")
        if measured_usd is not None:
            if args.usd_brl is None:
                cost = estimate; cost_basis = "provider_usd_measured_conversion_unavailable_estimate_used"
            else:
                cost = Decimal(str(measured_usd)) * Decimal(str(args.usd_brl)); cost_basis = "provider_measured"
        else:
            cost = estimate; cost_basis = "predeclared_estimate_provider_cost_unavailable"
        spent += cost
        if spent > maximum:
            raise ValueError("strategic_quality_measured_budget_exceeded")
        source_validation = validate_source_structure([item.model_dump() for item in response.sources])
        executions.append({
            "responseId": str(uuid5(NAMESPACE_URL, f"{case['id']}:{condition}:{repetition}:{args.seed}")),
            "caseId": case["id"], "category": case["category"], "holdout": bool(case.get("holdout")),
            "relevantToExtended": bool(case.get("relevantToExtended")),
            "condition": condition, "repetition": repetition, "request": sanitize_request(request),
            "response": response.model_dump(), "sources": [item.model_dump() for item in response.sources],
            "sourceValidation": source_validation,
            "model": call.get("model"), "promptHash": call.get("prompt_hash"),
            "releaseIds": sorted({item.publicationId for item in response.sources if item.publicationId}),
            "usage": response.usage.model_dump(), "costBrl": str(cost.quantize(Decimal("0.000001"))),
            "costBasis": cost_basis, "latencyMs": latency_ms, "seed": args.seed,
            "configuration": {"conditions": conditions, "repeats": args.repeats, "temperature": 0},
        })
        report["sample"]["responses"] = len(executions)
        report["budget"]["accountedBrl"] = str(spent)
        if checkpoint:
            checkpoint(report)
    report["status"] = "awaiting_blind_review"
    if checkpoint:
        checkpoint(report)
    return report


def validate_source_structure(sources: list[dict[str, Any]]) -> dict[str, int]:
    required = ("publicationId", "itemId", "knowledgePolicyVersion", "useMode", "bindingFingerprint", "contentHash")
    valid = 0
    for source in sources:
        complete = all(source.get(key) not in (None, "") for key in required)
        hashes_valid = all(len(str(source.get(key) or "")) == 64 for key in ("bindingFingerprint", "contentHash"))
        valid += int(complete and hashes_valid)
    return {"emitted": len(sources), "structurallyValid": valid}


def candidate(case_id: str, index: int, text: str) -> dict[str, Any]:
    card_id = str(uuid5(NAMESPACE_URL, f"yux-eval-card:{case_id}:{index}:{text}"))
    publication_id = str(uuid5(NAMESPACE_URL, f"yux-eval-release:{case_id}:{index}"))
    return {"namespace": "strategy", "id": card_id, "publication_id": publication_id,
        "item_id": str(uuid5(NAMESPACE_URL, f"yux-eval-item:{case_id}:{index}")), "document_id": None,
        "source_locator": f"case:{case_id}:{index}", "content": text,
        "source_content_hash": hashlib.sha256(text.encode()).hexdigest(), "use_mode": "quotable",
        "binding_fingerprint": hashlib.sha256(f"binding:{case_id}:{index}".encode()).hexdigest(),
        "lexical_score": 1 - index / 100, "vector_score": None, "combined_score": 1 - index / 100}


def base_tables(case: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    return {
        "yux_strategy_agent_profiles": [{"id": "eval-profile", "profile_key": "growth_strategist", "status": "active", "allowed_tools": [], "forbidden_actions": [], "max_cards": 12, "max_chunks": 4}],
        "marketing_agent_global_prompts": [{"id": "eval-prompt", "agent_type": "growth_strategist", "status": "active", "system_prompt": "Responda em JSON, use apenas fontes fornecidas e explicite limitações.", "prompt_version": 1}],
        "model_routing_rules": [{"id": "eval-route", "agent_type": "growth_strategist", "routing_tier": "default", "provider": "openrouter", "model_name": os.getenv("OPENROUTER_STRATEGIC_QUALITY_MODEL", "openai/gpt-4.1-mini"), "status": "active", "max_output_tokens": 1800, "temperature": 0}],
        "organization_company_profiles": [{"id": "eval-company", "organization_id": "eval-org", "trade_name": "Empresa avaliada", "description": case.get("message")}],
        "marketing_brand_profiles": [], "marketing_products_services": []}


def build_request(case: dict[str, Any], condition: str, repetition: int) -> dict[str, Any]:
    return {"schemaVersion": 1, "organization_id": "eval-org", "client_id": "eval-client", "contract_id": "eval-contract",
        "conversation_id": f"eval:{case['id']}:{condition}:{repetition}", "audience": "client_user",
        "user_message": case["message"], "transcript": [{"role": "user", "content": case["message"]}],
        "rollingSummary": "Ensaio estratégico cego.", "currentBrief": {}, "operationalContext": {},
        "allowedActionPacks": [], "allowedCapabilityKeys": []}


def sanitize_request(request: dict[str, Any]) -> dict[str, Any]:
    safe = dict(request); safe["organization_id"] = hashlib.sha256(str(request["organization_id"]).encode()).hexdigest()[:16]
    safe.pop("client_id", None); safe.pop("contract_id", None); safe.pop("conversation_id", None)
    return safe


def blind_packets(executions: list[dict[str, Any]], seed: int) -> list[dict[str, Any]]:
    packets = [{"responseId": item["responseId"], "caseId": item["caseId"], "category": item["category"],
        "request": item["request"], "response": item["response"], "sources": item["sources"]} for item in executions]
    random.Random(seed).shuffle(packets)
    return packets


def write_artifacts(output: Path, report: dict[str, Any], seed: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    blind_output = output.with_name(f"{output.stem}.blind-review.json")
    blind_output.write_text(json.dumps({
        "schemaVersion": 1, "rubric": "../strategic-quality/rubric.md",
        "responses": blind_packets(report["executions"], seed),
    }, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report["blindReviewPacket"] = str(blind_output)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the live, budget-bounded YUX strategic quality evaluation.")
    parser.add_argument("--cases", type=Path, required=True); parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--conditions", default=",".join(CONDITIONS)); parser.add_argument("--max-cost-brl", type=Decimal, required=True)
    parser.add_argument("--usd-brl", type=Decimal); parser.add_argument("--seed", type=int, default=20260905)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try: report = run_batch(args, lambda current: write_artifacts(args.output, current, args.seed))
    except (ValueError, ProviderRequestError) as error:
        print(json.dumps({"status": "blocked", "reason": str(error)}, ensure_ascii=False)); return 2
    print(json.dumps({"status": report["status"], "responses": len(report["executions"]), "output": str(args.output)}, ensure_ascii=False)); return 0


if __name__ == "__main__": raise SystemExit(main())
