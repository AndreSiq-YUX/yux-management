from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, ValidationError

from .queue import AgentEventQueue
from .knowledge_intelligence import KnowledgeIntelligenceService
from .providers import ProviderRequestError
from .runtime_factory import build_mission_supervisor, build_strategy_workflow_engine
from .runtime_store import AgentRuntimeStore, InMemoryAgentRuntimeStore, PostgresAgentRuntimeStore
from .mission import MissionPlanRequest, plan_mission
from .mission_supervisor import MissionSupervisor, MissionSupervisorError
from .mission_contracts import MissionConversationTurnRequestWire
from .mission_conversation import MissionConversationWorkflow
from .workflow import StrategyWorkflowEngine, estimate_workflow_credits


logger = logging.getLogger(__name__)


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
    # Accepted for backward compatibility but ignored: credits are always
    # estimated server-side (see workflow.estimate_workflow_credits).
    estimated_credits: int = Field(default=0, ge=0)


class KnowledgeSectionRequest(BaseModel):
    locator: str
    heading: str | None = None
    body: str


class CurateKnowledgeRequest(BaseModel):
    organization_id: str
    client_id: str | None = None
    contract_id: str | None = None
    sections: list[KnowledgeSectionRequest] = Field(min_length=1, max_length=80)


class WebsitePageRequest(BaseModel):
    url: str
    title: str | None = None
    content: str


class ExtractCompanyProfileRequest(BaseModel):
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
    mission_supervisor: MissionSupervisor | None = None,
    mission_conversation_workflow: MissionConversationWorkflow | None = None,
) -> FastAPI:
    if not _runtime_token():
        raise RuntimeError("YUX_AGENT_RUNTIME_TOKEN is required")
    app = FastAPI(title="YUX Agent Harness Runtime", version="1.0.0")
    runtime_store = store or PostgresAgentRuntimeStore()
    queue = AgentEventQueue(runtime_store)
    # Tests may inject an isolated store. Production configuration is loaded
    # lazily from Postgres so health checks do not depend on OpenRouter or RAG.
    engine: StrategyWorkflowEngine | None = StrategyWorkflowEngine(runtime_store) if store is not None else None
    curator = knowledge_service or KnowledgeIntelligenceService.from_env()
    supervisor = mission_supervisor
    conversation = mission_conversation_workflow

    def workflow_engine() -> StrategyWorkflowEngine:
        nonlocal engine
        if engine is None:
            engine = build_strategy_workflow_engine(runtime_store)
        return engine

    def mission_planner() -> MissionSupervisor:
        nonlocal supervisor
        if supervisor is None:
            supervisor = build_mission_supervisor(runtime_store)
        return supervisor

    def conversation_workflow() -> MissionConversationWorkflow:
        nonlocal conversation
        if conversation is None:
            conversation = MissionConversationWorkflow(workflow_engine())
        return conversation

    def validate_tenant(organization_id: str | None, client_id: str | None = None, contract_id: str | None = None) -> None:
        if not organization_id:
            raise HTTPException(status_code=422, detail="organization_id is required")
        checker = getattr(runtime_store, "validate_tenant", None)
        if callable(checker) and not checker(organization_id, client_id, contract_id):
            raise HTTPException(status_code=403, detail="invalid tenant context")

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

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "service": "yux-agent-harness-runtime"}

    @app.post("/events/ingest", dependencies=[Depends(require_runtime_token)])
    def ingest_event(request: IngestEventRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id)
        payload = {**request.payload, **request.model_dump(exclude={"payload"})}
        return queue.ingest_event(payload)

    @app.post("/workflows/execute", dependencies=[Depends(require_runtime_token)])
    def execute_workflow(request: ExecuteWorkflowRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id)
        credits_required = estimate_workflow_credits(request.workflow_spec, request.mode, request.source)
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
        result = workflow_engine().execute(**request.model_dump(exclude={"estimated_credits"}))
        return {**result, "credits": credits}

    @app.post("/missions/plan", dependencies=[Depends(require_runtime_token)])
    def create_mission_plan(request: MissionPlanRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id)
        # The harness returns a proposal only. It never persists Action Engine
        # rows or produces an external effect.
        try:
            return plan_mission(
                request.model_dump(),
                None if request.proposed_plan is not None else mission_planner(),
            )
        except MissionSupervisorError as error:
            status_code = 503 if str(error) == "mission_supervisor_model_unavailable" else 422
            raise HTTPException(status_code=status_code, detail=str(error)) from error

    @app.post("/missions/conversations/turn", dependencies=[Depends(require_runtime_token)])
    def mission_conversation_turn(request: MissionConversationTurnRequestWire) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id)
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
        try:
            response = conversation_workflow().respond(request)
            return response.model_dump()
        except (ValidationError, ValueError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except ProviderRequestError as error:
            raise HTTPException(status_code=503, detail="mission_conversation_provider_unavailable") from error
        except RuntimeError as error:
            if str(error) in (
                "agent_harness_not_configured",
                "agent_provider_output_required",
            ) or str(error).startswith("strategy_profile_not_configured"):
                raise HTTPException(status_code=503, detail="mission_conversation_provider_unavailable") from error
            raise

    @app.post("/knowledge/curate", dependencies=[Depends(require_runtime_token)])
    def curate_knowledge(request: CurateKnowledgeRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id)
        total_chars = sum(len(item.body) for item in request.sections)
        if total_chars > 120_000:
            raise HTTPException(status_code=413, detail="knowledge_curation_input_too_large")
        try:
            return curator.curate([item.model_dump() for item in request.sections])
        except (ProviderRequestError, ValueError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.post("/knowledge/extract-company-profile", dependencies=[Depends(require_runtime_token)])
    def extract_company_profile(request: ExtractCompanyProfileRequest) -> dict[str, Any]:
        validate_tenant(request.organization_id, request.client_id, request.contract_id)
        total_chars = sum(len(item.content) for item in request.pages)
        if total_chars > 400_000:
            raise HTTPException(status_code=413, detail="website_extraction_input_too_large")
        try:
            return curator.extract_company_profile([item.model_dump() for item in request.pages])
        except (ProviderRequestError, ValueError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        except Exception as error:
            logger.exception("Unexpected website profile extraction failure")
            raise HTTPException(status_code=502, detail="website_extraction_failed") from error

    @app.post("/jobs/process-next", dependencies=[Depends(require_runtime_token)])
    def process_next_job(worker_id: str = "api-worker") -> dict[str, Any]:
        job = queue.claim_next_job(worker_id)
        if not job:
            return {"processed": False, "reason": "empty_queue"}
        payload = job.get("payload") or {}
        try:
            validate_tenant(job.get("organization_id"), job.get("client_id"), job.get("contract_id"))
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
            result = workflow_engine().execute(
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
