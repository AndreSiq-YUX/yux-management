from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MissionRoutingError(ValueError):
    """Raised when a request cannot be routed inside the published pack catalog."""


class RoutedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    label: str
    whyNeeded: str
    answerType: str = "text"
    priority: int = Field(default=1, ge=1, le=100)


class MissionRoute(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selected_pack_keys: list[str] = Field(default_factory=list, max_length=5)
    specialist_profiles: list[str] = Field(default_factory=list, max_length=8)
    clarification_questions: list[RoutedQuestion] = Field(default_factory=list, max_length=3)
    rationale: str


PACK_PROFILES = {
    "revenue_recovery": ["revenue_recovery"],
    "funnel_nurture": ["funnel_nurture"],
    "campaign_launch": ["campaign_launch"],
}


class MissionRouter:
    def route(self, value: dict[str, Any]) -> MissionRoute:
        catalog = [item for item in value.get("pack_catalog") or [] if isinstance(item, dict)]
        available = {str(item.get("key")) for item in catalog if item.get("key")}
        objective = str((value.get("mission") or {}).get("objective") or (value.get("mission") or {}).get("goal") or "").casefold()
        selected: list[str] = []
        if re.search(r"funil|pipeline|nutri[cç][aã]o|sequ[eê]ncia\s+de\s+e-?mails?", objective):
            selected.append("funnel_nurture")
        if re.search(r"campanha|meta\s*ads?|google\s*ads?|m[ií]dia\s+paga|an[uú]ncios?", objective):
            selected.append("campaign_launch")
        if re.search(r"receita|revenue|oportunidades?\s+inativ|recuper", objective):
            selected.append("revenue_recovery")
        selected = list(dict.fromkeys(selected))
        if len(available) == 1 and available.isdisjoint(PACK_PROFILES) and (not selected or any(key not in available for key in selected)):
            selected = [next(iter(available))]
        unavailable = [key for key in selected if key not in available]
        if unavailable:
            raise MissionRoutingError(f"mission_route_pack_unavailable:{','.join(unavailable)}")
        if not selected:
            if len(available) == 1:
                selected = [next(iter(available))]
            elif any(token in objective for token in ("financeiro", "fiscal", "jurídico", "contrato legal", "senha", "credencial")):
                raise MissionRoutingError("mission_route_functional_area_unsupported")
            else:
                return MissionRoute(
                    clarification_questions=[RoutedQuestion(key="desired_outcome", label="Qual resultado você quer obter?", whyNeeded="Precisamos escolher um fluxo operacional publicado.")],
                    rationale="O resultado ainda não identifica um Action Pack publicado.",
                )
        profiles = list(dict.fromkeys(profile for key in selected for profile in PACK_PROFILES.get(key, [])))
        return MissionRoute(selected_pack_keys=selected, specialist_profiles=profiles, rationale="Rota limitada aos Action Packs publicados e compatíveis com o objetivo.")
