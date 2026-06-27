from __future__ import annotations

import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .queue import AgentEventQueue
from .runtime_store import InMemoryAgentRuntimeStore
from .workflow import StrategyWorkflowEngine


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
    conversation_id: str | None = None
    assistant_id: str | None = None
    mode: str | None = None
    workflow_spec: dict[str, Any] | None = None
    retrieval_context: dict[str, Any] | None = None
    autonomy_policies: list[dict[str, Any]] = Field(default_factory=list)


def _runtime_token() -> str:
    return os.getenv("YUX_AGENT_RUNTIME_TOKEN", "")


def require_runtime_token(authorization: str | None = Header(default=None)) -> None:
    configured = _runtime_token()
    if not configured:
        return
    if authorization != f"Bearer {configured}":
        raise HTTPException(status_code=401, detail="invalid runtime token")


def create_app(store: InMemoryAgentRuntimeStore | None = None) -> FastAPI:
    app = FastAPI(title="YUX Agent Harness Runtime", version="1.0.0")
    runtime_store = store or InMemoryAgentRuntimeStore()
    queue = AgentEventQueue(runtime_store)
    engine = StrategyWorkflowEngine(runtime_store)

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "service": "yux-agent-harness-runtime"}

    @app.post("/events/ingest", dependencies=[Depends(require_runtime_token)])
    def ingest_event(request: IngestEventRequest) -> dict[str, Any]:
        payload = {**request.payload, **request.model_dump(exclude={"payload"})}
        return queue.ingest_event(payload)

    @app.post("/workflows/execute", dependencies=[Depends(require_runtime_token)])
    def execute_workflow(request: ExecuteWorkflowRequest) -> dict[str, Any]:
        return engine.execute(**request.model_dump())

    @app.post("/jobs/process-next", dependencies=[Depends(require_runtime_token)])
    def process_next_job(worker_id: str = "api-worker") -> dict[str, Any]:
        job = queue.claim_next_job(worker_id)
        if not job:
            return {"processed": False, "reason": "empty_queue"}
        payload = job.get("payload") or {}
        try:
            result = engine.execute(
                message=str(payload.get("message") or ""),
                profile_key=str(payload.get("profile_key") or "ai_sdr_comercial_1"),
                source="whatsapp",
                organization_id=job.get("organization_id"),
                client_id=job.get("client_id"),
                conversation_id=job.get("conversation_id"),
                assistant_id=payload.get("assistant_id"),
                mode="conversation_turn",
                autonomy_policies=payload.get("autonomy_policies") or [],
            )
            queue.complete_job(job["id"], result)
            return {"processed": True, "job": job, "result": result}
        except Exception as error:
            queue.fail_job(job["id"], str(error))
            raise

    return app


app = create_app()
