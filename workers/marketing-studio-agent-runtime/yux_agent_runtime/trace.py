from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from time import perf_counter
from typing import Any

from .runtime_store import AgentRuntimeStore


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def stable_hash(payload: Any) -> str:
    return sha256(repr(_sort_nested(payload)).encode("utf-8")).hexdigest()


_CONTENT_KEYS = {"message", "body", "content", "content_text", "user_input", "text"}
_SECRET_KEYS = {"authorization", "api_key", "apikey", "access_token", "refresh_token", "secret", "token", "credential", "password", "cookie"}


def _redact_text(value: str) -> str:
    import re

    value = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[email redacted]", value, flags=re.IGNORECASE)
    value = re.sub(r"(?<!\w)\+?\d[\d\s().-]{7,}\d", "[phone redacted]", value)
    value = re.sub(r"\bBearer\s+\S+", "Bearer [secret redacted]", value, flags=re.IGNORECASE)
    return re.sub(r"\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+", "[secret redacted]", value, flags=re.IGNORECASE)


def sanitize_trace_payload(value: Any, key: str = "") -> Any:
    if key.lower() in _SECRET_KEYS:
        return "[secret redacted]"
    if isinstance(value, dict):
        return {str(item_key): sanitize_trace_payload(item_value, str(item_key)) for item_key, item_value in value.items()}
    if isinstance(value, list):
        return [sanitize_trace_payload(item, key) for item in value]
    if isinstance(value, str):
        redacted = _redact_text(value)
        if key.lower() in _CONTENT_KEYS:
            return {"preview": redacted[:240], "content_hash": sha256(value.encode("utf-8")).hexdigest()}
        return redacted[:240]
    return value


def _sort_nested(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _sort_nested(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_sort_nested(item) for item in value]
    return value


@dataclass
class TraceRecorder:
    store: AgentRuntimeStore

    def start_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.store.insert(
            "agent_execution_runs",
            {
                "status": "running",
                "started_at": now_iso(),
                "input_payload": sanitize_trace_payload(payload.get("input_payload") or {}),
                "output_payload": {},
                **payload,
            },
        )

    def complete_run(self, run_id: str, status: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = payload or {}
        return self.store.update(
            "agent_execution_runs",
            run_id,
            {
                "status": status,
                "completed_at": now_iso(),
                **payload,
            },
        )

    def step(self, run_id: str, step_key: str, step_type: str, input_payload: dict[str, Any] | None = None):
        return TraceStep(self, run_id, step_key, step_type, input_payload or {})

    def record_step(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.store.insert("agent_execution_steps", payload)

    def record_context(
        self,
        *,
        run_id: str,
        profile_key: str,
        context_kind: str,
        safe_context: dict[str, Any],
        step_id: str | None = None,
        card_ids: list[str] | None = None,
        chunk_ids: list[str] | None = None,
        asset_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        return self.store.insert(
            "agent_context_snapshots",
            {
                "run_id": run_id,
                "step_id": step_id,
                "profile_key": profile_key,
                "context_kind": context_kind,
                "safe_context": sanitize_trace_payload(safe_context),
                "card_ids": card_ids or [],
                "chunk_ids": chunk_ids or [],
                "asset_ids": asset_ids or [],
                "context_hash": stable_hash(safe_context),
                "token_estimate": max(1, len(str(safe_context)) // 4) if safe_context else 0,
            },
        )

    def record_verification(
        self,
        *,
        run_id: str,
        verifier_key: str,
        status: str,
        score: float,
        rubric: dict[str, Any],
        findings: list[dict[str, Any]] | None = None,
        step_id: str | None = None,
        retry_recommended: bool = False,
        follow_up_prompt: str = "",
    ) -> dict[str, Any]:
        return self.store.insert(
            "agent_verification_results",
            {
                "run_id": run_id,
                "step_id": step_id,
                "verifier_key": verifier_key,
                "status": status,
                "score": score,
                "rubric": rubric,
                "findings": findings or [],
                "retry_recommended": retry_recommended,
                "follow_up_prompt": follow_up_prompt,
            },
        )

    def record_learning_signal(
        self,
        *,
        run_id: str,
        organization_id: str | None,
        profile_key: str,
        signal_type: str,
        target_type: str,
        signal_score: float,
        confidence: float,
        evidence: dict[str, Any],
        target_id: str | None = None,
    ) -> dict[str, Any]:
        return self.store.insert(
            "agent_learning_signals",
            {
                "run_id": run_id,
                "organization_id": organization_id,
                "profile_key": profile_key,
                "signal_type": signal_type,
                "target_type": target_type,
                "target_id": target_id,
                "signal_score": signal_score,
                "confidence": confidence,
                "evidence": evidence,
                "aggregation_window": "event",
            },
        )

    def recommend_improvement(
        self,
        *,
        organization_id: str | None,
        profile_key: str,
        recommendation_type: str,
        title: str,
        rationale: str,
        proposed_change: dict[str, Any],
        created_by_run_id: str | None = None,
        risk_level: str = "medium",
    ) -> dict[str, Any]:
        return self.store.insert(
            "agent_improvement_recommendations",
            {
                "organization_id": organization_id,
                "profile_key": profile_key,
                "recommendation_type": recommendation_type,
                "title": title,
                "rationale": rationale,
                "proposed_change": proposed_change,
                "status": "proposed",
                "risk_level": risk_level,
                "created_by_run_id": created_by_run_id,
            },
        )


class TraceStep:
    def __init__(self, recorder: TraceRecorder, run_id: str, step_key: str, step_type: str, input_payload: dict[str, Any]):
        self.recorder = recorder
        self.run_id = run_id
        self.step_key = step_key
        self.step_type = step_type
        self.input_payload = input_payload
        self.started = perf_counter()
        self.started_at = now_iso()
        self.record: dict[str, Any] | None = None

    def __enter__(self) -> "TraceStep":
        self.record = self.recorder.record_step(
            {
                "run_id": self.run_id,
                "step_key": self.step_key,
                "step_type": self.step_type,
                "status": "running",
                "input_payload": sanitize_trace_payload(self.input_payload),
                "started_at": self.started_at,
            }
        )
        return self

    def succeed(self, output_payload: dict[str, Any] | None = None, decision: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._finish("succeeded", output_payload or {}, decision or {})

    def fail(self, error_message: str, output_payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._finish("failed", output_payload or {"error": error_message}, {"error": error_message})

    def block(self, reason: str, output_payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._finish("blocked", output_payload or {"reason": reason}, {"reason": reason})

    def _finish(self, status: str, output_payload: dict[str, Any], decision: dict[str, Any]) -> dict[str, Any]:
        if not self.record:
            raise RuntimeError("trace_step_not_started")
        latency_ms = int((perf_counter() - self.started) * 1000)
        return self.recorder.store.update(
            "agent_execution_steps",
            self.record["id"],
            {
                "status": status,
                "output_payload": sanitize_trace_payload(output_payload),
                "decision": sanitize_trace_payload(decision),
                "latency_ms": latency_ms,
                "completed_at": now_iso(),
            },
        )

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc is not None:
            self.fail(str(exc))
        return False
