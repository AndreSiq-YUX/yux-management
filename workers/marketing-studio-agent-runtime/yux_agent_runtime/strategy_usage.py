from __future__ import annotations

from collections import defaultdict
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from math import isfinite
from typing import Any, Callable

from .planning_budget import PlanningRuntimeBudget


_meter: ContextVar[StrategyUsage | None] = ContextVar("strategy_usage", default=None)
_stage: ContextVar[str] = ContextVar("strategy_usage_stage", default="retrieval")


class PlanningLimitExceeded(RuntimeError):
    pass


@dataclass
class StrategyUsage:
    record: Callable[[list[dict[str, Any]]], None] | None = None
    attempts: list[dict[str, Any]] = field(default_factory=list)
    max_planning_attempts: int | None = None
    planning_budget: PlanningRuntimeBudget | None = None
    check_planning_deadline: Callable[[], float] | None = None
    _planning_output_caps: list[int] = field(default_factory=list, init=False, repr=False)

    @contextmanager
    def activate(self):
        token = _meter.set(self)
        try:
            yield
        finally:
            _meter.reset(token)

    def persist(self):
        if self.record is not None:
            self.record(self.attempts)

    def known_tokens(self, kind: str) -> int:
        return sum((attempt["tokens"] or {}).get(kind) or 0 for attempt in self.attempts)

    def planning_output_committed(self) -> int:
        committed = 0
        for attempt, cap in zip(self.attempts, self._planning_output_caps, strict=True):
            measured = (attempt["tokens"] or {}).get("output")
            committed += cap if measured is None else measured
        return committed

    def limit_planning_request(self, payload: dict[str, Any]):
        assert self.planning_budget is not None and self.max_planning_attempts is not None
        if self.check_planning_deadline is not None:
            self.check_planning_deadline()
        if len(self.attempts) >= self.max_planning_attempts:
            raise PlanningLimitExceeded("mission_plan_attempt_limit_exhausted")
        if self.known_tokens("input") >= self.planning_budget.input_tokens:
            raise PlanningLimitExceeded("mission_plan_input_token_limit_exhausted")
        # An unconfirmed attempt keeps its output allowance. The receipt still
        # distinguishes missing measurements from observed zero tokens.
        remaining = self.planning_budget.output_tokens - self.planning_output_committed()
        if remaining <= 0:
            raise PlanningLimitExceeded("mission_plan_output_token_limit_exhausted")
        cap = min(payload["max_completion_tokens"], remaining)
        payload["max_completion_tokens"] = cap
        self._planning_output_caps.append(cap)

    def check_planning_tokens(self):
        if self.planning_budget is None:
            return
        if self.known_tokens("input") > self.planning_budget.input_tokens:
            raise PlanningLimitExceeded("mission_plan_input_token_limit_exhausted")
        if self.planning_output_committed() > self.planning_budget.output_tokens:
            raise PlanningLimitExceeded("mission_plan_output_token_limit_exhausted")

    def total_cost_usd(self):
        costs = [attempt["costUsd"] for attempt in self.attempts]
        return sum(costs) if costs and all(cost is not None for cost in costs) else None

    def planning_measurements(self):
        grouped = defaultdict(list)
        for attempt in self.attempts:
            grouped[attempt["stage"]].append(attempt)
        measurements = []
        for node, attempts in grouped.items():
            costs = [attempt["costUsd"] for attempt in attempts]
            known_costs = [cost for cost in costs if cost is not None]
            subtotal = sum(known_costs)
            row = {
                "node": node, "attemptCount": len(attempts), "attemptsWithoutCost": costs.count(None),
                "reportedCostUsd": subtotal if None not in costs and isfinite(subtotal) else None,
                "knownCostSubtotalUsd": subtotal if known_costs and isfinite(subtotal) else None,
            }
            for token, field, known_field in (
                ("input", "inputTokens", "knownInputTokens"),
                ("output", "outputTokens", "knownOutputTokens"),
                ("reasoning", "reasoningTokens", "knownReasoningTokens"),
            ):
                counts = [(attempt["tokens"] or {}).get(token) for attempt in attempts]
                known = sum(count for count in counts if count is not None)
                row[field] = known if None not in counts else None
                row[known_field] = known if any(count is not None for count in counts) else None
            measurements.append(row)
        return measurements


@contextmanager
def strategy_usage_stage(stage: str):
    token = _stage.set(stage)
    try:
        yield
    finally:
        _stage.reset(token)


@contextmanager
def measure_without_credit_hold(record: Callable[[list[dict[str, Any]]], None]):
    if _meter.get() is not None:
        yield  # The caller already records attempts against its reservation.
    else:
        with StrategyUsage(record=record).activate():
            yield


def strategy_metered_transport(transport, url, headers, payload, method, *, provider, kind):
    meter = _meter.get()
    if meter is None:
        return transport(url, headers, payload, method)
    if meter.planning_budget is not None:
        meter.limit_planning_request(payload)
    attempt = {
        "stage": _stage.get(), "kind": kind, "provider": provider, "model": payload["model"],
        "requestedModels": payload.get("models") or [payload["model"]],
        "status": "started", "tokens": None, "costUsd": None,
    }
    meter.attempts.append(attempt)
    meter.persist()
    response = transport(url, headers, payload, method)
    usage = response.get("usage") if isinstance(response, dict) else None
    attempt["status"] = "received"
    if isinstance(usage, dict):
        details = usage.get("completion_tokens_details")
        attempt["tokens"] = {
            "input": _token_count(usage.get("prompt_tokens")),
            "output": _token_count(usage.get("completion_tokens")),
            "total": _token_count(usage.get("total_tokens")),
            "reasoning": _token_count(details.get("reasoning_tokens")) if isinstance(details, dict) else None,
        }
        cost = usage.get("cost")
        if type(cost) in (int, float) and isfinite(cost) and cost >= 0:
            attempt["costUsd"] = cost
    if isinstance(response, dict) and isinstance(response.get("model"), str):
        attempt["model"] = response["model"]
    meter.persist()
    meter.check_planning_tokens()
    return response


def _token_count(value):
    return value if type(value) is int and value >= 0 else None
