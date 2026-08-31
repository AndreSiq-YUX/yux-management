import pytest

from yux_agent_runtime.mission_learning import build_mission_learning_recommendation


def request(**changes):
    value = {
        "organization_id": "org-1",
        "mission_id": "mission-1",
        "pack_key": "campaign_launch",
        "terminal_status": "succeeded",
        "outcome_summary": {
            "evaluationDecisions": ["continue"],
            "approvalStatuses": ["approved"],
            "economics": {"actualCostBrl": "30"},
        },
        "evidence_ids": ["evaluation-2", "evaluation-1", "evaluation-1"],
    }
    value.update(changes)
    return value


def test_builds_deterministic_review_only_recommendation():
    first = build_mission_learning_recommendation(request())
    second = build_mission_learning_recommendation(request())
    assert first == second
    assert first["recommendationType"] == "knowledge_candidate"
    assert first["evidenceIds"] == ["evaluation-1", "evaluation-2"]
    assert len(first["recommendationHash"]) == 64
    assert "tools" not in first


def test_routes_failures_rejections_and_pauses_to_reviewable_change_types():
    failed = build_mission_learning_recommendation(request(terminal_status="failed"))
    rejected = build_mission_learning_recommendation(request(outcome_summary={"approvalStatuses": ["rejected"]}))
    paused = build_mission_learning_recommendation(request(outcome_summary={"evaluationDecisions": ["pause"]}))
    assert failed["recommendationType"] == "pack_change"
    assert rejected["recommendationType"] == "prompt_change"
    assert paused["recommendationType"] == "policy_change"


def test_rejects_raw_conversations_hidden_prompts_and_credentials():
    for forbidden in ("conversation", "messages", "hidden_prompt", "secret", "token", "credential"):
        with pytest.raises(ValueError, match="mission_learning_raw_content_forbidden"):
            build_mission_learning_recommendation(request(outcome_summary={forbidden: "do not store"}))
