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


_SUGGESTED_ACTION_LABELS = {
    "campaign.create_draft": "Criar rascunho da campanha",
    "crm.pipeline.create_draft": "Criar rascunho do funil no CRM",
    "crm.sequence.create_draft": "Criar rascunho da sequência de e-mails",
    "landing_page.create_draft": "Criar rascunho da landing page",
    "lead_form.configure_draft": "Configurar rascunho do formulário de leads",
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


def _normalize_suggested_actions(
    value: Any,
    allowed_capability_keys: list[str],
) -> list[dict[str, Any]]:
    """Expand the provider's capability-key shorthand into the strict wire shape."""
    if not isinstance(value, list):
        return []
    allowed = set(allowed_capability_keys)
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in value:
        if isinstance(raw, dict):
            action = dict(raw)
            key = _text(action.get("key"))
        else:
            capability_key = _text(raw)
            if not capability_key or capability_key not in allowed:
                continue
            key = capability_key
            action = {
                "key": key,
                "label": _SUGGESTED_ACTION_LABELS.get(
                    capability_key,
                    capability_key.replace(".", " ").replace("_", " ").capitalize(),
                ),
                "kind": "quick_reply",
                "capabilityKey": capability_key,
                "payload": {"suggestedActionKey": capability_key},
            }
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(action)
        if len(normalized) == 8:
            break
    return normalized


def _question_category(label: str) -> str:
    normalized = label.casefold()
    if any(term in normalized for term in ("orçamento", "orcamento", "investimento", "verba")):
        return "budget"
    if any(term in normalized for term in ("prazo", "data", "quando")):
        return "deadline"
    if any(term in normalized for term in ("integra", "ferramenta", "canal", "canais", "tool")):
        return "integration"
    if any(term in normalized for term in ("público", "publico", "audiência", "audiencia", "perfil", "audience")):
        return "audience"
    if any(term in normalized for term in ("oferta", "produto", "serviço", "servico")):
        return "offer"
    return "company"


def _question_answer_type(label: str) -> str:
    category = _question_category(label)
    if category == "budget":
        return "currency"
    if category == "deadline":
        return "date"
    return "text"


def _normalize_questions(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    normalized: list[dict[str, Any]] = []
    for index, raw in enumerate(value[:3], start=1):
        if isinstance(raw, dict):
            question = dict(raw)
            label = _text(question.get("label") or question.get("question"))[:1_000]
            if not label:
                continue
            priority = question.get("priority")
            if not isinstance(priority, int):
                priority = {
                    "high": 1,
                    "alta": 1,
                    "medium": 2,
                    "média": 2,
                    "media": 2,
                    "low": 3,
                    "baixa": 3,
                }.get(_text(priority).casefold(), index)
            answer_type = _text(question.get("answerType"))
            if answer_type not in {
                "text", "number", "currency", "date", "single_choice",
                "multiple_choice", "boolean",
            }:
                answer_type = _question_answer_type(label)
            question.update({
                "key": _text(question.get("key"))[:120] or f"clarification_{index}",
                "label": label,
                "whyNeeded": _text(question.get("whyNeeded"))[:1_000]
                or "Essa informação é necessária para qualificar e planejar a missão com segurança.",
                "priority": max(1, min(100, priority)),
                "answerType": answer_type,
                "choices": question.get("choices") if isinstance(question.get("choices"), list) else [],
            })
            question.pop("question", None)
            normalized.append(question)
            continue
        label = _text(raw)[:1_000]
        if not label:
            continue
        normalized.append({
            "key": f"clarification_{index}",
            "label": label,
            "whyNeeded": "Essa informação é necessária para qualificar e planejar a missão com segurança.",
            "priority": index,
            "answerType": _question_answer_type(label),
            "choices": [],
        })
    return normalized


def _normalize_readiness(value: Any, questions: list[dict[str, Any]]) -> dict[str, Any]:
    if isinstance(value, dict):
        readiness = dict(value)
        raw_missing = readiness.get("missing")
        normalized_missing: list[dict[str, Any]] = []
        if isinstance(raw_missing, list):
            for index, raw in enumerate(raw_missing[:100], start=1):
                if isinstance(raw, dict):
                    missing = dict(raw)
                    key = _text(missing.get("key")) or f"missing_{index}"
                    reason = _text(missing.get("reason")) or key.replace("_", " ")
                    category = _text(missing.get("category"))
                    if category not in {
                        "company", "brand", "offer", "audience", "budget", "deadline",
                        "integration", "permission", "consent",
                    }:
                        category = _question_category(f"{key} {reason}")
                    missing.update({
                        "key": key,
                        "category": category,
                        "reason": reason[:1_000],
                        "requiredFor": missing.get("requiredFor")
                        if isinstance(missing.get("requiredFor"), list)
                        else ["mission_planning"],
                    })
                    normalized_missing.append(missing)
                    continue
                key = _text(raw)
                if key:
                    normalized_missing.append({
                        "key": key,
                        "category": _question_category(key),
                        "reason": f"Precisamos confirmar {key.replace('_', ' ')}.",
                        "requiredFor": ["mission_planning"],
                    })
        readiness["missing"] = normalized_missing
        readiness["knownFacts"] = (
            readiness.get("knownFacts") if isinstance(readiness.get("knownFacts"), list) else []
        )
        readiness["assumptions"] = (
            readiness.get("assumptions") if isinstance(readiness.get("assumptions"), list) else []
        )
        status = _text(readiness.get("status"))
        if status not in {
            "needs_information", "needs_configuration",
            "ready_for_brief_confirmation", "ready_for_plan",
        }:
            readiness["status"] = "needs_information" if normalized_missing or questions else "ready_for_brief_confirmation"
        return readiness
    if questions:
        missing = []
        for question in questions:
            label = _text(question.get("label"))
            missing.append({
                "key": _text(question.get("key")),
                "category": _question_category(label),
                "reason": label,
                "requiredFor": ["mission_planning"],
            })
        return {
            "status": "needs_information",
            "knownFacts": [],
            "assumptions": [],
            "missing": missing,
        }
    return {
        "status": "ready_for_brief_confirmation",
        "knownFacts": [],
        "assumptions": [],
        "missing": [],
    }


def _normalize_brief(value: Any, request: MissionConversationTurnRequestWire) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    current = request.currentBrief if isinstance(request.currentBrief, dict) else {}
    summary = _text(value)
    objective = _text(current.get("objective") or request.user_message)[:8_000]
    title = _text(current.get("title")) or objective[:240]
    return {
        "title": title[:240] or None,
        "objective": objective,
        "requestedOutcome": (summary or _text(current.get("requestedOutcome")))[:240],
        "scopeHints": [],
        "constraints": {},
        "acceptanceCriteria": [],
        "packKeys": [],
        "mode": "assisted",
    }


def _normalize_provider_shape(
    parsed: dict[str, Any],
    request: MissionConversationTurnRequestWire,
) -> dict[str, Any]:
    normalized = dict(parsed)
    questions = _normalize_questions(normalized.get("questions"))
    readiness = _normalize_readiness(normalized.get("readiness"), questions)
    understood = normalized.get("understood")
    if not isinstance(understood, dict):
        understood = {"summary": _text(understood)} if _text(understood) else {}
    kind = _text(normalized.get("kind"))
    if kind not in {"message", "questions", "brief_confirmation", "blocked"}:
        kind = "questions" if questions else (
            "brief_confirmation"
            if readiness.get("status") in {"ready_for_brief_confirmation", "ready_for_plan"}
            else "message"
        )
    if kind == "questions" and not questions:
        kind = "message"
    normalized.update({
        "kind": kind,
        "understood": understood,
        "questions": questions,
        "readiness": readiness,
        "brief": _normalize_brief(normalized.get("brief"), request),
    })
    return normalized


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
    parsed = _normalize_provider_shape(parsed, request)
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
    parsed["suggestedActions"] = _normalize_suggested_actions(
        parsed.get("suggestedActions"),
        request.allowedCapabilityKeys,
    )
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
