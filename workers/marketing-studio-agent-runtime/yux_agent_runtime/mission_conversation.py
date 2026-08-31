from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
import json
from typing import TYPE_CHECKING, Any

from .mission_contracts import (
    MissionConversationTurnRequestWire,
    MissionConversationTurnResponseWire,
    MissionSourceRefWire,
    validate_mission_conversation_response,
)
from .trace import stable_hash

if TYPE_CHECKING:
    from .workflow import StrategyWorkflowEngine


MISSION_INTAKE_WORKFLOW_SPEC = {
    "workflow_key": "mission_intake_conversation",
    "subagent_specs": [],
    "max_subagents": 0,
    "max_retries_per_node": 0,
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _source_version(item: dict[str, Any]) -> str:
    updated_at = item.get("updated_at")
    if isinstance(updated_at, datetime):
        return str(max(1, int(updated_at.timestamp())))
    if updated_at:
        try:
            return str(max(1, int(datetime.fromisoformat(_text(updated_at).replace("Z", "+00:00")).timestamp())))
        except ValueError:
            pass
    return _text(item.get("embedding_content_hash") or item.get("version") or "1")


def _canonical_hash(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(serialized.encode("utf-8")).hexdigest()


def build_mission_source_catalog(
    retrieval_context: dict[str, Any] | None,
    audience: str,
) -> list[MissionSourceRefWire]:
    context = retrieval_context or {}
    sources: list[MissionSourceRefWire] = []
    seen: set[str] = set()
    for collection, kind in (("cards", "strategy_card"), ("chunks", "strategy_chunk")):
        for raw in context.get(collection) or []:
            if not isinstance(raw, dict) or not raw.get("id"):
                continue
            raw_id = _text(raw.get("id"))
            is_customer = raw_id.startswith("company:") or raw.get("source_scope") == "organization"
            clean_id = raw_id.split("company:", 1)[-1] if is_customer else raw_id
            ref = f"customer:{clean_id}" if is_customer else f"yux:{clean_id}"
            if ref in seen:
                continue
            seen.add(ref)
            visibility = _text(raw.get("visibility")) or ("both" if is_customer else "internal_only")
            internal_yux_for_client = not is_customer and audience == "client_user" and visibility == "internal_only"
            title = (
                "Metodologia YUX"
                if internal_yux_for_client
                else _text(raw.get("title") or raw.get("concept") or raw.get("section_key") or "Conhecimento da empresa")
            )
            sources.append(MissionSourceRefWire(
                ref=ref,
                kind="knowledge_chunk" if is_customer else kind,
                id=clean_id,
                version=_source_version(raw),
                contentHash=_canonical_hash({
                    "id": clean_id,
                    "version": _source_version(raw),
                    "content": raw.get("chunk_text") or raw.get("concept") or raw.get("title"),
                }),
                visibility=visibility,
                title=title or ("Contexto da empresa" if is_customer else "Metodologia YUX"),
                displayMode="generic" if internal_yux_for_client else "named",
            ))
    return sources


def normalize_mission_conversation_response(
    parsed: dict[str, Any],
    *,
    request: MissionConversationTurnRequestWire,
    retrieval_context: dict[str, Any] | None,
    retrieval_trace_id: str,
    provider: dict[str, Any],
) -> MissionConversationTurnResponseWire:
    source_catalog = build_mission_source_catalog(retrieval_context, request.audience)
    by_ref = {source.ref: source for source in source_catalog}
    selected_refs: list[str] = []
    for item in parsed.pop("sourceRefs", []) or []:
        selected_refs.append(_text(item.get("ref")) if isinstance(item, dict) else _text(item))
    for item in parsed.pop("sources", []) or []:
        selected_refs.append(_text(item.get("ref")) if isinstance(item, dict) else _text(item))
    readiness = parsed.get("readiness") if isinstance(parsed.get("readiness"), dict) else {}
    for fact in readiness.get("knownFacts") or []:
        if isinstance(fact, dict):
            selected_refs.append(_text(fact.get("sourceRef")))
    for assumption in readiness.get("assumptions") or []:
        if isinstance(assumption, dict) and assumption.get("sourceRef"):
            selected_refs.append(_text(assumption.get("sourceRef")))
    questions = parsed.get("questions") if isinstance(parsed.get("questions"), list) else []
    for question in questions:
        if isinstance(question, dict) and question.get("defaultSourceRef"):
            selected_refs.append(_text(question.get("defaultSourceRef")))
    unknown_refs = sorted({ref for ref in selected_refs if ref and ref not in by_ref})
    if unknown_refs:
        raise ValueError("mission_conversation_unknown_source_ref:" + ",".join(unknown_refs))
    selected = []
    for ref in selected_refs:
        if ref and ref in by_ref and ref not in {item.ref for item in selected}:
            selected.append(by_ref[ref])

    context_hash = stable_hash({
        "strategy": (retrieval_context or {}).get("retrieval_log") or {},
        "company": (retrieval_context or {}).get("company_profile") or {},
        "brandProfileId": (retrieval_context or {}).get("brand_profile_id"),
        "products": (retrieval_context or {}).get("product_profiles") or [],
        "sources": [source.model_dump() for source in source_catalog],
        "operational": request.operationalContext,
    })
    payload = {
        **parsed,
        "schemaVersion": 1,
        "sources": [source.model_dump() for source in selected],
        "retrievalTraceId": retrieval_trace_id,
        "contextHash": context_hash,
        "usage": {
            "inputTokens": int(provider.get("input_tokens") or 0),
            "outputTokens": int(provider.get("output_tokens") or 0),
            "totalTokens": int(provider.get("total_tokens") or 0),
        },
    }
    return validate_mission_conversation_response(payload, request)


@dataclass
class MissionConversationWorkflow:
    workflow_engine: "StrategyWorkflowEngine"

    def respond(
        self,
        request: dict[str, Any] | MissionConversationTurnRequestWire,
    ) -> MissionConversationTurnResponseWire:
        typed = request if isinstance(request, MissionConversationTurnRequestWire) else MissionConversationTurnRequestWire.model_validate(request)
        mission_context = {
            "audience": typed.audience,
            "rollingSummary": typed.rollingSummary,
            "transcript": [item.model_dump() for item in typed.transcript[-20:]],
            "currentBrief": typed.currentBrief,
            "operationalContext": typed.operationalContext,
            "allowedActionPacks": [item.model_dump() for item in typed.allowedActionPacks],
            "allowedCapabilityKeys": typed.allowedCapabilityKeys,
        }
        result = self.workflow_engine.execute(
            message=typed.user_message,
            profile_key="growth_strategist",
            source="mission_intake",
            organization_id=typed.organization_id,
            client_id=typed.client_id,
            contract_id=typed.contract_id,
            conversation_id=typed.conversation_id,
            mode="mission_intake",
            workflow_spec=MISSION_INTAKE_WORKFLOW_SPEC,
            retrieval_context={
                "audience": typed.audience,
                "mission_request": typed.model_dump(),
                "mission_context": mission_context,
            },
        )
        return validate_mission_conversation_response(result["synthesis"], typed)
