from __future__ import annotations

from yux_agent_runtime.planning_budget import (
    PlanningBudget,
    PlanningEstimate,
    PlanningUsage,
    reserve_planning_call,
    should_run_specialist,
)
from yux_agent_runtime.mission import plan_mission


def test_exact_boundary_and_each_ceiling() -> None:
    budget = PlanningBudget(max_calls=3, max_input_tokens=10_000, max_output_tokens=2_000, max_cost_brl="5", max_latency_ms=30_000)
    usage = PlanningUsage(calls=1, input_tokens=2_000, output_tokens=500, cost_brl="1", latency_ms=5_000)
    exact = PlanningEstimate(calls=2, input_tokens=8_000, output_tokens=1_500, cost_brl="4", latency_ms=25_000)
    assert reserve_planning_call(budget, usage, exact).allowed is True
    assert reserve_planning_call(budget, usage, PlanningEstimate(calls=3)).reason == "planning_budget_calls_exhausted"
    assert reserve_planning_call(budget, usage, PlanningEstimate(input_tokens=8_001)).reason == "planning_budget_input_tokens_exhausted"
    assert reserve_planning_call(budget, usage, PlanningEstimate(output_tokens=1_501)).reason == "planning_budget_output_tokens_exhausted"
    assert reserve_planning_call(budget, usage, PlanningEstimate(cost_brl="4.01")).reason == "planning_budget_cost_brl_exhausted"
    assert reserve_planning_call(budget, usage, PlanningEstimate(latency_ms=25_001)).reason == "planning_budget_latency_ms_exhausted"


def test_deterministic_specialist_skip() -> None:
    predicate = {"field": "channels", "includes": "email"}
    assert should_run_specialist(predicate, {"channels": ["human_task"]}, artifact_valid=False) is False
    assert should_run_specialist(predicate, {"channels": ["email"]}, artifact_valid=True) is False
    assert should_run_specialist(predicate, {"channels": ["email"]}, artifact_valid=False) is True


def test_exhausted_cycle_returns_human_review_without_planning_steps() -> None:
    result = plan_mission({
        "mission": {"id": "mission-1"}, "action_pack": {},
        "planning_budget": {
            "budget": {"maxCalls": 1, "maxInputTokens": 100, "maxOutputTokens": 50, "maxCostBrl": "1", "maxLatencyMs": 1000},
            "usage": {"calls": 1, "inputTokens": 100, "outputTokens": 50, "costBrl": "1", "latencyMs": 1000},
            "estimate": {"calls": 1, "inputTokens": 1, "outputTokens": 1, "costBrl": "0.01", "latencyMs": 1},
        },
    })
    assert result["outcome"] == "planning_budget_exhausted"
    assert result["recommendation"] == "human_review"
    assert result["trace"]["steps"] == []
