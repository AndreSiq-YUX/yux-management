from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any


class StrategyActionBlocked(Exception):
    """Raised when a strategy profile is not allowed to execute an action."""


RECOMMENDATION_REQUIRED_FIELDS = [
    "objective",
    "audience",
    "stage",
    "action",
    "channel",
    "owner",
    "metric",
    "next_step",
    "confidence",
    "requires_approval",
    "supporting_cards",
]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _first(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if value is None:
        return []
    return [value]


def _string_list(value: Any) -> list[str]:
    return [str(item) for item in _as_list(value) if str(item).strip()]


def _is_internal_source(item: dict[str, Any]) -> bool:
    return item.get("visibility") == "internal_only" or item.get("source_scope") == "internal" or item.get("sourceScope") == "internal"


def _compact_card(card: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": card.get("id"),
        "concept": card.get("concept") or card.get("title"),
        "category": card.get("category"),
        "visibility": card.get("visibility"),
        "source_scope": card.get("source_scope") or card.get("sourceScope"),
        "problem_solved": card.get("problem_solved") or card.get("problemSolved"),
        "decision_rules": _string_list(card.get("decision_rules") or card.get("decisionRules")),
        "recommended_actions": _string_list(card.get("recommended_actions") or card.get("recommendedActions")),
    }


def _compact_chunk(chunk: dict[str, Any], allow_internal_sources: bool) -> dict[str, Any] | None:
    if _is_internal_source(chunk) and not allow_internal_sources:
        return None
    return {
        "id": chunk.get("id"),
        "section_key": chunk.get("section_key") or chunk.get("sectionKey"),
        "visibility": chunk.get("visibility"),
        "source_scope": chunk.get("source_scope") or chunk.get("sourceScope"),
        "chunk_text": chunk.get("chunk_text") or chunk.get("chunkText") or "",
    }


def _compact_asset(asset: dict[str, Any], allow_internal_sources: bool) -> dict[str, Any] | None:
    if _is_internal_source(asset) and not allow_internal_sources:
        return None
    return {
        "id": asset.get("id"),
        "asset_type": asset.get("asset_type") or asset.get("assetType"),
        "visibility": asset.get("visibility"),
        "source_scope": asset.get("source_scope") or asset.get("sourceScope"),
        "storage_path": asset.get("storage_path") or asset.get("storagePath"),
    }


def _stable_hash(payload: dict[str, Any]) -> str:
    return sha256(repr(_sort_nested(payload)).encode("utf-8")).hexdigest()


def _sort_nested(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _sort_nested(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_sort_nested(item) for item in value]
    return value


def _profile_key(profile: dict[str, Any] | None) -> str:
    if not profile:
        return ""
    return str(_first(profile.get("profile_key"), profile.get("profileKey"), profile.get("key")) or "")


def _profile_id(profile: dict[str, Any] | None) -> str | None:
    if not profile:
        return None
    value = _first(profile.get("id"), profile.get("profile_id"), profile.get("profileId"))
    return str(value) if value else None


def _profile_by_key(profiles: list[dict[str, Any]], profile_key: str | None) -> dict[str, Any] | None:
    if not profile_key:
        return None
    return next((profile for profile in profiles if _profile_key(profile) == profile_key), None)


def _direct_profile_key(agent_or_assistant: dict[str, Any]) -> str | None:
    direct = _first(
        agent_or_assistant.get("strategy_profile_key"),
        agent_or_assistant.get("strategyProfileKey"),
        agent_or_assistant.get("profile_key"),
        agent_or_assistant.get("profileKey"),
    )
    if direct:
        return str(direct)

    profile = agent_or_assistant.get("strategy_profile") or agent_or_assistant.get("strategyProfile")
    if isinstance(profile, dict):
        return _profile_key(profile)
    return None


def _binding_matches(agent_or_assistant: dict[str, Any], binding: dict[str, Any]) -> bool:
    if binding.get("status", "active") != "active":
        return False

    binding_type = str(binding.get("binding_type") or binding.get("bindingType") or "")
    binding_key = str(binding.get("binding_key") or binding.get("bindingKey") or "")
    candidates = {
        "marketing_agent_type": agent_or_assistant.get("agent_type") or agent_or_assistant.get("agentType"),
        "agent_type": agent_or_assistant.get("agent_type") or agent_or_assistant.get("agentType"),
        "assistant_role": agent_or_assistant.get("assistant_role") or agent_or_assistant.get("assistantRole"),
        "assistant_id": agent_or_assistant.get("id") or agent_or_assistant.get("assistant_id") or agent_or_assistant.get("assistantId"),
        "agent_id": agent_or_assistant.get("id") or agent_or_assistant.get("agent_id") or agent_or_assistant.get("agentId"),
    }
    return bool(binding_key and str(candidates.get(binding_type) or "") == binding_key)


def select_strategy_profile(
    agent_or_assistant: dict[str, Any],
    bindings: list[dict[str, Any]],
    profiles: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Select the strategy profile for an agent or conversational assistant."""

    available_profiles = profiles or []
    direct_key = _direct_profile_key(agent_or_assistant)
    direct_profile = _profile_by_key(available_profiles, direct_key)
    if direct_profile:
        return direct_profile
    if direct_key:
        return {"profile_key": direct_key}

    matched_binding = next((binding for binding in bindings if _binding_matches(agent_or_assistant, binding)), None)
    if matched_binding:
        binding_profile_key = _first(matched_binding.get("profile_key"), matched_binding.get("profileKey"))
        bound_profile = _profile_by_key(available_profiles, str(binding_profile_key) if binding_profile_key else None)
        if bound_profile:
            return bound_profile
        if binding_profile_key:
            return {"profile_key": str(binding_profile_key), "binding": matched_binding}

    raise ValueError("strategy_profile_not_found")


def select_skill_pack(profile: dict[str, Any], skills: list[dict[str, Any]]) -> dict[str, Any]:
    """Return a compact, priority-ordered skill pack for a strategy profile."""

    profile_key = _profile_key(profile)
    normalized_skills = []
    for skill in skills:
        sections = sorted(
            [dict(section) for section in _as_list(skill.get("sections") or skill.get("skill_sections") or skill.get("skillSections")) if isinstance(section, dict)],
            key=lambda item: int(item.get("priority") or item.get("sort_order") or 0),
        )
        normalized = {
            **skill,
            "skill_key": _first(skill.get("skill_key"), skill.get("skillKey"), skill.get("key")),
            "priority": int(skill.get("priority") or skill.get("sort_order") or 0),
            "sections": sections,
        }
        normalized_skills.append(normalized)

    normalized_skills.sort(key=lambda item: (int(item.get("priority") or 0), str(item.get("skill_key") or "")))
    rules = []
    for skill in normalized_skills:
        for section in skill["sections"]:
            content = _first(section.get("content"), section.get("rule"), section.get("body"), section.get("title"))
            if content:
                rules.append(str(content))

    return {
        "profile_key": profile_key,
        "profile_id": _profile_id(profile),
        "skills": normalized_skills,
        "rules": rules,
        "context_policy": profile.get("default_context_policy") or profile.get("defaultContextPolicy") or {},
    }


def enforce_profile_action_policy(profile: dict[str, Any], action_key: str) -> dict[str, Any]:
    """Validate a requested action against profile-level guardrails."""

    clean_action = str(action_key or "").strip()
    if not clean_action:
        raise ValueError("action_key_required")

    profile_key = _profile_key(profile)
    forbidden = set(_string_list(_first(profile.get("forbidden_actions"), profile.get("forbiddenActions"))))
    approval_required = set(_string_list(_first(profile.get("requires_human_approval_for"), profile.get("requiresHumanApprovalFor"))))
    allowed = set(_string_list(_first(profile.get("allowed_actions"), profile.get("allowedActions"))))

    if clean_action in forbidden:
        raise StrategyActionBlocked(f"{profile_key}:{clean_action}:forbidden")

    if clean_action in approval_required:
        return {
            "status": "approval_required",
            "profile_key": profile_key,
            "action_key": clean_action,
            "requires_approval": True,
            "allowed": False,
        }

    if allowed and clean_action not in allowed:
        return {
            "status": "not_declared",
            "profile_key": profile_key,
            "action_key": clean_action,
            "requires_approval": True,
            "allowed": False,
        }

    return {
        "status": "allowed",
        "profile_key": profile_key,
        "action_key": clean_action,
        "requires_approval": False,
        "allowed": True,
    }


def build_agent_handoff(
    source_profile: dict[str, Any],
    target_profile: dict[str, Any],
    objective: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a structured handoff between strategy profiles."""

    clean_objective = str(objective or "").strip()
    if not _profile_key(source_profile):
        raise ValueError("source_profile_required")
    if not _profile_key(target_profile):
        raise ValueError("target_profile_required")
    if not clean_objective:
        raise ValueError("objective_required")

    data = payload or {}
    return {
        "source_profile_id": _profile_id(source_profile),
        "source_profile_key": _profile_key(source_profile),
        "target_profile_id": _profile_id(target_profile),
        "target_profile_key": _profile_key(target_profile),
        "objective": clean_objective,
        "reason": data.get("reason") or clean_objective,
        "requested_output": data.get("requested_output") or data.get("requestedOutput"),
        "related_module": data.get("related_module") or data.get("relatedModule"),
        "related_record_id": data.get("related_record_id") or data.get("relatedRecordId") or data.get("lead_id") or data.get("leadId"),
        "urgency": data.get("urgency") or "normal",
        "context_summary": data.get("context_summary") or data.get("contextSummary") or "",
        "allowed_tools": _string_list(data.get("allowed_tools") or data.get("allowedTools")),
        "due_at": data.get("due_at") or data.get("dueAt"),
        "status": data.get("status") or "pending",
        "payload": data,
        "created_at": _now_iso(),
    }


def _validate_recommendation(recommendation: dict[str, Any]) -> None:
    missing = [field for field in RECOMMENDATION_REQUIRED_FIELDS if field not in recommendation]
    if missing:
        raise ValueError(",".join(missing))

    if not isinstance(recommendation.get("supporting_cards"), list):
        raise ValueError("supporting_cards_must_be_list")

    confidence = recommendation.get("confidence")
    if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
        raise ValueError("confidence_must_be_between_0_and_1")


def build_recommendation_payload(profile: dict[str, Any], recommendation: dict[str, Any]) -> dict[str, Any]:
    """Build an auditable strategy recommendation payload."""

    if not _profile_key(profile):
        raise ValueError("profile_required")
    _validate_recommendation(recommendation)

    normalized = {
        "profile_id": _profile_id(profile),
        "profile_key": _profile_key(profile),
        "objective": str(recommendation["objective"]).strip(),
        "audience": str(recommendation["audience"]).strip(),
        "stage": str(recommendation["stage"]).strip(),
        "action": str(recommendation["action"]).strip(),
        "channel": str(recommendation["channel"]).strip(),
        "owner": str(recommendation["owner"]).strip(),
        "metric": str(recommendation["metric"]).strip(),
        "next_step": str(recommendation["next_step"]).strip(),
        "confidence": float(recommendation["confidence"]),
        "requires_approval": bool(recommendation["requires_approval"]),
        "supporting_cards": _string_list(recommendation["supporting_cards"]),
        "status": recommendation.get("status") or ("pending_approval" if recommendation["requires_approval"] else "ready"),
        "metadata": recommendation.get("metadata") or {},
        "created_at": _now_iso(),
    }
    payload_hash = sha256(str(sorted(normalized.items())).encode("utf-8")).hexdigest()
    return {**normalized, "recommendation_hash": payload_hash}


def build_strategy_context_pack(
    profile: dict[str, Any],
    skill_pack: dict[str, Any] | None = None,
    retrieval_result: dict[str, Any] | None = None,
    *,
    commercial_stage: str | None = None,
    customer_context: str | None = None,
    allow_internal_sources: bool | None = None,
) -> dict[str, Any]:
    """Build the compact context contract consumed by the agent harness."""

    pack = skill_pack or {}
    retrieval = retrieval_result or {}
    context_policy = pack.get("context_policy") or pack.get("contextPolicy") or profile.get("default_context_policy") or {}
    allow_internal = bool(context_policy.get("allow_internal_sources") or context_policy.get("allowInternalSources"))
    if allow_internal_sources is not None:
        allow_internal = allow_internal_sources

    chunks = [
        chunk
        for chunk in (
            _compact_chunk(item, allow_internal)
            for item in _as_list(retrieval.get("chunks"))
            if isinstance(item, dict)
        )
        if chunk is not None
    ]
    assets = [
        asset
        for asset in (
            _compact_asset(item, allow_internal)
            for item in _as_list(retrieval.get("assets"))
            if isinstance(item, dict)
        )
        if asset is not None
    ]
    context = {
        "profile_key": _profile_key(profile),
        "commercial_stage": commercial_stage or retrieval.get("stage") or retrieval.get("commercial_stage"),
        "customer_context": customer_context or retrieval.get("customer_context") or retrieval.get("customerContext") or "",
        "skill_rules": _string_list(pack.get("rules") or pack.get("skill_rules") or pack.get("skillRules")),
        "concept_cards": [
            _compact_card(item)
            for item in _as_list(retrieval.get("cards") or retrieval.get("concept_cards") or retrieval.get("conceptCards"))
            if isinstance(item, dict)
        ],
        "chunks": chunks,
        "assets": assets,
        "allowed_actions": _string_list(profile.get("allowed_actions") or profile.get("allowedActions")),
        "forbidden_actions": _string_list(profile.get("forbidden_actions") or profile.get("forbiddenActions")),
        "approval_policy": {
            "requires_human_approval_for": _string_list(
                profile.get("requires_human_approval_for") or profile.get("requiresHumanApprovalFor")
            )
        },
    }
    return {
        **context,
        "context_hash": _stable_hash(context),
    }


@dataclass(frozen=True)
class StrategyProfilePolicy:
    profile_key: str
    allowed_actions: tuple[str, ...] = ()
    forbidden_actions: tuple[str, ...] = ()
    requires_human_approval_for: tuple[str, ...] = ()

    def to_profile(self) -> dict[str, Any]:
        return {
            "profile_key": self.profile_key,
            "allowed_actions": list(self.allowed_actions),
            "forbidden_actions": list(self.forbidden_actions),
            "requires_human_approval_for": list(self.requires_human_approval_for),
        }
