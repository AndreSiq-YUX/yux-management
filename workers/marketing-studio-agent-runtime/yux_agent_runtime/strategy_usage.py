from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from math import isfinite
from typing import Any, Callable


_meter: ContextVar[StrategyUsage | None] = ContextVar("strategy_usage", default=None)
_stage: ContextVar[str] = ContextVar("strategy_usage_stage", default="retrieval")


@dataclass
class StrategyUsage:
    record: Callable[[list[dict[str, Any]]], None] | None = None
    attempts: list[dict[str, Any]] = field(default_factory=list)

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

    def total_cost_usd(self):
        costs = [attempt["costUsd"] for attempt in self.attempts]
        return sum(costs) if costs and all(cost is not None for cost in costs) else None


@contextmanager
def strategy_usage_stage(stage: str):
    token = _stage.set(stage)
    try:
        yield
    finally:
        _stage.reset(token)


def strategy_metered_transport(transport, url, headers, payload, method, *, provider):
    meter = _meter.get()
    if meter is None:
        return transport(url, headers, payload, method)
    attempt = {
        "stage": _stage.get(), "provider": provider, "model": payload["model"],
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
    return response


def _token_count(value):
    return value if type(value) is int and value >= 0 else None
