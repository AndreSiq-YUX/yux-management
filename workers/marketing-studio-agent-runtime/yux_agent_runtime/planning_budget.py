from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


@dataclass(frozen=True)
class PlanningBudget:
    max_calls: int
    max_input_tokens: int
    max_output_tokens: int
    max_cost_brl: str
    max_latency_ms: int


@dataclass(frozen=True)
class PlanningUsage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_brl: str = "0"
    latency_ms: int = 0


@dataclass(frozen=True)
class PlanningEstimate(PlanningUsage):
    pass


@dataclass(frozen=True)
class PlanningReservationDecision:
    allowed: bool
    reason: str | None
    projected: PlanningUsage

    def as_dict(self) -> dict[str, Any]:
        return {"allowed": self.allowed, "reason": self.reason, "projected": asdict(self.projected)}


def reserve_planning_call(
    budget: PlanningBudget,
    usage: PlanningUsage,
    estimate: PlanningEstimate,
) -> PlanningReservationDecision:
    projected = PlanningUsage(
        calls=usage.calls + estimate.calls,
        input_tokens=usage.input_tokens + estimate.input_tokens,
        output_tokens=usage.output_tokens + estimate.output_tokens,
        cost_brl=_format_decimal(_decimal(usage.cost_brl) + _decimal(estimate.cost_brl)),
        latency_ms=usage.latency_ms + estimate.latency_ms,
    )
    ceilings = (
        ("calls", projected.calls, budget.max_calls),
        ("input_tokens", projected.input_tokens, budget.max_input_tokens),
        ("output_tokens", projected.output_tokens, budget.max_output_tokens),
        ("latency_ms", projected.latency_ms, budget.max_latency_ms),
    )
    for name, actual, ceiling in ceilings:
        if actual > ceiling:
            return PlanningReservationDecision(False, f"planning_budget_{name}_exhausted", projected)
    if _decimal(projected.cost_brl) > _decimal(budget.max_cost_brl):
        return PlanningReservationDecision(False, "planning_budget_cost_brl_exhausted", projected)
    return PlanningReservationDecision(True, None, projected)


def should_run_specialist(
    required_when: dict[str, Any] | None,
    context: dict[str, Any],
    *,
    artifact_valid: bool,
) -> bool:
    if artifact_valid:
        return False
    if not required_when:
        return True
    actual = context.get(str(required_when.get("field") or ""))
    if "equals" in required_when:
        return actual == required_when["equals"]
    if "includes" in required_when:
        return isinstance(actual, list) and required_when["includes"] in actual
    return False


def decision_from_wire(value: dict[str, Any]) -> PlanningReservationDecision:
    budget_value = value.get("budget") or {}
    usage_value = value.get("usage") or {}
    estimate_value = value.get("estimate") or {}
    return reserve_planning_call(
        PlanningBudget(
            max_calls=int(budget_value.get("maxCalls", 0)),
            max_input_tokens=int(budget_value.get("maxInputTokens", 0)),
            max_output_tokens=int(budget_value.get("maxOutputTokens", 0)),
            max_cost_brl=str(budget_value.get("maxCostBrl", "0")),
            max_latency_ms=int(budget_value.get("maxLatencyMs", 0)),
        ),
        PlanningUsage(
            calls=int(usage_value.get("calls", 0)), input_tokens=int(usage_value.get("inputTokens", 0)),
            output_tokens=int(usage_value.get("outputTokens", 0)), cost_brl=str(usage_value.get("costBrl", "0")),
            latency_ms=int(usage_value.get("latencyMs", 0)),
        ),
        PlanningEstimate(
            calls=int(estimate_value.get("calls", 0)), input_tokens=int(estimate_value.get("inputTokens", 0)),
            output_tokens=int(estimate_value.get("outputTokens", 0)), cost_brl=str(estimate_value.get("costBrl", "0")),
            latency_ms=int(estimate_value.get("latencyMs", 0)),
        ),
    )


def _decimal(value: str) -> Decimal:
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ValueError("planning_decimal_invalid") from error
    if not parsed.is_finite() or parsed < 0:
        raise ValueError("planning_decimal_invalid")
    return parsed


def _format_decimal(value: Decimal) -> str:
    return format(value.normalize(), "f")
