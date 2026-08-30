from __future__ import annotations

from typing import Any

from .mission_router import MissionRoute


class MissionVerificationError(ValueError):
    """Raised when specialist output attempts to cross a deterministic boundary."""


class CompositeMissionVerifier:
    def verify(self, value: dict[str, Any], route: MissionRoute, proposal: dict[str, Any]) -> dict[str, Any]:
        catalog = {str(item.get("key")): item for item in value.get("pack_catalog") or [] if isinstance(item, dict)}
        selected = [str(item.get("key")) for item in proposal.get("selectedPacks") or [] if isinstance(item, dict)]
        if selected != route.selected_pack_keys:
            raise MissionVerificationError("mission_verifier_route_selection_mismatch")
        if any(key not in catalog for key in selected):
            raise MissionVerificationError("mission_verifier_pack_not_allowed")
        allowed_sources = {str(item) for item in value.get("allowed_source_ids") or []}
        if any(str(item) not in allowed_sources for item in proposal.get("sourceIds") or []):
            raise MissionVerificationError("mission_verifier_source_not_allowed")
        capability_catalog = {(str(item.get("key")), int(item.get("version", 0))) for item in value.get("capabilities") or [] if isinstance(item, dict)}
        plan = proposal.get("plan") or {}
        for step in plan.get("steps") or []:
            identity = (str(step.get("capabilityKey")), int(step.get("capabilityVersion", 0)))
            if identity not in capability_catalog:
                raise MissionVerificationError("mission_verifier_capability_escalation")
            if step.get("effect") in {"external", "destructive"} and step.get("approvalRequired") is not True:
                raise MissionVerificationError("mission_verifier_external_approval_missing")
        bindings = (plan.get("resolvedParameters") or {}).get("artifactBindings") or []
        if selected == ["funnel_nurture", "campaign_launch"]:
            if not any(binding.get("fromPack") == "funnel_nurture" and binding.get("toPack") == "campaign_launch" and binding.get("artifactKey") == "crm.funnel" and binding.get("schemaVersion") == 1 for binding in bindings if isinstance(binding, dict)):
                raise MissionVerificationError("mission_verifier_composite_binding_missing")
        total = float((plan.get("estimatedEconomics") or {}).get("totalExecutionCost") or 0)
        maximum = float((value.get("limits") or {}).get("maxTotalCostBrl") or 0)
        if maximum and total > maximum:
            raise MissionVerificationError("mission_verifier_budget_exceeded")
        return proposal
