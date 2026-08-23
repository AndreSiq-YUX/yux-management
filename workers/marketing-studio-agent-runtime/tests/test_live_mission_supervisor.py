from __future__ import annotations

import os
from hashlib import sha256

import pytest

from yux_agent_runtime.mission_supervisor import MissionSupervisor
from yux_agent_runtime.model_profiles import ModelProfile
from yux_agent_runtime.providers import OpenRouterClient


@pytest.mark.skipif(os.getenv("RUN_LIVE_MISSION_SUPERVISOR") != "1", reason="live provider acceptance is opt-in")
def test_live_supervisor_returns_a_catalog_and_source_bound_proposal() -> None:
    profile = ModelProfile(
        key="mission_supervisor", version=1, provider="openrouter",
        model=os.getenv("OPENROUTER_MISSION_SUPERVISOR_MODEL", "openai/gpt-4.1-mini"),
        temperature=0, max_tokens=2400, timeout_seconds=60, max_cost_brl="5",
        prompt_bundle_hash=sha256(b"yux-mission-supervisor-v1").hexdigest(),
    )
    supervisor = MissionSupervisor(OpenRouterClient.from_env(), profile)
    pack = {
        "key": "foundation_shadow", "semanticVersion": "1.0.0", "contentHash": "a" * 64,
        "protectedStepKeys": ["pack.collect_metrics_and_costs", "pack.evaluate"], "topologyTemplate": {"steps": []},
    }
    result = supervisor.propose({
        "organization_id": "live-acceptance-tenant", "mission": {
            "id": "live-foundation-mission", "objective": "Simule a criação de um funil comercial e faça perguntas se faltar contexto.",
            "parameters": {}, "budget": {"maxTotalCostBrl": "50"},
        },
        "action_pack": pack, "pack_catalog": [pack], "readiness": {"ready": True}, "baseline": {},
        "capabilities": [
            {"key": "mission.metrics.collect", "version": 1, "effect": "none"},
            {"key": "mission.evaluate", "version": 1, "effect": "none"},
        ],
        "strategy_context": {"items": [{"id": "source-live-1", "content": "Contexto de teste publicado."}]},
        "allowed_source_ids": ["source-live-1"], "context_snapshot_id": "snapshot-live-1",
    })
    assert result["kind"] in ("clarification", "plan")
    assert set(result["sourceIds"]).issubset({"source-live-1"})
    assert result["trace"]["profileKey"] == "mission_supervisor"

