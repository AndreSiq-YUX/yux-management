"""Content-free diagnostics for mission conversation failures."""

from pathlib import Path
from traceback import extract_tb
from uuid import UUID
import json

from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError

from . import mission_contracts


_WIRE_FIELDS = {"body"} | {
    field
    for model in vars(mission_contracts).values()
    if isinstance(model, type) and issubclass(model, BaseModel)
    for field in model.model_fields
}
_CONTRACT_CODES = {
    "mission_conversation_unknown_source_ref",
    "mission_conversation_usage_total_invalid",
    "mission_source_governed_identity_incomplete",
    "mission_memory_governed_identity_forbidden",
    "mission_conversation_ready_with_missing_context",
    "mission_conversation_question_keys_duplicate",
    "mission_conversation_action_keys_duplicate",
    "mission_conversation_questions_required",
    "mission_conversation_brief_confirmation_questions_forbidden",
    "mission_conversation_source_ref_missing",
    "mission_conversation_capability_not_allowed",
    "mission_conversation_pack_not_allowed",
}


def _contract_code(error) -> str | None:
    # An unknown source reference can contain arbitrary model text. Only the
    # exact, known code before the separator is diagnostic, never that text.
    code = str(error).split(":", 1)[0]
    return code if code in _CONTRACT_CODES else None


def mission_failure_diagnostic(error, *, stage: str, status: int, context=None) -> dict:
    diagnostic = {
        "event": "mission_conversation_failed",
        "stage": stage,
        "status": status,
        "exception_type": type(error).__name__,
    }
    for field in ("organization_id", "conversation_id"):
        value = (context or {}).get(field)
        if isinstance(value, str):
            try:
                diagnostic[field] = str(UUID(value))
            except ValueError:
                pass

    if isinstance(error, (ValidationError, RequestValidationError)):
        errors = error.errors()
        diagnostic["code"] = "request_validation_failed" if stage == "request" else "response_validation_failed"
        diagnostic["error_count"] = len(errors)
        diagnostic["validation_errors"] = [
            {
                "type": item["type"],
                "location": [part if isinstance(part, int) or part in _WIRE_FIELDS else "[field]"
                             for part in item.get("loc", ())][:12],
                **({"code": code} if (code := _contract_code((item.get("ctx") or {}).get("error", ""))) else {}),
            }
            for item in errors[:25]
        ]
    elif isinstance(error, json.JSONDecodeError):
        diagnostic.update(code="invalid_json", line=error.lineno, column=error.colno)
    else:
        diagnostic["code"] = _contract_code(error) or "mission_processing_failed"

    # No exception message, source text, stack locals, request body, provider
    # headers, credentials or model output is copied into the log.
    diagnostic["frames"] = [
        {"file": Path(frame.filename).name, "line": frame.lineno, "function": frame.name}
        for frame in extract_tb(error.__traceback__)[-8:]
    ]
    return diagnostic
