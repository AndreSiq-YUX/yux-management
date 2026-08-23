from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .contracts import validate_mission_plan
from .mission_contracts import MissionPlanRequestWire


MissionPlanRequest = MissionPlanRequestWire


def compose_mission_planning_prompt(value: dict[str, Any]) -> dict[str, Any]:
    """Return a minimized, JSON-only planner instruction envelope."""
    mission = value.get("mission") or {}
    return {
        "instruction": (
            "Instancie somente o Action Pack fornecido. Preencha parâmetros e extension points permitidos; "
            "não crie DAG livre, não remova nós protegidos e retorne somente JSON compatível."
        ),
        "mission": {key: mission.get(key) for key in ("id", "objective", "parameters", "budget", "deadlineAt")},
        "actionPack": value.get("action_pack") or {},
        "readiness": value.get("readiness") or {},
        "baseline": value.get("baseline") or {},
        "capabilities": value.get("capabilities") or [],
        "limits": value.get("limits") or {},
        "strategyContext": value.get("strategy_context") or {},
        "previousRevision": value.get("previous_revision"),
        "observations": value.get("observations") or [],
    }


def plan_mission(value: dict[str, Any]) -> dict[str, Any]:
    """Instantiate the protected pack and validate the untrusted proposal.

    `proposed_plan` is the provider boundary: production callers may populate it
    with model JSON. When absent, the protected template is instantiated
    deterministically, keeping the internal pilot operational without free-form
    graph generation.
    """
    prompt = compose_mission_planning_prompt(value)
    proposal = deepcopy(value.get("proposed_plan")) if value.get("proposed_plan") else _canonical_proposal(value)
    validated = validate_mission_plan(proposal, value)
    return {
        "plan": validated,
        "trace": {
            "profile": "growth_strategist",
            "workflowKey": "mission_revenue_recovery_pack_v0",
            "steps": ["planner", "contract_verifier"],
            "promptEnvelope": prompt,
        },
    }


def _canonical_proposal(value: dict[str, Any]) -> dict[str, Any]:
    mission = value.get("mission") or {}
    pack = value.get("action_pack") or {}
    capability_effects = {
        (str(item.get("key")), int(item.get("version", 0))): str(item.get("effect") or "none")
        for item in value.get("capabilities") or []
        if isinstance(item, dict)
    }
    steps: list[dict[str, Any]] = []
    for template in (pack.get("topologyTemplate") or {}).get("steps") or []:
        identity = (str(template.get("capabilityKey")), int(template.get("capabilityVersion", 1)))
        steps.append({
            "stepKey": template.get("stepKey"),
            "dependsOn": template.get("dependsOn") or [],
            "capabilityKey": identity[0],
            "capabilityVersion": identity[1],
            "input": _resolve_runtime_values(template.get("defaultParameters") or {}, mission),
            "timeoutSeconds": 3600 if identity[0] == "system.signal.wait" else 300,
            "maxAttempts": 1 if template.get("approvalRequired") else 3,
            "approvalRequired": bool(template.get("approvalRequired")),
            "effect": capability_effects.get(identity, "none"),
            "outputBindings": {},
        })
    budget = mission.get("budget") or {}
    return {
        "schemaVersion": 1,
        "missionId": mission.get("id"),
        "actionPack": {"key": pack.get("key"), "version": pack.get("semanticVersion"), "templateHash": pack.get("contentHash")},
        "resolvedParameters": mission.get("parameters") or {},
        "deviations": [],
        "rationale": "Instanciação determinística do Revenue Recovery Pack v0 para piloto assistido.",
        "assumptions": [],
        "risks": [],
        "estimatedEconomics": {
            "currency": "BRL", "aiAndProviderCost": "0", "mediaCost": "0",
            "humanHours": str(budget.get("maxHumanHours") or "0"),
            "humanCost": "0", "totalExecutionCost": str(budget.get("maxTotalCostBrl") or "0"),
        },
        "steps": steps,
    }


def _resolve_runtime_values(value: Any, mission: dict[str, Any], key: str | None = None) -> Any:
    if isinstance(value, dict):
        return {item_key: _resolve_runtime_values(item, mission, item_key) for item_key, item in value.items()}
    if isinstance(value, list):
        return [_resolve_runtime_values(item, mission, key) for item in value]
    if value != "runtime":
        return value
    if key == "targetRevenueBrl":
        return (mission.get("parameters") or {}).get("targetRevenueBrl", "0")
    if key == "dueAt" and mission.get("deadlineAt"):
        return mission["deadlineAt"]
    if key in ("dueAt", "since"):
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return value
