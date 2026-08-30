from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AgentContractError(ValueError):
    """Raised when a provider response cannot be trusted as a workflow result."""


class StrictArtifactModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FunnelStageArtifact(StrictArtifactModel):
    key: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=120)
    exitCriteria: list[str] = Field(default_factory=list, max_length=20)
    isWon: bool = False
    isLost: bool = False

    @model_validator(mode="after")
    def outcome_is_coherent(self) -> "FunnelStageArtifact":
        if self.isWon and self.isLost:
            raise ValueError("funnel_stage_outcome_invalid")
        return self


class FunnelArtifact(StrictArtifactModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    stages: list[FunnelStageArtifact] = Field(min_length=2, max_length=20)
    reuseExistingFunnelId: str | None = None

    @model_validator(mode="after")
    def stages_are_coherent(self) -> "FunnelArtifact":
        keys = [stage.key for stage in self.stages]
        if len(keys) != len(set(keys)):
            raise ValueError("funnel_stage_key_duplicate")
        if sum(stage.isWon for stage in self.stages) > 1 or sum(stage.isLost for stage in self.stages) > 1:
            raise ValueError("funnel_stage_outcome_duplicate")
        return self


class NurtureEmailArtifact(StrictArtifactModel):
    key: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=160)
    subject: str = Field(min_length=1, max_length=240)
    previewText: str = Field(min_length=1, max_length=300)
    bodyHtml: str = Field(min_length=1)
    bodyText: str = Field(min_length=1)
    sourceIds: list[str] = Field(min_length=1, max_length=100)
    complianceNotes: list[str] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def includes_unsubscribe_intent(self) -> "NurtureEmailArtifact":
        if "{{unsubscribe_url}}" not in self.bodyHtml or "{{unsubscribe_url}}" not in self.bodyText:
            raise ValueError("nurture_email_unsubscribe_required")
        return self


class SequenceStepArtifact(StrictArtifactModel):
    emailKey: str = Field(min_length=1)
    delayMinutes: int = Field(ge=0, le=525_600)
    exitConditions: list[str] = Field(default_factory=list, max_length=20)


class SequenceArtifact(StrictArtifactModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    conversionGoal: str = Field(default="", max_length=500)
    steps: list[SequenceStepArtifact] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def delays_are_ordered(self) -> "SequenceArtifact":
        if any(index > 0 and step.delayMinutes == 0 for index, step in enumerate(self.steps)):
            raise ValueError("nurture_sequence_delay_invalid")
        if len({step.emailKey for step in self.steps}) != len(self.steps):
            raise ValueError("nurture_sequence_email_duplicate")
        return self


class AutomationArtifact(StrictArtifactModel):
    name: str = Field(min_length=1, max_length=160)
    trigger: dict[str, Any]
    eligibilityConditions: list[dict[str, Any]] = Field(default_factory=list, max_length=30)
    exitConditions: list[str] = Field(min_length=1, max_length=20)
    consentPolicy: str
    suppressionPolicy: str
    dailyRunLimit: int = Field(ge=1, le=10_000)

    @model_validator(mode="after")
    def policies_are_safe(self) -> "AutomationArtifact":
        trigger_type = str(self.trigger.get("type") or "")
        if trigger_type not in {"lead.created", "lead.stage_changed", "lead.field_changed"}:
            raise ValueError("automation_trigger_invalid")
        if self.consentPolicy != "require_granted" or self.suppressionPolicy != "check_before_enrollment":
            raise ValueError("automation_policy_invalid")
        return self


class BrandComplianceVerdict(StrictArtifactModel):
    approved: bool
    forbiddenTerms: list[str] = Field(default_factory=list, max_length=100)
    findings: list[str] = Field(default_factory=list, max_length=100)
    sourceIds: list[str] = Field(default_factory=list, max_length=100)


class FunnelNurtureArtifacts(StrictArtifactModel):
    funnel: FunnelArtifact
    emails: list[NurtureEmailArtifact] = Field(min_length=3, max_length=3)
    sequence: SequenceArtifact
    automation: AutomationArtifact
    brandCompliance: BrandComplianceVerdict
    sourceIds: list[str] = Field(min_length=1, max_length=200)
    risks: list[str] = Field(default_factory=list, max_length=100)


def validate_mission_plan(value: dict[str, Any], planning_input: dict[str, Any]) -> dict[str, Any]:
    """Validate a proposed plan without trusting the model/provider.

    This is an early quality boundary. The Fastify Action Engine recompiles and
    validates the same document before it can become executable.
    """
    if value.get("schemaVersion") != 1:
        raise AgentContractError("mission_plan_schema_version_invalid")
    if value.get("missionId") != planning_input.get("mission", {}).get("id"):
        raise AgentContractError("mission_plan_mission_mismatch")

    requested_pack = planning_input.get("action_pack") or {}
    proposed_pack = value.get("actionPack") or {}
    for proposed_key, requested_key in (("key", "key"), ("version", "semanticVersion"), ("templateHash", "contentHash")):
        if proposed_pack.get(proposed_key) != requested_pack.get(requested_key):
            raise AgentContractError("mission_plan_pack_mismatch")

    capabilities = {
        (str(item.get("key")), int(item.get("version", 0)))
        for item in planning_input.get("capabilities") or []
        if isinstance(item, dict)
    }
    steps = value.get("steps")
    if not isinstance(steps, list) or not steps:
        raise AgentContractError("mission_plan_steps_required")
    keys = [str(step.get("stepKey") or "") for step in steps if isinstance(step, dict)]
    if len(keys) != len(steps) or any(not key for key in keys) or len(set(keys)) != len(keys):
        raise AgentContractError("mission_plan_step_key_invalid")

    protected = requested_pack.get("protectedStepKeys") or []
    for protected_key in protected:
        if protected_key not in keys:
            raise AgentContractError("mission_plan_protected_step_missing")
    if "pack.collect_metrics_and_costs" not in keys or "pack.evaluate" not in keys:
        raise AgentContractError("mission_plan_economics_checkpoint_missing")

    dependency_graph: dict[str, list[str]] = {}
    for step in steps:
        capability_key = str(step.get("capabilityKey") or "")
        capability_version = int(step.get("capabilityVersion") or 0)
        if (capability_key, capability_version) not in capabilities:
            raise AgentContractError("mission_plan_capability_not_allowed")
        dependencies = step.get("dependsOn") or []
        if not isinstance(dependencies, list) or any(str(item) not in keys for item in dependencies):
            raise AgentContractError("mission_plan_dependency_missing")
        dependency_graph[str(step["stepKey"])] = [str(item) for item in dependencies]
        timeout = step.get("timeoutSeconds")
        attempts = step.get("maxAttempts")
        if not isinstance(timeout, int) or timeout < 1 or timeout > 86400:
            raise AgentContractError("mission_plan_timeout_invalid")
        if not isinstance(attempts, int) or attempts < 1 or attempts > 5:
            raise AgentContractError("mission_plan_attempts_invalid")
        if step.get("effect") == "external" and step.get("approvalRequired") is not True:
            raise AgentContractError("mission_plan_external_approval_required")

    _assert_acyclic(dependency_graph)
    economics = value.get("estimatedEconomics")
    if not isinstance(economics, dict) or economics.get("currency") != "BRL" or "totalExecutionCost" not in economics:
        raise AgentContractError("mission_plan_economics_invalid")
    return value


def _assert_acyclic(graph: dict[str, list[str]]) -> None:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> None:
        if node in visiting:
            raise AgentContractError("mission_plan_cycle_detected")
        if node in visited:
            return
        visiting.add(node)
        for dependency in graph.get(node, []):
            visit(dependency)
        visiting.remove(node)
        visited.add(node)

    for key in graph:
        visit(key)


def parse_json_object(content: str) -> dict[str, Any]:
    text = str(content or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        raise AgentContractError("agent_output_invalid_json") from error
    if not isinstance(value, dict):
        raise AgentContractError("agent_output_object_required")
    return value


def validate_subagent_output(value: dict[str, Any]) -> dict[str, Any]:
    analysis = value.get("analysis")
    actions = value.get("recommended_actions")
    if not isinstance(analysis, str) or not analysis.strip():
        raise AgentContractError("subagent_analysis_required")
    if not isinstance(actions, list) or not all(isinstance(item, str) and item.strip() for item in actions):
        raise AgentContractError("subagent_actions_required")
    return {"analysis": analysis.strip(), "recommended_actions": actions[:8]}


def validate_radar_output(value: dict[str, Any], allowed_evidence_ids: set[str]) -> dict[str, Any]:
    required_objects = ("source", "score", "message", "policyDecision")
    if not isinstance(value.get("summary"), str) or not value["summary"].strip():
        raise AgentContractError("radar_summary_required")
    for key in required_objects:
        if not isinstance(value.get(key), dict):
            raise AgentContractError(f"radar_{key}_required")
    for key in ("evidence", "pain_hypotheses", "risk_flags"):
        if not isinstance(value.get(key), list):
            raise AgentContractError(f"radar_{key}_required")

    score = value["score"]
    for key in (
        "total_score", "fit_score", "timing_score", "pain_score",
        "contactability_score", "budget_score", "personalization_score",
    ):
        score[key] = _clamp_integer(score.get(key), f"radar_{key}_invalid", 0, 100)
    if not isinstance(score.get("explanation"), str) or not score["explanation"].strip():
        raise AgentContractError("radar_score_explanation_required")

    message = value["message"]
    if message.get("channel") not in ("email", "linkedin", "phone", "whatsapp_manual", "task"):
        raise AgentContractError("radar_message_channel_invalid")
    if not isinstance(message.get("body"), str) or not message["body"].strip():
        raise AgentContractError("radar_message_body_required")
    evidence_used = message.get("evidence_used") or []
    if not isinstance(evidence_used, list):
        raise AgentContractError("radar_message_evidence_invalid")
    unknown = [str(item) for item in evidence_used if allowed_evidence_ids and str(item) not in allowed_evidence_ids]
    if unknown:
        raise AgentContractError("radar_message_unknown_evidence")

    policy = value["policyDecision"]
    # The first Radar contact is never auto-sent, regardless of provider output.
    policy["canSendAutomatically"] = False
    policy["status"] = "blocked" if policy.get("blockedReasons") else "requires_human_approval"
    policy["canConvertToLead"] = bool(policy.get("canConvertToLead", True)) and policy["status"] != "blocked"
    policy["blockedReasons"] = [str(item) for item in (policy.get("blockedReasons") or [])]
    policy["requiredReviewFields"] = ["message", "evidence", "risk_flags"]
    return value


def validate_conversation_output(value: dict[str, Any]) -> dict[str, Any]:
    reply = value.get("reply")
    classification = value.get("classification")
    qualification = value.get("qualification")
    if not isinstance(reply, dict) or not isinstance(reply.get("body"), str) or not reply["body"].strip():
        raise AgentContractError("conversation_reply_required")
    reply["language"] = "pt-BR"
    if not isinstance(classification, dict):
        raise AgentContractError("conversation_classification_required")
    if classification.get("sentiment") not in ("positive", "neutral", "negative", "unknown"):
        classification["sentiment"] = "unknown"
    if classification.get("urgency") not in ("high", "medium", "low", "none"):
        classification["urgency"] = "none"
    classification["confidence"] = _clamp_float(classification.get("confidence"), "conversation_confidence_invalid", 0, 1)
    for key in ("intent", "stage"):
        if not isinstance(classification.get(key), str) or not classification[key].strip():
            raise AgentContractError(f"conversation_{key}_required")
    if not isinstance(qualification, dict):
        raise AgentContractError("conversation_qualification_required")
    qualification["fitScoreDelta"] = _clamp_integer(qualification.get("fitScoreDelta", 0), "fit_delta_invalid", -100, 100)
    qualification["intentScoreDelta"] = _clamp_integer(qualification.get("intentScoreDelta", 0), "intent_delta_invalid", -100, 100)
    qualification["objections"] = [str(item) for item in (qualification.get("objections") or [])][:10]
    if not isinstance(qualification.get("nextBestAction"), str):
        raise AgentContractError("conversation_next_action_required")
    return value


def evidence_ids(retrieval_context: dict[str, Any] | None) -> set[str]:
    ids: set[str] = set()
    for key in ("cards", "chunks", "assets"):
        for item in (retrieval_context or {}).get(key) or []:
            if isinstance(item, dict) and item.get("id"):
                ids.add(str(item["id"]))
    return ids


def _clamp_integer(value: Any, error: str, minimum: int, maximum: int) -> int:
    try:
        number = round(float(value))
    except (TypeError, ValueError) as cause:
        raise AgentContractError(error) from cause
    return max(minimum, min(maximum, number))


def _clamp_float(value: Any, error: str, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as cause:
        raise AgentContractError(error) from cause
    return max(minimum, min(maximum, number))
