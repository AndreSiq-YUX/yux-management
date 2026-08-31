from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


RecommendationType = Literal["pack_change", "prompt_change", "policy_change", "knowledge_candidate"]


class MissionLearningInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_id: str = Field(min_length=1)
    mission_id: str = Field(min_length=1)
    pack_key: str = Field(min_length=1, max_length=120)
    terminal_status: Literal["succeeded", "failed", "expired", "cancelled"]
    outcome_summary: dict[str, Any]
    evidence_ids: list[str] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def excludes_untrusted_raw_content(self) -> "MissionLearningInput":
        forbidden = {"conversation", "messages", "hidden_prompt", "system_prompt", "secret", "token", "credential"}

        def walk(value: Any) -> None:
            if isinstance(value, dict):
                for key, item in value.items():
                    if str(key).lower() in forbidden:
                        raise ValueError("mission_learning_raw_content_forbidden")
                    walk(item)
            elif isinstance(value, list):
                for item in value:
                    walk(item)

        walk(self.outcome_summary)
        return self


class LearningRecommendationArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommendationType: RecommendationType
    targetKey: str = Field(min_length=1, max_length=160)
    rationale: str = Field(min_length=1, max_length=2000)
    evidenceIds: list[str] = Field(default_factory=list, max_length=500)
    expectedImpact: dict[str, str]
    recommendationHash: str = Field(pattern=r"^[a-f0-9]{64}$")


def build_mission_learning_recommendation(value: MissionLearningInput | dict[str, Any]) -> dict[str, Any]:
    """Produce a review-only recommendation with no tools or mutation contract."""
    request = value if isinstance(value, MissionLearningInput) else MissionLearningInput.model_validate(value)
    decisions = _strings(request.outcome_summary.get("evaluationDecisions"))
    approvals = _strings(request.outcome_summary.get("approvalStatuses"))

    recommendation_type: RecommendationType = "knowledge_candidate"
    rationale = "Preservar o padrão de resultado como memória operacional revisável."
    impact = {"consistency": "increase", "planningLatency": "decrease"}
    if request.terminal_status == "failed" or "replan" in decisions:
        recommendation_type = "pack_change"
        rationale = "Revisar a topologia ou os limites do pack antes de uma nova versão."
        impact = {"invalidPlans": "decrease", "completionRate": "increase"}
    elif any(item in {"rejected", "changes_requested"} for item in approvals):
        recommendation_type = "prompt_change"
        rationale = "Testar instruções candidatas em shadow porque houve rejeição humana."
        impact = {"rejectionRate": "decrease", "humanIntervention": "decrease"}
    elif "pause" in decisions:
        recommendation_type = "policy_change"
        rationale = "Revisar o guardrail que causou contenção sem alterar a política automaticamente."
        impact = {"incidents": "decrease", "safeCompletionRate": "increase"}

    evidence_ids = sorted(set(request.evidence_ids))
    content = {
        "recommendationType": recommendation_type,
        "targetKey": request.pack_key,
        "rationale": rationale,
        "evidenceIds": evidence_ids,
        "expectedImpact": impact,
    }
    recommendation_hash = hashlib.sha256(
        json.dumps(
            {"organizationId": request.organization_id, "missionId": request.mission_id, **content},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()
    return LearningRecommendationArtifact(**content, recommendationHash=recommendation_hash).model_dump()


def _strings(value: Any) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []
