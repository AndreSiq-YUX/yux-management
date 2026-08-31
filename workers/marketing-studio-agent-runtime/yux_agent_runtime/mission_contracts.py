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


class MissionConversationTranscriptMessageWire(StrictWireModel):
    role: Literal["user", "agent"]
    content: str = Field(min_length=1, max_length=8_000)


class MissionConversationTurnRequestWire(StrictWireModel):
    schemaVersion: Literal[1]
    organization_id: str = Field(min_length=1)
    client_id: str | None = None
    contract_id: str | None = None
    conversation_id: str = Field(min_length=1)
    audience: Literal["internal_operator", "client_user"]
    user_message: str = Field(min_length=1, max_length=8_000)
    transcript: list[MissionConversationTranscriptMessageWire] = Field(default_factory=list, max_length=20)
    rollingSummary: str = Field(default="", max_length=8_000)
    currentBrief: dict[str, Any] = Field(default_factory=dict)
    operationalContext: dict[str, Any] = Field(default_factory=dict)
    allowedActionPacks: list[SelectedPackWire] = Field(default_factory=list, max_length=20)
    allowedCapabilityKeys: list[str] = Field(default_factory=list, max_length=500)


class ModelUsageWire(StrictWireModel):
    inputTokens: int = Field(ge=0)
    outputTokens: int = Field(ge=0)
    totalTokens: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_total(self) -> "ModelUsageWire":
        if self.totalTokens != self.inputTokens + self.outputTokens:
            raise ValueError("mission_conversation_usage_total_invalid")
        return self


class MissionSourceRefWire(StrictWireModel):
    ref: str = Field(pattern=r"^(yux|customer|memory):[A-Za-z0-9._:@/-]+$")
    kind: Literal["strategy_card", "strategy_chunk", "knowledge_source", "knowledge_chunk", "mission_memory"]
    id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    visibility: Literal["internal_only", "client_safe", "internal", "external", "both"]
    title: str = Field(min_length=1, max_length=240)
    displayMode: Literal["named", "generic", "hidden"]


class MissionConversationKnownFactWire(StrictWireModel):
    key: str = Field(min_length=1)
    value: Any
    sourceRef: str = Field(pattern=r"^(yux|customer|memory):[A-Za-z0-9._:@/-]+$")


class MissionConversationAssumptionWire(StrictWireModel):
    key: str = Field(min_length=1)
    value: Any
    sourceRef: str | None = Field(default=None, pattern=r"^(yux|customer|memory):[A-Za-z0-9._:@/-]+$")


class MissionConversationMissingContextWire(StrictWireModel):
    key: str = Field(min_length=1)
    category: Literal["company", "brand", "offer", "audience", "budget", "deadline", "integration", "permission", "consent"]
    reason: str = Field(min_length=1, max_length=1_000)
    requiredFor: list[str] = Field(default_factory=list, max_length=50)
    correctionKey: str | None = Field(default=None, max_length=120)


class MissionContextReadinessWire(StrictWireModel):
    status: Literal["needs_information", "needs_configuration", "ready_for_brief_confirmation", "ready_for_plan"]
    knownFacts: list[MissionConversationKnownFactWire] = Field(default_factory=list, max_length=100)
    assumptions: list[MissionConversationAssumptionWire] = Field(default_factory=list, max_length=100)
    missing: list[MissionConversationMissingContextWire] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_ready_state(self) -> "MissionContextReadinessWire":
        if self.status in ("ready_for_brief_confirmation", "ready_for_plan") and self.missing:
            raise ValueError("mission_conversation_ready_with_missing_context")
        return self


class MissionBriefWire(StrictWireModel):
    title: str | None = Field(default=None, max_length=240)
    objective: str = Field(default="", max_length=8_000)
    requestedOutcome: str = Field(default="", max_length=240)
    scopeHints: list[str] = Field(default_factory=list, max_length=100)
    constraints: dict[str, Any] = Field(default_factory=dict)
    acceptanceCriteria: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    packKeys: list[str] = Field(default_factory=list, max_length=20)
    mode: Literal["shadow", "prepare", "assisted", "autonomous"] | None = None
    deadlineAt: str | None = Field(default=None, max_length=80)
    maxTotalCostBrl: str | None = Field(default=None, pattern=r"^\d+(\.\d{1,6})?$")
    maxHumanHours: str | None = Field(default=None, pattern=r"^\d+(\.\d{1,6})?$")
    maxExternalContacts: int | None = Field(default=None, ge=0)


class MissionConversationQuestionWire(StrictWireModel):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=1_000)
    whyNeeded: str = Field(min_length=1, max_length=1_000)
    priority: int = Field(ge=1, le=100)
    answerType: Literal["text", "number", "currency", "date", "single_choice", "multiple_choice", "boolean"]
    choices: list[str] = Field(default_factory=list, max_length=20)
    defaultValue: Any | None = None
    defaultSourceRef: str | None = Field(default=None, pattern=r"^(yux|customer|memory):[A-Za-z0-9._:@/-]+$")


class MissionSuggestedActionWire(StrictWireModel):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=500)
    kind: Literal["quick_reply", "open_correction", "confirm_brief", "cancel"]
    capabilityKey: str | None = Field(default=None, max_length=240)
    packKey: str | None = Field(default=None, max_length=120)
    correctionKey: str | None = Field(default=None, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)


class MissionConversationTurnResponseWire(StrictWireModel):
    schemaVersion: Literal[1]
    kind: Literal["message", "questions", "brief_confirmation", "blocked"]
    reply: str = Field(min_length=1, max_length=12_000)
    understood: dict[str, Any] = Field(default_factory=dict)
    questions: list[MissionConversationQuestionWire] = Field(default_factory=list, max_length=3)
    readiness: MissionContextReadinessWire
    brief: MissionBriefWire
    suggestedActions: list[MissionSuggestedActionWire] = Field(default_factory=list, max_length=8)
    sources: list[MissionSourceRefWire] = Field(default_factory=list, max_length=100)
    retrievalTraceId: str = Field(min_length=1)
    contextHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    usage: ModelUsageWire

    @model_validator(mode="after")
    def validate_variant_and_sources(self) -> "MissionConversationTurnResponseWire":
        question_keys = [question.key for question in self.questions]
        if len(question_keys) != len(set(question_keys)):
            raise ValueError("mission_conversation_question_keys_duplicate")
        action_keys = [action.key for action in self.suggestedActions]
        if len(action_keys) != len(set(action_keys)):
            raise ValueError("mission_conversation_action_keys_duplicate")
        if self.kind == "questions" and not self.questions:
            raise ValueError("mission_conversation_questions_required")
        if self.kind == "brief_confirmation" and self.questions:
            raise ValueError("mission_conversation_brief_confirmation_questions_forbidden")
        available_refs = {source.ref for source in self.sources}
        cited_refs = {fact.sourceRef for fact in self.readiness.knownFacts}
        cited_refs.update(
            assumption.sourceRef
            for assumption in self.readiness.assumptions
            if assumption.sourceRef is not None
        )
        cited_refs.update(
            question.defaultSourceRef
            for question in self.questions
            if question.defaultSourceRef is not None
        )
        if not cited_refs.issubset(available_refs):
            raise ValueError("mission_conversation_source_ref_missing")
        return self


def validate_mission_conversation_response(
    response: dict[str, Any] | MissionConversationTurnResponseWire,
    request: dict[str, Any] | MissionConversationTurnRequestWire,
) -> MissionConversationTurnResponseWire:
    typed_request = request if isinstance(request, MissionConversationTurnRequestWire) else MissionConversationTurnRequestWire.model_validate(request)
    typed_response = response if isinstance(response, MissionConversationTurnResponseWire) else MissionConversationTurnResponseWire.model_validate(response)
    allowed_capabilities = set(typed_request.allowedCapabilityKeys)
    allowed_packs = {pack.key for pack in typed_request.allowedActionPacks}
    if any(action.capabilityKey and action.capabilityKey not in allowed_capabilities for action in typed_response.suggestedActions):
        raise ValueError("mission_conversation_capability_not_allowed")
    if any(action.packKey and action.packKey not in allowed_packs for action in typed_response.suggestedActions):
        raise ValueError("mission_conversation_pack_not_allowed")
    if any(pack_key not in allowed_packs for pack_key in typed_response.brief.packKeys):
        raise ValueError("mission_conversation_pack_not_allowed")
    return typed_response


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
    conversationRequest: MissionConversationTurnRequestWire
    conversationResponse: MissionConversationTurnResponseWire


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
