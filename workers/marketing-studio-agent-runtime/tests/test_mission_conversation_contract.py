from __future__ import annotations

import pytest
from pydantic import ValidationError

from yux_agent_runtime.mission_contracts import (
    MissionConversationTurnRequestWire,
    MissionConversationTurnResponseWire,
    validate_mission_conversation_response,
)


def request_payload() -> dict:
    return {
        "schemaVersion": 1,
        "organization_id": "org-1",
        "client_id": "client-1",
        "contract_id": "contract-1",
        "conversation_id": "conversation-1",
        "audience": "client_user",
        "user_message": "Quero criar um funil e uma sequência de e-mails.",
        "transcript": [],
        "rollingSummary": "",
        "currentBrief": {"objective": "Criar um funil comercial"},
        "operationalContext": {"allowedModules": ["crm", "automations"]},
        "allowedActionPacks": [{"key": "funnel_nurture", "version": "1.0.0", "contentHash": "a" * 64}],
        "allowedCapabilityKeys": ["crm.pipeline.create_draft", "email.template.create_draft"],
    }


def response_payload() -> dict:
    return {
        "schemaVersion": 1,
        "kind": "questions",
        "reply": "Entendi o objetivo. Preciso confirmar o público antes de preparar o plano.",
        "understood": {"objective": "Criar um funil comercial"},
        "questions": [{
            "key": "audience",
            "label": "Qual público deve entrar neste funil?",
            "whyNeeded": "O público orienta as etapas e a sequência.",
            "priority": 1,
            "answerType": "text",
            "defaultValue": "Pequenas empresas",
            "defaultSourceRef": "customer:source-1",
        }],
        "readiness": {
            "status": "needs_information",
            "knownFacts": [{"key": "offer", "value": "Consultoria", "sourceRef": "customer:source-1"}],
            "assumptions": [],
            "missing": [{
                "key": "audience",
                "category": "audience",
                "reason": "O público ainda não está explícito.",
                "requiredFor": ["funnel_nurture"],
            }],
        },
        "brief": {
            "objective": "Criar um funil comercial",
            "requestedOutcome": "funnel_nurture",
            "scopeHints": ["crm", "automations"],
            "constraints": {},
            "acceptanceCriteria": [],
            "packKeys": ["funnel_nurture"],
        },
        "suggestedActions": [{
            "key": "use_funnel_pack",
            "label": "Preparar funil e nutrição",
            "kind": "quick_reply",
            "capabilityKey": "crm.pipeline.create_draft",
            "packKey": "funnel_nurture",
            "payload": {"answer": "Pequenas empresas"},
        }],
        "sources": [{
            "ref": "customer:source-1",
            "kind": "knowledge_source",
            "id": "source-1",
            "version": "1",
            "contentHash": "b" * 64,
            "visibility": "both",
            "title": "Oferta publicada",
            "displayMode": "named",
        }],
        "retrievalTraceId": "trace-1",
        "contextHash": "c" * 64,
        "usage": {"inputTokens": 100, "outputTokens": 50, "totalTokens": 150},
    }


def test_accepts_a_grounded_conversation_turn() -> None:
    response = validate_mission_conversation_response(response_payload(), request_payload())
    assert response.kind == "questions"
    assert response.sources[0].ref == "customer:source-1"


def test_rejects_more_than_three_or_duplicate_questions() -> None:
    too_many = response_payload()
    too_many["questions"] = [
        {**too_many["questions"][0], "key": f"question-{index}"}
        for index in range(4)
    ]
    with pytest.raises(ValidationError):
        MissionConversationTurnResponseWire.model_validate(too_many)

    duplicate = response_payload()
    duplicate["questions"] = [duplicate["questions"][0], duplicate["questions"][0]]
    with pytest.raises(ValidationError, match="mission_conversation_question_keys_duplicate"):
        MissionConversationTurnResponseWire.model_validate(duplicate)


def test_rejects_unknown_source_namespace_and_ungrounded_fact() -> None:
    invalid_namespace = response_payload()
    invalid_namespace["sources"][0]["ref"] = "tool:http.any"
    with pytest.raises(ValidationError):
        MissionConversationTurnResponseWire.model_validate(invalid_namespace)

    ungrounded = response_payload()
    ungrounded["readiness"]["knownFacts"][0]["sourceRef"] = "customer:not-returned"
    with pytest.raises(ValidationError, match="mission_conversation_source_ref_missing"):
        MissionConversationTurnResponseWire.model_validate(ungrounded)


def test_rejects_ready_for_plan_with_missing_requirements() -> None:
    value = response_payload()
    value["readiness"]["status"] = "ready_for_plan"
    with pytest.raises(ValidationError, match="mission_conversation_ready_with_missing_context"):
        MissionConversationTurnResponseWire.model_validate(value)


def test_rejects_capabilities_and_packs_outside_the_request_envelope() -> None:
    capability = response_payload()
    capability["suggestedActions"][0]["capabilityKey"] = "campaign.provider.activate"
    with pytest.raises(ValueError, match="mission_conversation_capability_not_allowed"):
        validate_mission_conversation_response(capability, request_payload())

    pack = response_payload()
    pack["suggestedActions"][0]["packKey"] = "campaign_launch"
    with pytest.raises(ValueError, match="mission_conversation_pack_not_allowed"):
        validate_mission_conversation_response(pack, request_payload())


def test_rejects_hidden_reasoning_and_unknown_fields() -> None:
    value = response_payload()
    value["chainOfThought"] = "hidden reasoning"
    with pytest.raises(ValidationError):
        MissionConversationTurnResponseWire.model_validate(value)


def test_brief_confirmation_has_no_questions() -> None:
    value = response_payload()
    value["kind"] = "brief_confirmation"
    value["readiness"] = {"status": "ready_for_brief_confirmation", "knownFacts": [], "assumptions": [], "missing": []}
    with pytest.raises(ValidationError, match="mission_conversation_brief_confirmation_questions_forbidden"):
        MissionConversationTurnResponseWire.model_validate(value)


def test_request_limits_transcript_and_requires_server_audience() -> None:
    value = request_payload()
    value["transcript"] = [{"role": "user", "content": str(index)} for index in range(21)]
    with pytest.raises(ValidationError):
        MissionConversationTurnRequestWire.model_validate(value)

    value = request_payload()
    value["audience"] = "model_selected"
    with pytest.raises(ValidationError):
        MissionConversationTurnRequestWire.model_validate(value)
