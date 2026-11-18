from __future__ import annotations

from contextlib import contextmanager, nullcontext
import json
import logging
import os
import re
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_serializer, field_validator

from .queue import AgentEventQueue
from .knowledge_intelligence import KnowledgeIntelligenceService
from .strategy_curation import StrategyCurationService
from .providers import ProviderRequestError,ProviderAuthorizationError
from .runtime_factory import build_mission_supervisor, build_strategy_workflow_engine, build_routed_client
from .llm_routing import effective_legacy_routes
from .radar_qualification import qualify_radar_business, validate_radar_qualification_response
from .radar_presence import resolve_radar_presence, validate_radar_presence_response
from .radar_discovery_extraction import extract_radar_businesses, validate_radar_discovery_extraction_response, public_discovery_url
from .radar_receipts import execute_radar_receipt, revalidate_radar_receipt
from .radar_decisions import decide_radar_action, validate_saved_decision, TASKS as DECISION_TASKS
from .perplexity_research import run_radar_deep_research,normalize_research_response,REMOTE_FINANCIAL_CEILING_SUPPORTED
from .runtime_store import AgentRuntimeStore, InMemoryAgentRuntimeStore, PostgresAgentRuntimeStore, CreditReservationError, WorkflowCreditConflict
from .strategy_usage import PlanningAttemptLimitExceeded, StrategyUsage
from .trace import stable_hash
from .mission import MissionPlanRequest, plan_mission
from .mission_supervisor import MissionSupervisor, MissionSupervisorError
from .mission_contracts import MissionConversationTurnRequestWire, validate_mission_conversation_response
from .mission_prompt import MissionPromptConfigurationWire, MissionPromptInstruction, MissionPromptStage
from .source_rules import AgentSourceRulesWire, RequiredSourcesMissing
from .mission_conversation import MissionConversationWorkflow
from .mission_diagnostics import mission_failure_diagnostic
from .workflow import CREDITS_BASE_PER_RUN, StrategyWorkflowEngine, estimate_workflow_credits, resolve_retrieval_audience
from .instruction_preview import preview_mission_supervisor, preview_workflow


logger = logging.getLogger(__name__)


def provider_http_exception(error: ProviderRequestError) -> HTTPException:
    message = str(error)
    if "provider_http_402" in message:
        return HTTPException(status_code=402, detail="openrouter_credit_required")
    if "data policy" in message.lower():
        return HTTPException(status_code=503, detail="openrouter_private_provider_unavailable")
    return HTTPException(status_code=502, detail=message)


class RadarQualificationEvidence(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    source_url: str = Field(min_length=1, max_length=2000)
    text: str = Field(min_length=1, max_length=12000)

class RadarRetryAuthorization(BaseModel):
    model_config = ConfigDict(extra='forbid')
    authorization_id: str = Field(pattern=r'^[a-fA-F0-9-]{36}$')
    campaign_id: str = Field(pattern=r'^[a-fA-F0-9-]{36}$')
    candidate_id: str = Field(pattern=r'^[a-fA-F0-9-]{36}$')
    configuration_revision: int = Field(strict=True,gt=0)
    policy_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


class RadarAnalysisRequest(BaseModel):
    retry_authorization: RadarRetryAuthorization | None = None

    @model_serializer(mode='wrap')
    def preserve_original_request_material(self, handler):
        result = handler(self)
        if self.retry_authorization is None:
            result.pop('retry_authorization', None)
        return result


class RadarQualificationRequest(RadarAnalysisRequest):
    organization_id: str
    client_id: str | None = None
    contract_id: str | None = None
    enabled: bool = False
    request_id: str
    criteria: dict[str, Any]
    evidence: list[RadarQualificationEvidence] = Field(min_length=1, max_length=10)

class RadarPresenceEvidence(RadarQualificationEvidence):
    kind: Literal['institutional_candidate','directory','social','third_party']

class RadarPresenceRequest(RadarAnalysisRequest):
    organization_id: str
    client_id: str | None = None
    contract_id: str | None = None
    enabled: bool = False
    request_id: str = Field(min_length=1,max_length=200)
    identity: dict[str,Any]
    evidence: list[RadarPresenceEvidence] = Field(min_length=1,max_length=10)


class RadarExtractionDocument(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id: str=Field(min_length=1,max_length=80)
    source_url: str=Field(min_length=1,max_length=2000)
    text: str=Field(min_length=1,max_length=8000)
    kind: Literal['institutional_candidate','directory','third_party','social']

    @field_validator('source_url')
    @classmethod
    def public_url(cls,value):
        if not public_discovery_url(value):
            raise ValueError('radar_discovery_document_unsafe')
        return value

    @field_validator('text')
    @classmethod
    def bounded_text(cls,value):
        if len(value.encode('utf-8'))>8000:
            raise ValueError('radar_discovery_document_too_large')
        return value


class RadarExtractionRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    organization_id: str
    client_id: str | None=None
    contract_id: str | None=None
    enabled: bool=False
    request_id: str=Field(min_length=1,max_length=200)
    context_version: int=Field(default=1,strict=True,ge=1,le=1)
    document: RadarExtractionDocument
    region: dict[str,Any]
    criteria: dict[str,Any]


class RadarRevalidationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    organization_id: str
    client_id: str | None = None
    contract_id: str | None = None
    action: Literal['radar_presence_resolution', 'radar_business_qualification','radar_discovery_extraction','radar_initial_triage','radar_next_action','radar_quality_gate','radar_fit_gate','radar_deep_research']
    request_id: str = Field(min_length=1, max_length=200)
    input_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


class RadarDecisionEvidence(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1,max_length=80)
    source_url: str = Field(min_length=1,max_length=2000)
    text: str = Field(min_length=1,max_length=20000)
    role: Literal['registry','identity','activity','domain','contact']='activity'
    primary: bool=False
    contradictory: bool=False
    scope: Literal['establishment','group','unresolved']='unresolved'


class RadarDecisionRequest(RadarAnalysisRequest):
    model_config = ConfigDict(extra='forbid')
    organization_id: str
    client_id: str | None=None
    contract_id: str | None=None
    request_id: str=Field(min_length=1,max_length=200)
    task: Literal['radar_initial_triage','radar_next_action','radar_quality_gate','radar_fit_gate']
    context_version: Literal['radar-decision-context-v1','radar-decision-context-v2'] | None = None
    step: int | None = Field(default=None,strict=True,ge=0,le=9007199254740991)
    enabled: bool=False
    identity: dict[str,Any]
    criteria: dict[str,Any]
    evidence: list[RadarDecisionEvidence]=Field(max_length=30)
    options: list[dict[str,str]]=Field(default_factory=list,max_length=8)
    route_snapshot: dict[str,Any]

    @model_serializer(mode='wrap')
    def preserve_legacy_decision_request(self,handler):
        result=handler(self)
        for key in ('context_version','step','retry_authorization'):
            if result.get(key) is None:
                result.pop(key,None)
        return result

class RadarDeepResearchRequest(RadarAnalysisRequest):
    model_config=ConfigDict(extra='forbid')
    organization_id: str
    client_id: str | None=None
    contract_id: str | None=None
    request_id: str=Field(min_length=1,max_length=200)
    enabled: bool=False
    context: dict[str,Any]
    route_snapshot: dict[str,Any]

class IngestEventRequest(BaseModel):
    organization_id: str | None = None
    client_id: str | None = None
    contract_id: str | None = None
    conversation_id: str | None = None
    lead_id: str | None = None
    channel: str = "whatsapp"
    event_type: str = "message.inbound"
    message_id: str | None = None
    inbound_message_id: str | None = None
    text: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


PromptStageKey = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_-]{0,79}$")]
PromptInstruction = Annotated[str, Field(min_length=1, max_length=4_000)]


class ExecuteWorkflowRequest(BaseModel):
    message: str
    profile_key: str = "growth_strategist"
    source: str = "strategy_admin"
    organization_id: str | None = None
    client_id: str | None = None
    contract_id: str | None = None
    conversation_id: str | None = None
    assistant_id: str | None = None
    mode: str | None = None
    workflow_spec: dict[str, Any] | None = None
    retrieval_context: dict[str, Any] | None = None
    autonomy_policies: list[dict[str, Any]] | None = None
    presales_candidate: bool = False
    presales_instruction: str | None = Field(default=None, min_length=1, max_length=4_000)
    presales_stage_instructions: dict[PromptStageKey, PromptInstruction] | None = Field(default=None, max_length=24)
    presales_prompt_version: int | None = Field(default=None, ge=1)
    presales_source_rules: AgentSourceRulesWire | None = None
    strategy_operation_id: UUID | None = None
    # Accepted for backward compatibility but ignored: credits are always
    # estimated server-side (see workflow.estimate_workflow_credits).
    estimated_credits: int = Field(default=0, ge=0)


class PreviewStrategistRequest(BaseModel):
    organization_id: str
    client_id: str | None = None
    contract_id: str | None = None
    message: str = Field(min_length=1, max_length=8_000)
    mode: str | None = None
    candidate_instruction: str | None = Field(default=None, min_length=1, max_length=4_000)
    candidate_stage: PromptStageKey | None = None
    published_instruction: PromptInstruction | None = None
    published_stage_instructions: dict[PromptStageKey, PromptInstruction] = Field(default_factory=dict, max_length=24)
    published_prompt_version: int | None = Field(default=None, ge=1)
    published_source_rules: AgentSourceRulesWire | None = None
    candidate_source_rules: AgentSourceRulesWire | None = None
    commercial_catalog: dict[str, Any] | None = None


class CandidateMissionPrompt(BaseModel):
    stage: MissionPromptStage
    instruction: MissionPromptInstruction
    version: int = Field(ge=1)

    def apply(self, published: MissionPromptConfigurationWire | None) -> dict[str, Any]:
        return {
            "version": self.version,
            "instructions": {**(published.instructions if published else {}), self.stage: self.instruction},
            "source_rules": published.source_rules if published else None,
        }


class PreviewMissionIntakeRequest(MissionConversationTurnRequestWire):
    candidate_adjustment: CandidateMissionPrompt | None = None
    candidate_source_rules: AgentSourceRulesWire | None = None
    candidate_source_version: int | None = Field(default=None, ge=1)


class PreviewMissionPlanRequest(MissionPlanRequest):
    candidate_adjustment: CandidateMissionPrompt | None = None


class KnowledgeSectionRequest(BaseModel):
    locator: str
    heading: str | None = None
    body: str


class CurateKnowledgeRequest(BaseModel):
    organization_id: str
    client_id: str | None = None
    contract_id: str | None = None
    sections: list[KnowledgeSectionRequest] = Field(min_length=1, max_length=80)


class StrategySectionRequest(BaseModel):
    locator: str
    document_id: str
    document_hash: str
    page: int | None = None
    section: str | None = None
    heading: str | None = None
    body: str


class CurateStrategyRequest(BaseModel):
    organization_id: str
    sections: list[StrategySectionRequest] = Field(min_length=1, max_length=40)


class WebsitePageRequest(BaseModel):
    url: str
    title: str | None = None
    content: str


class ExtractCompanyProfileRequest(BaseModel):
    target: dict[str, str] | None = None
    organization_id: str
    client_id: str | None = None
    contract_id: str | None = None
    pages: list[WebsitePageRequest] = Field(min_length=1, max_length=20)


def _runtime_token() -> str:
    return os.getenv("YUX_AGENT_RUNTIME_TOKEN", "")


def require_runtime_token(authorization: str | None = Header(default=None)) -> None:
    configured = _runtime_token()
    if not configured or authorization != f"Bearer {configured}":
        raise HTTPException(status_code=401, detail="invalid runtime token")


def create_app(
    store: AgentRuntimeStore | None = None,
    knowledge_service: KnowledgeIntelligenceService | None = None,
    strategy_curation_service: StrategyCurationService | None = None,
    mission_supervisor: MissionSupervisor | None = None,
    mission_conversation_workflow: MissionConversationWorkflow | None = None,
    decision_transport=None,
    research_transport=None,
) -> FastAPI:
    if not _runtime_token():
        raise RuntimeError("YUX_AGENT_RUNTIME_TOKEN is required")
    app = FastAPI(title="YUX Agent Harness Runtime", version="1.0.0")

    @app.exception_handler(RequestValidationError)
    async def log_mission_request_validation(request: Request, error: RequestValidationError):
        if request.url.path.startswith('/radar/'):
            # Do not echo evidence/prompts from Pydantic's input field. This error
            # is pre-provider, unlike a rejected response with an existing receipt.
            return JSONResponse(status_code=422, content=dict(detail='radar_request_invalid'))
        if request.url.path == "/missions/conversations/turn":
            context = error.body if isinstance(error.body, dict) else {}
            logger.error("%s", json.dumps(mission_failure_diagnostic(
                error, stage="request", status=422, context=context,
            )))
        return await request_validation_exception_handler(request, error)

    runtime_store = store or PostgresAgentRuntimeStore()
    queue = AgentEventQueue(runtime_store)
    # Tests may inject an isolated store. Production configuration is loaded
    # lazily from Postgres so health checks do not depend on OpenRouter or RAG.
    engine: StrategyWorkflowEngine | None = StrategyWorkflowEngine(runtime_store) if store is not None else None
    supervisor = mission_supervisor
    conversation = mission_conversation_workflow

    def workflow_engine(context=None) -> StrategyWorkflowEngine:
        return engine if engine is not None else build_strategy_workflow_engine(runtime_store, context=context)

    def mission_planner(context=None) -> MissionSupervisor:
        nonlocal supervisor
        if supervisor is not None:
            return supervisor
        return build_mission_supervisor(runtime_store, context=context)

    def conversation_workflow(context=None) -> MissionConversationWorkflow:
        nonlocal conversation
        if conversation is not None:
            return conversation
        return MissionConversationWorkflow(build_strategy_workflow_engine(runtime_store, context=context))

    def knowledge_curator(context):
        return knowledge_service or KnowledgeIntelligenceService(build_routed_client(runtime_store, "knowledge_curator", context=context))

    def validate_tenant(
        organization_id: str | None,
        client_id: str | None = None,
        contract_id: str | None = None,
        *,
        profile_key: str | None = None,
        audience: str = "client_user",
    ) -> None:
        if not organization_id:
            raise HTTPException(status_code=422, detail="organization_id is required")
        checker = getattr(runtime_store, "validate_tenant", None)
        if callable(checker) and not checker(organization_id, client_id, contract_id):
            raise HTTPException(status_code=403, detail="invalid tenant context")
        set_scope = getattr(runtime_store, "set_tenant_scope", None)
        if callable(set_scope):
            try:
                set_scope(organization_id, contract_id=contract_id, profile_key=profile_key, audience=audience)
            except ValueError as error:
                raise HTTPException(status_code=422, detail=str(error)) from error

    def reserve_billable_credits(
        *,
        organization_id: str | None,
        client_id: str | None,
        contract_id: str | None,
        credits: int,
        action: str,
    ) -> dict[str, Any] | None:
        """Debit the client wallet when the run is attributed to a client contract.

        Runs without client/contract context (internal admin usage) are not billed.
        """
        reserve = getattr(runtime_store, "reserve_credits", None)
        if credits <= 0 or not client_id or not contract_id or not callable(reserve):
            return None
        return reserve(
            organization_id=organization_id,
            client_id=client_id,
            contract_id=contract_id,
            credits=credits,
            action=action,
        )

    @app.get("/health", dependencies=[Depends(require_runtime_token)])
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "yux-agent-harness-runtime",
            "deployment": {
                "commit": os.getenv("YUX_RELEASE_COMMIT", "unrecorded"),
                "manifestSha256": os.getenv("YUX_RELEASE_MANIFEST_SHA256", "unrecorded"),
            },
        }

    @app.post("/configuration/llm-routes", dependencies=[Depends(require_runtime_token)])
    def llm_configuration() -> dict[str, Any]:
        return {"routes": effective_legacy_routes(runtime_store.list("model_routing_rules", limit=None))}

    @app.post("/events/ingest", dependencies=[Depends(require_runtime_token)])
    def ingest_event(request: IngestEventRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key="ai_sdr_comercial_1", audience="external_contact")
        payload = {**request.payload, **request.model_dump(exclude={"payload"})}
        return queue.ingest_event(payload)

    def reserve_radar_credits(request, action: str) -> None:
        try:
            reserve_billable_credits(organization_id=request.organization_id, client_id=request.client_id,
                                     contract_id=request.contract_id, credits=1, action=action)
        except CreditReservationError as error:
            code = 'radar_ai_wallet_missing' if error.reason == 'wallet_missing' else 'radar_ai_credits_insufficient'
            logger.warning('%s', json.dumps(dict(event='radar_credit_reservation_rejected', stage='before_provider',
                                                 request_id=request.request_id[:200], code=code)))
            raise HTTPException(status_code=402, detail=code) from error

    @app.post('/radar/deep-research', dependencies=[Depends(require_runtime_token)])
    def radar_deep_research(request: RadarDeepResearchRequest) -> dict[str,Any]:
        validate_tenant(request.organization_id,request.client_id,request.contract_id,profile_key='radar_deep_research',audience='internal_operator')
        try:
            return execute_radar_receipt(runtime_store,action='radar_deep_research',request=request,validate_effect=False,
                debit=lambda:reserve_radar_credits(request,'radar_deep_research'),
                compute=lambda before:run_radar_deep_research(runtime_store,data=request.model_dump(),before_call=before,transport=research_transport))
        except ProviderAuthorizationError as cause:
            code=str(cause)
            raise HTTPException(status_code=409,detail=code if code.startswith(('research_','llm_','radar_')) and code.replace('_','').isalnum() else 'radar_deep_research_not_authorized') from None
        except ProviderRequestError:
            raise HTTPException(status_code=502,detail='radar_deep_research_unavailable') from None
        except ValueError:
            raise HTTPException(status_code=422,detail='radar_deep_research_response_invalid') from None

    @app.post('/radar/decide', dependencies=[Depends(require_runtime_token)])
    def radar_decide(request: RadarDecisionRequest) -> dict[str,Any]:
        validate_tenant(request.organization_id,request.client_id,request.contract_id,profile_key=request.task,audience='internal_operator')
        data=request.model_dump()
        if len(json.dumps(data,ensure_ascii=False).encode('utf-8'))>2500000 or any(set(item)!= {'id','description'} or not re.fullmatch(r'[a-z][a-z0-9_]{0,79}',item.get('id','')) or len(item.get('description',''))>1000 for item in request.options):
            raise HTTPException(status_code=422,detail='radar_request_invalid')
        try:
            return execute_radar_receipt(runtime_store,action=request.task,request=request,validate_effect=False,
                debit=lambda:reserve_radar_credits(request,request.task),
                compute=lambda before:decide_radar_action(runtime_store,data=data,before_call=before,transport=decision_transport))
        except ProviderRequestError as cause:
            code=str(cause)
            raise HTTPException(status_code=502,detail=code if re.fullmatch(r'(?:decision_|provider_|llm_)[a-z0-9_]{1,100}',code) else 'radar_decision_unavailable') from None
        except (ValueError,KeyError,TypeError):
            raise HTTPException(status_code=422,detail='radar_decision_context_invalid') from None

    @app.post('/radar/revalidate', dependencies=[Depends(require_runtime_token)])
    def radar_revalidate(request: RadarRevalidationRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key=request.action, audience='internal_operator')
        def validate(response, saved):
            if saved.get('client_id') != request.client_id or saved.get('contract_id') != request.contract_id:
                raise HTTPException(status_code=403, detail='radar_analysis_tenant_changed')
            if request.action in DECISION_TASKS:
                return validate_saved_decision(response,saved)
            if request.action=='radar_deep_research':
                return normalize_research_response(response.get('upstream_response'))
            if request.action == 'radar_presence_resolution':
                return validate_radar_presence_response(response, evidence=saved['evidence'])
            if request.action == 'radar_discovery_extraction':
                return validate_radar_discovery_extraction_response(response,document=saved['document'])
            return validate_radar_qualification_response(response, criteria=saved['criteria'], evidence=saved['evidence'])
        try:
            return revalidate_radar_receipt(runtime_store, organization_id=request.organization_id, action=request.action, request_id=request.request_id, input_hash=request.input_hash, validate=validate, tenant_context=dict(client_id=request.client_id, contract_id=request.contract_id))
        except ValueError as cause:
            code = str(cause)
            if code == 'radar_analysis_tenant_changed':
                raise HTTPException(status_code=403, detail=code) from None
            raise HTTPException(status_code=422, detail=code if re.fullmatch(r'(?:radar_[a-z0-9_]+|output_truncated)', code) else 'radar_analysis_response_invalid') from None

    @app.post('/radar/extract-businesses', dependencies=[Depends(require_runtime_token)])
    def radar_extract_businesses(request: RadarExtractionRequest) -> dict[str,Any]:
        validate_tenant(request.organization_id,request.client_id,request.contract_id,profile_key='radar_discovery_extraction',audience='internal_operator')
        if len(json.dumps(dict(criteria=request.criteria,region=request.region),ensure_ascii=False).encode('utf-8'))>4000:
            raise HTTPException(status_code=422,detail='radar_discovery_criteria_too_large')
        try:
            return execute_radar_receipt(runtime_store,action='radar_discovery_extraction',request=request,
                debit=lambda: reserve_radar_credits(request,'radar_discovery_extraction'),
                compute=lambda before_call: extract_radar_businesses(runtime_store,enabled=request.enabled,context=request.model_dump(),document=request.document.model_dump(),region=request.region,criteria=request.criteria,before_call=before_call))
        except ProviderRequestError as cause:
            raise provider_http_exception(cause) from cause
        except ValueError as cause:
            code=str(cause)
            raise HTTPException(status_code=422,detail=code if re.fullmatch(r'(?:radar_[a-z0-9_]+|output_truncated)',code) else 'radar_discovery_extraction_invalid_response') from None

    @app.post('/radar/resolve-presence', dependencies=[Depends(require_runtime_token)])
    def radar_resolve_presence(request: RadarPresenceRequest) -> dict[str,Any]:
        validate_tenant(request.organization_id,request.client_id,request.contract_id,profile_key='radar_presence_resolution',audience='internal_operator')
        if len(json.dumps(request.identity))>4000:
            raise HTTPException(status_code=422,detail='radar_presence_identity_too_large')
        try:
            def debit():
                reserve_radar_credits(request, 'radar_presence_resolution')
            return execute_radar_receipt(runtime_store, action='radar_presence_resolution', request=request, debit=debit,
                compute=lambda before_call: resolve_radar_presence(runtime_store,enabled=request.enabled,context=request.model_dump(),identity=request.identity,evidence=[item.model_dump() for item in request.evidence],before_call=before_call))
        except ProviderRequestError as error:
            raise provider_http_exception(error) from error
        except ValueError as error:
            raise HTTPException(status_code=422,detail=str(error)) from error

    @app.post('/radar/qualify', dependencies=[Depends(require_runtime_token)])
    def radar_qualify(request: RadarQualificationRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key='radar_business_qualification', audience='internal_operator')
        if len(json.dumps(request.criteria)) > 16000:
            raise HTTPException(status_code=422, detail='radar_qualification_criteria_too_large')
        try:
            def debit():
                reserve_radar_credits(request, 'radar_business_qualification')
            return execute_radar_receipt(runtime_store, action='radar_business_qualification', request=request, debit=debit,
                compute=lambda before_call: qualify_radar_business(runtime_store, enabled=request.enabled, context=request.model_dump(),
                criteria=request.criteria, evidence=[item.model_dump() for item in request.evidence], before_call=before_call))
        except ProviderRequestError as error:
            raise provider_http_exception(error) from error
        except ValueError as error:
            code = str(error)
            raise HTTPException(status_code=422, detail=code if re.fullmatch(r'radar_[a-z0-9_]+', code) else 'radar_qualification_invalid_response') from error

    @app.post("/workflows/execute", dependencies=[Depends(require_runtime_token)])
    def execute_workflow(request: ExecuteWorkflowRequest) -> dict[str, Any]:
        requested_audience = (request.retrieval_context or {}).get("audience")
        workflow_audience = resolve_retrieval_audience(request.source, requested_audience)
        validate_tenant(
            request.organization_id,
            request.client_id,
            request.contract_id,
            profile_key=request.profile_key,
            audience=workflow_audience,
        )
        execution = request.model_dump(exclude={"estimated_credits", "strategy_operation_id"})
        for field in ("presales_stage_instructions", "presales_prompt_version", "presales_source_rules"):
            if execution[field] is None:
                execution.pop(field)
        selected_engine = workflow_engine(execution)
        execution["workflow_spec"] = selected_engine.resolve_workflow_spec(
            request.mode, request.source, request.workflow_spec,
        )
        credits_required = estimate_workflow_credits(execution["workflow_spec"], request.mode, request.source)
        if request.presales_candidate and request.source == "strategy_admin" and request.profile_key == "growth_strategist":
            try:
                return execute_presales_workflow(request, selected_engine, execution, credits_required)
            except RequiredSourcesMissing as error:
                raise HTTPException(status_code=409, detail=str(error)) from error
        try:
            credits = reserve_billable_credits(
                organization_id=request.organization_id,
                client_id=request.client_id,
                contract_id=request.contract_id,
                credits=credits_required,
                action="agent_runtime_workflow",
            )
        except RuntimeError as error:
            raise HTTPException(status_code=402, detail=str(error)) from error
        result = selected_engine.execute(**execution)
        return {**result, "credits": credits}

    def execute_presales_workflow(request, selected_engine, execution, credits_required):
        meter = StrategyUsage()
        credits = None
        settle = None
        if request.client_id and request.contract_id:
            if request.strategy_operation_id is None:
                raise HTTPException(status_code=422, detail="strategy_credit_operation_required")
            meter, settle, _ = begin_workflow_credits(
                request, request.strategy_operation_id, execution, credits_required,
                action="agent_runtime_workflow", audience="internal_operator",
            )
        with measured_workflow(meter, settle):
            result = selected_engine.execute(**execution)
        if settle is not None:
            completed_specialists = sum(
                output["verification"]["status"] != "failed" for output in result["subagents"]
            )
            credits = settle(CREDITS_BASE_PER_RUN + completed_specialists)
        usage = {
            **result.get("usage", {}),
            "providerAttempts": meter.attempts,
            "reportedProviderCostUsd": meter.total_cost_usd(),
        }
        return {**result, "usage": usage, "credits": credits}

    def begin_workflow_credits(request, operation_id, execution, credits_required, *, action, audience, conversation_id=None):
        key = (request.organization_id, request.contract_id, str(operation_id))
        owner = str(uuid4())
        try:
            replay = runtime_store.hold_workflow_credits(
                key, client_id=request.client_id, input_hash=stable_hash(execution), owner_token=owner,
                credits=credits_required, action=action, audience=audience, conversation_id=conversation_id,
            )
        except CreditReservationError as error:
            raise HTTPException(status_code=402, detail=str(error)) from error
        except WorkflowCreditConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

        def settle(charged, agent_run_id=None):
            return runtime_store.settle_workflow_credits(
                key, client_id=request.client_id, owner_token=owner,
                charged_credits=charged, agent_run_id=agent_run_id,
            )

        meter = StrategyUsage(record=lambda attempts: runtime_store.record_workflow_credit_attempts(
            key, owner_token=owner, attempts=attempts,
        ))
        return meter, settle, replay

    @contextmanager
    def measured_workflow(meter, settle):
        try:
            with meter.activate():
                yield
        except WorkflowCreditConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except Exception:
            if settle is not None:
                settle(None)
            raise

    @app.post("/instructions/preview/strategist", dependencies=[Depends(require_runtime_token)])
    def preview_strategist(request: PreviewStrategistRequest) -> dict[str, Any]:
        validate_tenant(
            request.organization_id, request.client_id, request.contract_id,
            profile_key="growth_strategist", audience="internal_operator",
        )
        execution = {
            "organization_id": request.organization_id, "client_id": request.client_id,
            "contract_id": request.contract_id, "message": request.message, "mode": request.mode,
            "source": "strategy_admin",
            "profile_key": "growth_strategist",
        }
        selected = build_strategy_workflow_engine(runtime_store, context=execution, offline_preview=True)
        published = {
            "presales_candidate": bool(request.published_instruction or request.published_stage_instructions
                                       or request.candidate_stage or request.published_source_rules),
            "presales_instruction": request.published_instruction,
            "presales_stage_instructions": request.published_stage_instructions,
            "presales_prompt_version": request.published_prompt_version,
            "presales_source_rules": request.published_source_rules.model_dump() if request.published_source_rules else None,
            "retrieval_context": {"commercial_catalog": request.commercial_catalog},
        }
        baseline = preview_workflow(selected, {**execution, **published} if published["presales_candidate"] else execution)
        scoped_edit = {request.candidate_stage: request.candidate_instruction} if request.candidate_stage and request.candidate_instruction else {}
        candidate = preview_workflow(selected, {
            **execution, **published, "presales_candidate": True,
            "presales_instruction": request.published_instruction if request.candidate_stage else (request.candidate_instruction or request.published_instruction),
            "presales_stage_instructions": {**request.published_stage_instructions, **scoped_edit},
            **({"presales_source_rules": request.candidate_source_rules.model_dump()} if request.candidate_source_rules else {}),
        })
        return {"baseline": baseline, "candidate": candidate}

    @app.post("/instructions/preview/mission-intake", dependencies=[Depends(require_runtime_token)])
    def preview_mission_intake(request: PreviewMissionIntakeRequest) -> dict[str, Any]:
        validate_tenant(
            request.organization_id, request.client_id, request.contract_id,
            profile_key="growth_strategist", audience=request.audience,
        )
        context = request.model_dump(exclude={"candidate_adjustment", "candidate_source_rules", "candidate_source_version"})
        original = MissionConversationTurnRequestWire.model_validate(context)
        selected = build_strategy_workflow_engine(runtime_store, context=context, offline_preview=True)
        result = {"baseline": preview_workflow(selected, MissionConversationWorkflow.workflow_input(original))}
        if request.candidate_adjustment:
            try:
                candidate = MissionConversationTurnRequestWire.model_validate({
                    **context, "mission_prompt": request.candidate_adjustment.apply(original.mission_prompt),
                })
            except ValidationError as error:
                raise HTTPException(status_code=422, detail="mission_prompt_candidate_invalid") from error
            result["candidate"] = preview_workflow(selected, MissionConversationWorkflow.workflow_input(candidate))
        if request.candidate_source_rules:
            prior_version = original.mission_prompt.version if original.mission_prompt else 0
            candidate = MissionConversationTurnRequestWire.model_validate({
                **context, "mission_prompt": {
                    "version": request.candidate_source_version or prior_version + 1,
                    "instructions": original.mission_prompt.instructions if original.mission_prompt else {},
                    "source_rules": request.candidate_source_rules,
                },
            })
            result["candidate"] = preview_workflow(selected, MissionConversationWorkflow.workflow_input(candidate))
        return result

    @app.post("/instructions/preview/mission-supervisor", dependencies=[Depends(require_runtime_token)])
    def preview_supervisor(request: PreviewMissionPlanRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key="mission_supervisor")
        value = request.model_dump(exclude={"candidate_adjustment"})
        if request.proposed_plan is not None:
            raise HTTPException(status_code=400, detail="mission_supervisor_preview_requires_generation")
        try:
            selected = mission_planner(value)
            result = {"baseline": preview_mission_supervisor(selected, value)}
            if request.candidate_adjustment:
                candidate = MissionPlanRequest.model_validate({
                    **value, "mission_prompt": request.candidate_adjustment.apply(request.mission_prompt),
                })
                result["candidate"] = preview_mission_supervisor(selected, candidate.model_dump())
            return result
        except ValidationError as error:
            raise HTTPException(status_code=422, detail="mission_prompt_candidate_invalid") from error
        except MissionSupervisorError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    def governed_plan_supported(request: MissionPlanRequest) -> bool:
        return request.proposed_plan is None and not any(
            pack.key == "radar_prospecting" for pack in [request.action_pack, *request.pack_catalog]
        )

    @app.post("/missions/planning-spec", dependencies=[Depends(require_runtime_token)])
    def get_mission_planning_spec(request: MissionPlanRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key="mission_supervisor")
        if not governed_plan_supported(request) or not request.planning_budget:
            raise HTTPException(status_code=400, detail="mission_plan_spec_not_supported")
        value = request.model_dump()
        try:
            _, spec = mission_planner(value).govern_execution(value)
            return spec
        except (MissionSupervisorError, ProviderRequestError) as error:
            raise HTTPException(status_code=422, detail="mission_plan_spec_unavailable") from error

    @app.post("/missions/plan", dependencies=[Depends(require_runtime_token)])
    def create_mission_plan(
        request: MissionPlanRequest,
        pilot_usage: str | None = Header(default=None, alias="X-YUX-Mission-Pilot-Usage"),
    ) -> dict[str, Any]:
        return execute_mission_plan(request, pilot_usage)

    @app.post("/missions/plan-governed", dependencies=[Depends(require_runtime_token)])
    def create_governed_mission_plan(
        request: MissionPlanRequest,
        spec_fingerprint: str = Header(alias="X-YUX-Mission-Planning-Spec", pattern="^[a-f0-9]{64}$"),
    ) -> dict[str, Any]:
        return execute_mission_plan(request, "1", spec_fingerprint)

    def execute_mission_plan(request: MissionPlanRequest, pilot_usage: str | None, spec_fingerprint: str | None = None):
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key="mission_supervisor")
        packs = [request.action_pack, *request.pack_catalog]
        meter = StrategyUsage() if pilot_usage == "1" and not any(pack.key == "radar_prospecting" for pack in packs) else None
        value = request.model_dump()
        # The harness returns a proposal only. It never persists Action Engine
        # rows or produces an external effect.
        try:
            if spec_fingerprint is not None:
                if not meter or not governed_plan_supported(request) or not request.planning_budget:
                    raise HTTPException(status_code=400, detail="mission_plan_spec_not_supported")
                try:
                    supervisor, spec = mission_planner(value).govern_execution(value)
                except (MissionSupervisorError, ProviderRequestError) as error:
                    raise HTTPException(status_code=409, detail="mission_plan_spec_changed") from error
                estimate = value["planning_budget"].get("estimate")
                if not isinstance(estimate, dict) or spec["fingerprint"] != spec_fingerprint or spec["calls"] != estimate.get("calls"):
                    raise HTTPException(status_code=409, detail="mission_plan_spec_changed")
                meter.max_planning_attempts = spec["calls"]
            else:
                supervisor = None if request.proposed_plan is not None else mission_planner(value)
            with meter.activate() if meter else nullcontext():
                result = plan_mission(value, supervisor)
        except Exception as error:
            recognized = isinstance(error, (MissionSupervisorError, PlanningAttemptLimitExceeded))
            if not recognized and not (meter and meter.attempts):
                raise
            code = str(error) if recognized else "mission_supervisor_processing_failed"
            status_code = (503 if code == "mission_supervisor_model_unavailable" else 422) if recognized else 500
            logger.error("%s", json.dumps(mission_failure_diagnostic(
                error, stage="planning", status=status_code, context=value,
            )))
            detail = code
            if meter and meter.attempts:
                safe_code = code if re.fullmatch(r"(?:mission_supervisor|mission_plan|funnel_nurture|campaign_launch)_[a-z0-9_]{1,80}", code) else "mission_supervisor_processing_failed"
                detail = {"code": safe_code, "planningMeasurements": meter.planning_measurements()}
            raise HTTPException(status_code=status_code, detail=detail) from error
        if meter and meter.attempts:
            trace = result["trace"]
            fingerprints = {row["node"]: row["requestFingerprint"] for row in trace.get("planningMeasurements", []) if row.get("requestFingerprint")}
            measurements = meter.planning_measurements()
            for row in measurements:
                if row["node"] in fingerprints:
                    row["requestFingerprint"] = fingerprints[row["node"]]
            trace["planningMeasurements"] = measurements
        return result

    @app.post("/missions/conversations/turn", dependencies=[Depends(require_runtime_token)])
    def mission_conversation_turn(
        request: MissionConversationTurnRequestWire,
        operation_id: UUID | None = Header(default=None, alias="X-YUX-Mission-Turn-Operation"),
        pilot_usage: str | None = Header(default=None, alias="X-YUX-Mission-Pilot-Usage"),
    ) -> dict[str, Any]:
        try:
            validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key="growth_strategist", audience=request.audience)
        except HTTPException as error:
            logger.error("%s", json.dumps(mission_failure_diagnostic(
                error, stage="tenant", status=error.status_code, context=request.model_dump(),
            )))
            raise
        try:
            if operation_id and request.client_id and request.contract_id:
                workflow = conversation_workflow(request.model_dump())
                execution = workflow.prepare_turn(request)
                credits = estimate_workflow_credits(execution["workflow_spec"], execution["mode"], execution["source"])
                meter, settle, replay = begin_workflow_credits(
                    request, operation_id, execution, credits, action="agent_runtime_mission_conversation_turn",
                    audience=request.audience, conversation_id=request.conversation_id,
                )
                if replay is not None:
                    return validate_mission_conversation_response(replay, request).model_dump()
                with measured_workflow(meter, settle):
                    response = workflow.respond(request, execution=execution, measure_pilot_usage=pilot_usage == "1")
                settle(credits, agent_run_id=response.retrievalTraceId)
                return response.model_dump()
            try:
                reserve_billable_credits(
                    organization_id=request.organization_id,
                    client_id=request.client_id,
                    contract_id=request.contract_id,
                    credits=1,
                    action="agent_runtime_mission_conversation_turn",
                )
            except RuntimeError as error:
                raise HTTPException(status_code=402, detail=str(error)) from error
            workflow = conversation_workflow(request.model_dump())
            response = workflow.respond(request, measure_pilot_usage=True) if pilot_usage == "1" else workflow.respond(request)
            return response.model_dump()
        except HTTPException:
            raise
        except RequiredSourcesMissing as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except (ValidationError, ValueError, json.JSONDecodeError) as error:
            logger.error("%s", json.dumps(mission_failure_diagnostic(
                error, stage="processing", status=422, context=request.model_dump(),
            )))
            code = ("mission_conversation_output_truncated"
                    if str(error) == "mission_conversation_output_truncated"
                    else "mission_conversation_response_invalid")
            raise HTTPException(status_code=422, detail=code) from error
        except ProviderRequestError as error:
            logger.error("%s", json.dumps(mission_failure_diagnostic(
                error, stage="provider", status=503, context=request.model_dump(),
            )))
            raise HTTPException(status_code=503, detail="mission_conversation_provider_unavailable") from error
        except RuntimeError as error:
            unavailable = str(error) in (
                "agent_harness_not_configured", "agent_provider_output_required",
            ) or str(error).startswith("strategy_profile_not_configured")
            logger.error("%s", json.dumps(mission_failure_diagnostic(
                error, stage="processing", status=503 if unavailable else 500, context=request.model_dump(),
            )))
            if unavailable:
                raise HTTPException(status_code=503, detail="mission_conversation_provider_unavailable") from error
            raise
        except Exception as error:
            logger.error("%s", json.dumps(mission_failure_diagnostic(
                error, stage="processing", status=500, context=request.model_dump(),
            )))
            raise

    @app.post("/knowledge/curate", dependencies=[Depends(require_runtime_token)])
    def curate_knowledge(request: CurateKnowledgeRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key="strategy_curator", audience="internal_operator")
        total_chars = sum(len(item.body) for item in request.sections)
        if total_chars > 120_000:
            raise HTTPException(status_code=413, detail="knowledge_curation_input_too_large")
        try:
            return knowledge_curator(request.model_dump()).curate([item.model_dump() for item in request.sections])
        except ProviderRequestError as error:
            raise provider_http_exception(error) from error
        except (ValueError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.post("/strategy/curate", dependencies=[Depends(require_runtime_token)])
    def curate_strategy(request: CurateStrategyRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, profile_key="strategy_curator", audience="internal_operator")
        if sum(len(item.body) for item in request.sections) > 120_000:
            raise HTTPException(status_code=413, detail="strategy_curation_input_too_large")
        try:
            curator = strategy_curation_service or StrategyCurationService.from_env()
            if strategy_curation_service is None:
                curator.llm_client = build_routed_client(runtime_store, "strategy_curator", context=request.model_dump())
            return curator.curate([item.model_dump() for item in request.sections])
        except ProviderRequestError as error:
            raise provider_http_exception(error) from error
        except (ValueError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.post("/knowledge/extract-company-profile", dependencies=[Depends(require_runtime_token)])
    def extract_company_profile(request: ExtractCompanyProfileRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id, profile_key="strategy_curator", audience="internal_operator")
        total_chars = sum(len(item.content) for item in request.pages)
        if total_chars > 400_000:
            raise HTTPException(status_code=413, detail="website_extraction_input_too_large")
        try:
            return knowledge_curator(request.model_dump()).extract_company_profile([item.model_dump() for item in request.pages], **({'target': request.target} if request.target and request.target.get('kind') == 'represented_business' else {}))
        except ProviderRequestError as error:
            raise provider_http_exception(error) from error
        except (ValueError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        except Exception as error:
            logger.exception("Unexpected website profile extraction failure")
            raise HTTPException(status_code=502, detail="website_extraction_failed") from error

    @app.post("/jobs/process-next", dependencies=[Depends(require_runtime_token)])
    def process_next_job(worker_id: str = "api-worker") -> dict[str, Any]:
        set_internal_scope = getattr(runtime_store, "set_internal_scope", None)
        if callable(set_internal_scope):
            set_internal_scope()
        job = queue.claim_next_job(worker_id)
        if not job:
            return {"processed": False, "reason": "empty_queue"}
        payload = job.get("payload") or {}
        try:
            validate_tenant(
                job.get("organization_id"),
                job.get("client_id"),
                job.get("contract_id"),
                profile_key=str(payload.get("profile_key") or "ai_sdr_comercial_1"),
                audience="external_contact",
            )
            try:
                credits = reserve_billable_credits(
                    organization_id=job.get("organization_id"),
                    client_id=job.get("client_id"),
                    contract_id=job.get("contract_id"),
                    credits=estimate_workflow_credits(None, "conversation_turn", "whatsapp"),
                    action="agent_runtime_conversation_turn",
                )
            except RuntimeError as error:
                # Insufficient balance is terminal for the job: retrying will not help.
                runtime_store.update("agent_queue_jobs", job["id"], {"status": "dead_letter", "last_error": str(error)})
                return {"processed": False, "reason": "insufficient_credits", "job_id": job["id"]}
            result = workflow_engine({
                "organization_id": job.get("organization_id"),
                "client_id": job.get("client_id"),
                "contract_id": job.get("contract_id"),
            }).execute(
                message=str(payload.get("message") or ""),
                profile_key=str(payload.get("profile_key") or "ai_sdr_comercial_1"),
                source="whatsapp",
                organization_id=job.get("organization_id"),
                client_id=job.get("client_id"),
                contract_id=job.get("contract_id"),
                conversation_id=job.get("conversation_id"),
                assistant_id=payload.get("assistant_id"),
                mode="conversation_turn",
                autonomy_policies=payload.get("autonomy_policies"),
            )
            queue.complete_job(job["id"], result)
            return {"processed": True, "job": job, "result": result, "credits": credits}
        except Exception as error:
            queue.fail_job(job["id"], str(error))
            raise

    return app


app = create_app()
