from __future__ import annotations

from dataclasses import dataclass
from typing import Any


AUTONOMY_PRIORITY = {
    "blocked": 6,
    "handoff": 5,
    "approval_required": 4,
    "suggestion": 3,
    "draft": 2,
    "auto_send": 1,
}


SENSITIVE_ACTIONS = {
    "promise_discount",
    "promise_discount_without_approved_offer",
    "change_proposal_terms_without_approval",
    "send_contractual_commitment",
    "activate_campaign",
    "change_ads_budget",
    "client_visible_recommendation",
    "offer_change",
}


def _value(record: dict[str, Any], key: str) -> str | None:
    value = record.get(key)
    return str(value) if value not in (None, "") else None


def _matches(policy: dict[str, Any], context: dict[str, Any]) -> bool:
    for key in ("organization_id", "client_id", "contract_id", "assistant_id", "profile_key", "channel", "intent_key", "stage_key", "action_key"):
        expected = _value(policy, key)
        if expected is not None and expected != _value(context, key):
            return False
    return policy.get("status", "active") == "active"


def _specificity(policy: dict[str, Any]) -> int:
    return sum(1 for key in ("organization_id", "client_id", "contract_id", "assistant_id", "profile_key", "channel", "intent_key", "stage_key", "action_key") if _value(policy, key) is not None)


@dataclass(frozen=True)
class AutonomyDecision:
    autonomy_mode: str
    risk_level: str
    requires_approval: bool
    should_send: bool
    should_handoff: bool
    blocked: bool
    policy_id: str | None
    reason: str
    confidence_threshold: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "autonomy_mode": self.autonomy_mode,
            "risk_level": self.risk_level,
            "requires_approval": self.requires_approval,
            "should_send": self.should_send,
            "should_handoff": self.should_handoff,
            "blocked": self.blocked,
            "policy_id": self.policy_id,
            "reason": self.reason,
            "confidence_threshold": self.confidence_threshold,
        }


def resolve_autonomy_policy(
    policies: list[dict[str, Any]],
    context: dict[str, Any],
    *,
    confidence: float = 0,
    default_mode: str = "suggestion",
) -> AutonomyDecision:
    action_key = _value(context, "action_key") or ""
    matching = [policy for policy in policies if _matches(policy, context)]
    matching.sort(key=lambda policy: (_specificity(policy), AUTONOMY_PRIORITY.get(policy.get("autonomy_mode", ""), 0)), reverse=True)
    policy = matching[0] if matching else None
    mode = str(policy.get("autonomy_mode") if policy else default_mode)
    risk_level = str(policy.get("risk_level") if policy else ("high" if action_key in SENSITIVE_ACTIONS else "medium"))
    threshold = float(policy.get("confidence_threshold") if policy and policy.get("confidence_threshold") is not None else 0.75)

    reason = "matched_policy" if policy else "default_policy"
    if action_key in SENSITIVE_ACTIONS and mode == "auto_send":
        mode = "approval_required"
        reason = "sensitive_action_forces_approval"
    if confidence and confidence < threshold and mode == "auto_send":
        mode = "suggestion"
        reason = "confidence_below_threshold"

    return AutonomyDecision(
        autonomy_mode=mode,
        risk_level=risk_level,
        requires_approval=mode in ("approval_required", "suggestion", "draft"),
        should_send=mode == "auto_send",
        should_handoff=mode == "handoff",
        blocked=mode == "blocked",
        policy_id=str(policy.get("id")) if policy and policy.get("id") else None,
        reason=reason,
        confidence_threshold=threshold,
    )
