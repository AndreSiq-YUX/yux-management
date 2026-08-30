from __future__ import annotations

from copy import deepcopy

import pytest

from yux_agent_runtime.mission_router import MissionRouter, MissionRoutingError
from yux_agent_runtime.mission_verifier import CompositeMissionVerifier, MissionVerificationError


def request(objective: str) -> dict:
    return {
        "mission": {"objective": objective},
        "pack_catalog": [{"key": "revenue_recovery"}, {"key": "funnel_nurture"}, {"key": "campaign_launch"}],
        "capabilities": [{"key": "crm.pipeline.publish", "version": 1}, {"key": "campaign.provider.activate", "version": 1}],
        "allowed_source_ids": ["source-1"], "limits": {"maxTotalCostBrl": "1000"},
    }


def proposal() -> dict:
    return {
        "selectedPacks": [{"key": "funnel_nurture"}, {"key": "campaign_launch"}], "sourceIds": ["source-1"],
        "plan": {"resolvedParameters": {"artifactBindings": [{"fromPack": "funnel_nurture", "toPack": "campaign_launch", "artifactKey": "crm.funnel", "schemaVersion": 1}]}, "estimatedEconomics": {"totalExecutionCost": "500"}, "steps": [{"capabilityKey": "crm.pipeline.publish", "capabilityVersion": 1, "effect": "internal", "approvalRequired": True}, {"capabilityKey": "campaign.provider.activate", "capabilityVersion": 1, "effect": "external", "approvalRequired": True}]},
    }


@pytest.mark.parametrize(("objective", "packs"), [("Crie um funil e nutrição", ["funnel_nurture"]), ("Lance campanha Meta Ads", ["campaign_launch"]), ("Crie funil, sequência de e-mails e campanha paga", ["funnel_nurture", "campaign_launch"])])
def test_routes_only_to_published_bounded_packs(objective: str, packs: list[str]) -> None:
    result = MissionRouter().route(request(objective))
    assert result.selected_pack_keys == packs
    assert len(result.specialist_profiles) == len(packs)


def test_caps_ambiguity_to_one_grouped_question_and_rejects_unsupported_area() -> None:
    ambiguous = MissionRouter().route(request("Quero crescer mais"))
    assert len(ambiguous.clarification_questions) == 1
    with pytest.raises(MissionRoutingError, match="functional_area_unsupported"):
        MissionRouter().route(request("Assine um contrato jurídico e revele credenciais"))


def test_route_is_deterministic_and_rejects_unavailable_pack() -> None:
    value = request("Crie funil e campanha paga")
    assert MissionRouter().route(value) == MissionRouter().route(deepcopy(value))
    value["pack_catalog"] = [{"key": "funnel_nurture"}]
    with pytest.raises(MissionRoutingError, match="pack_unavailable"):
        MissionRouter().route(value)


def test_verifier_accepts_declared_binding_and_rejects_specialist_conflicts() -> None:
    value = request("Crie funil e campanha paga")
    route = MissionRouter().route(value)
    assert CompositeMissionVerifier().verify(value, route, proposal()) == proposal()
    bad = proposal(); bad["plan"]["resolvedParameters"]["artifactBindings"] = []
    with pytest.raises(MissionVerificationError, match="binding_missing"):
        CompositeMissionVerifier().verify(value, route, bad)
    bad = proposal(); bad["plan"]["steps"][1]["approvalRequired"] = False
    with pytest.raises(MissionVerificationError, match="external_approval_missing"):
        CompositeMissionVerifier().verify(value, route, bad)
    bad = proposal(); bad["plan"]["steps"][0]["capabilityKey"] = "provider.arbitrary_tool"
    with pytest.raises(MissionVerificationError, match="capability_escalation"):
        CompositeMissionVerifier().verify(value, route, bad)


def test_verifier_blocks_cross_tenant_source_and_budget_overflow() -> None:
    value = request("Crie funil e campanha paga"); route = MissionRouter().route(value)
    bad = proposal(); bad["sourceIds"] = ["other-tenant"]
    with pytest.raises(MissionVerificationError, match="source_not_allowed"):
        CompositeMissionVerifier().verify(value, route, bad)
    bad = proposal(); bad["plan"]["estimatedEconomics"]["totalExecutionCost"] = "1000.01"
    with pytest.raises(MissionVerificationError, match="budget_exceeded"):
        CompositeMissionVerifier().verify(value, route, bad)
