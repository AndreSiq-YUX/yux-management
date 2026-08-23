from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator


MISSION_WIRE_SCHEMA_ID = "https://yux.app/contracts/mission-supervisor/v1/mission-wire.schema.json"


class StrictWireModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CapabilityWire(StrictWireModel):
    key: str = Field(min_length=1)
    version: int = Field(ge=1)
    effect: Literal["none", "draft", "internal", "external", "destructive"]
    definitionHash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class ActionPackWire(StrictWireModel):
    key: str = Field(min_length=1)
    semanticVersion: str = Field(min_length=1)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    protectedStepKeys: list[str] = Field(default_factory=list)
    topologyTemplate: dict[str, Any] = Field(default_factory=dict)


class MissionPlanRequestWire(StrictWireModel):
    organization_id: str = Field(min_length=1)
    client_id: str | None = None
    contract_id: str | None = None
    mission: dict[str, Any]
    action_pack: ActionPackWire
    pack_catalog: list[ActionPackWire] = Field(default_factory=list)
    readiness: dict[str, Any]
    baseline: dict[str, Any] = Field(default_factory=dict)
    capabilities: list[CapabilityWire]
    limits: dict[str, Any] = Field(default_factory=dict)
    strategy_context: dict[str, Any] = Field(default_factory=dict)
    previous_revision: dict[str, Any] | None = None
    observations: list[dict[str, Any]] = Field(default_factory=list)
    proposed_plan: dict[str, Any] | None = None
    planning_budget: dict[str, Any] | None = None
    context_snapshot_id: str | None = None
    allowed_source_ids: list[str] = Field(default_factory=list)
    asked_question_keys: list[str] = Field(default_factory=list)
    clarification_round: int = Field(default=0, ge=0, le=1)


class ClarificationQuestionWire(StrictWireModel):
    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    whyNeeded: str = Field(min_length=1)
    priority: int = Field(ge=1, le=100)
    answerType: Literal["text", "number", "currency", "date", "single_choice", "multiple_choice", "boolean"]
    defaultValue: Any | None = None
    defaultSourceId: str | None = None


class SelectedPackWire(StrictWireModel):
    key: str = Field(min_length=1)
    version: str = Field(min_length=1)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class OutputBindingWire(StrictWireModel):
    fromStep: str = Field(min_length=1)
    path: str = Field(min_length=1)


class PlanStepWire(StrictWireModel):
    stepKey: str = Field(min_length=1)
    dependsOn: list[str] = Field(default_factory=list)
    capabilityKey: str = Field(min_length=1)
    capabilityVersion: int = Field(ge=1)
    input: dict[str, Any] = Field(default_factory=dict)
    timeoutSeconds: int = Field(ge=1, le=86_400)
    maxAttempts: int = Field(ge=1, le=5)
    approvalRequired: bool
    effect: Literal["none", "draft", "internal", "external", "destructive"]
    outputBindings: dict[str, OutputBindingWire] = Field(default_factory=dict)


class ActionPackReferenceWire(StrictWireModel):
    key: str = Field(min_length=1)
    version: str = Field(min_length=1)
    templateHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class PlanDeviationWire(StrictWireModel):
    extensionPoint: str = Field(min_length=1)
    rationale: str = Field(min_length=1)


class EstimatedEconomicsWire(StrictWireModel):
    currency: Literal["BRL"]
    aiAndProviderCost: str
    mediaCost: str
    humanHours: str
    humanCost: str
    totalExecutionCost: str


class PlanWire(StrictWireModel):
    schemaVersion: Literal[1]
    missionId: str = Field(min_length=1)
    actionPack: ActionPackReferenceWire
    resolvedParameters: dict[str, Any] = Field(default_factory=dict)
    deviations: list[PlanDeviationWire] = Field(default_factory=list)
    rationale: str = Field(min_length=1)
    assumptions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    estimatedEconomics: EstimatedEconomicsWire
    steps: list[PlanStepWire] = Field(min_length=1)


class ClarificationResponseWire(StrictWireModel):
    kind: Literal["clarification"]
    interpretation: dict[str, Any]
    questions: list[ClarificationQuestionWire] = Field(min_length=1, max_length=3)
    selectedPacks: list[SelectedPackWire] = Field(default_factory=list)
    sourceIds: list[str] = Field(default_factory=list)
    plan: None = None
    trace: dict[str, Any] | None = None
    usage: dict[str, Any] | None = None


class PlanProposalResponseWire(StrictWireModel):
    kind: Literal["plan"]
    interpretation: dict[str, Any]
    questions: list[ClarificationQuestionWire] = Field(default_factory=list, max_length=0)
    selectedPacks: list[SelectedPackWire] = Field(min_length=1)
    sourceIds: list[str] = Field(default_factory=list)
    plan: PlanWire
    trace: dict[str, Any] | None = None
    usage: dict[str, Any] | None = None


class MissionSupervisorProposal(StrictWireModel):
    """Provider-facing proposal before the deterministic compiler trusts it."""

    kind: Literal["clarification", "plan"]
    interpretation: dict[str, Any]
    questions: list[ClarificationQuestionWire] = Field(default_factory=list, max_length=20)
    selected_packs: list[SelectedPackWire] = Field(default_factory=list, alias="selectedPacks")
    plan: dict[str, Any] | None = None
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")

    @model_validator(mode="after")
    def validate_variant(self) -> "MissionSupervisorProposal":
        if self.kind == "clarification":
            if not self.questions or self.plan is not None or self.selected_packs:
                raise ValueError("mission_supervisor_clarification_invalid")
        elif not self.selected_packs or self.plan is None or self.questions:
            raise ValueError("mission_supervisor_plan_invalid")
        return self


MissionPlanResponseVariant = Annotated[
    ClarificationResponseWire | PlanProposalResponseWire,
    Field(discriminator="kind"),
]


class MissionPlanResponseWire(RootModel[MissionPlanResponseVariant]):
    pass


class MissionWireContract(StrictWireModel):
    request: MissionPlanRequestWire
    response: MissionPlanResponseWire


def build_mission_wire_schema() -> dict[str, Any]:
    schema = MissionWireContract.model_json_schema(ref_template="#/$defs/{model}")
    response_schema = schema["$defs"]["MissionPlanResponseWire"]
    response_schema["type"] = "object"
    response_schema["discriminator"].pop("mapping", None)
    schema["$id"] = MISSION_WIRE_SCHEMA_ID
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "YUX Mission Supervisor Wire Contract v1"
    return schema


def build_mission_wire_schema_json() -> str:
    return json.dumps(build_mission_wire_schema(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
