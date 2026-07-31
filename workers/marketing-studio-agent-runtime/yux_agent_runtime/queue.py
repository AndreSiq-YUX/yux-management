from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from .runtime_store import AgentRuntimeStore


def normalize_inbound_event(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(
        payload.get("text")
        or payload.get("body")
        or payload.get("message")
        or ((payload.get("message_data") or {}).get("text") if isinstance(payload.get("message_data"), dict) else "")
        or ""
    ).strip()
    media = payload.get("media") or payload.get("attachments") or []
    media_summary = ""
    if media:
        media_summary = f"{len(media) if isinstance(media, list) else 1} midia(s) recebida(s)"
    return {
        "content_text": text,
        "media_summary": media_summary,
        "normalized_payload": {
            "text": text,
            "media_summary": media_summary,
            "sender": payload.get("sender") or payload.get("from") or payload.get("phone"),
            "channel": payload.get("channel") or "whatsapp",
        },
    }


def event_idempotency_key(payload: dict[str, Any]) -> str:
    explicit = payload.get("idempotency_key") or payload.get("external_event_id") or payload.get("message_id")
    if explicit:
        return str(explicit)
    material = repr({
        "conversation_id": payload.get("conversation_id"),
        "sender": payload.get("sender") or payload.get("from") or payload.get("phone"),
        "text": payload.get("text") or payload.get("body") or payload.get("message"),
        "timestamp": payload.get("timestamp"),
    })
    return sha256(material.encode("utf-8")).hexdigest()


@dataclass
class AgentEventQueue:
    store: AgentRuntimeStore

    def ingest_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = normalize_inbound_event(payload)
        event = self.store.insert(
            "agent_events",
            {
                "organization_id": payload.get("organization_id"),
                "client_id": payload.get("client_id"),
                "contract_id": payload.get("contract_id"),
                "conversation_id": payload.get("conversation_id"),
                "lead_id": payload.get("lead_id"),
                "source_channel": payload.get("channel") or "whatsapp",
                "event_type": payload.get("event_type") or "message.inbound",
                "external_event_id": payload.get("external_event_id") or payload.get("message_id"),
                "inbound_message_id": payload.get("inbound_message_id"),
                "payload": payload,
                "normalized_payload": normalized["normalized_payload"],
                "content_text": normalized["content_text"],
                "media_summary": normalized["media_summary"],
                "signature_status": payload.get("signature_status") or "not_checked",
                "idempotency_key": event_idempotency_key(payload),
                "status": "received",
            },
        )
        job = self.enqueue_event(event)
        return {"event": event, "job": job}

    def enqueue_event(self, event: dict[str, Any], queue_name: str = "agent.whatsapp") -> dict[str, Any]:
        job = self.store.insert(
            "agent_queue_jobs",
            {
                "event_id": event.get("id"),
                "organization_id": event.get("organization_id"),
                "client_id": event.get("client_id"),
                "contract_id": event.get("contract_id"),
                "conversation_id": event.get("conversation_id"),
                "queue_name": queue_name,
                "job_type": "process_conversation_turn",
                "priority": 100,
                "status": "queued",
                "payload": {
                    "event_id": event.get("id"),
                    "message": event.get("content_text"),
                    "normalized_payload": event.get("normalized_payload"),
                    "source_channel": event.get("source_channel"),
                },
            },
        )
        self.store.update("agent_events", event["id"], {"status": "queued"})
        return job

    def claim_next_job(self, worker_id: str, queue_name: str = "agent.whatsapp") -> dict[str, Any] | None:
        database_claim = getattr(self.store, "claim_next_job", None)
        if callable(database_claim):
            return database_claim(worker_id, queue_name)
        jobs = sorted(
            self.store.list("agent_queue_jobs", {"status": "queued", "queue_name": queue_name}),
            key=lambda item: (int(item.get("priority") or 100), str(item.get("created_at") or "")),
        )
        if not jobs:
            return None
        job = jobs[0]
        return self.store.update(
            "agent_queue_jobs",
            job["id"],
            {
                "status": "running",
                "locked_by": worker_id,
                "attempt_count": int(job.get("attempt_count") or 0) + 1,
            },
        )

    def complete_job(self, job_id: str, result_payload: dict[str, Any]) -> dict[str, Any]:
        return self.store.update("agent_queue_jobs", job_id, {"status": "succeeded", "result_payload": result_payload})

    def fail_job(self, job_id: str, error: str) -> dict[str, Any]:
        job = self.store.list("agent_queue_jobs", {"id": job_id}, limit=1)
        current = job[0] if job else {}
        status = "dead_letter" if int(current.get("attempt_count") or 0) >= int(current.get("max_attempts") or 3) else "queued"
        return self.store.update("agent_queue_jobs", job_id, {"status": status, "last_error": error})
