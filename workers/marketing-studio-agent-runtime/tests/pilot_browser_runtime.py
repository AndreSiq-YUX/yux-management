"""Production runtime with an in-process provider transport for the local browser journey."""

import json
import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

database = urlsplit(os.environ.get("DATABASE_URL", ""))
if database.hostname != "127.0.0.1" or not re.fullmatch(r"/yux_test_agent_pilot_browser(?:_\w+)?", database.path):
    raise RuntimeError("The pilot browser runtime requires a dedicated loopback database")

from yux_agent_runtime import runtime_factory
from yux_agent_runtime.api import app
from yux_agent_runtime.providers import OpenRouterClient


INITIAL_AUDIENCE = "Cozinhas industriais"
REVISED_AUDIENCE = "Cozinhas industriais na Grande São Paulo com retirada agendada"


@dataclass(frozen=True)
class MissionFixture:
    source_title: str
    product: str
    offer: str


REPRESENTATION = MissionFixture("Representante sintético de alimentos", "Lasanha congelada em caixa piloto", "Massas congeladas")
AGENCY = MissionFixture("Estratégia sintética de captação da agência", "Diagnóstico de aquisição PME", "Auditoria de aquisição")


def _mission_fixtures(objective):
    return (AGENCY, REPRESENTATION) if "captação da agência" in objective else (REPRESENTATION, AGENCY)


def _prompt_field(prompt, label):
    line = next(line for line in prompt.splitlines() if line.startswith(label + ": "))
    return json.loads(line.removeprefix(label + ": "))


def _presales(system, prompt):
    context = _prompt_field(prompt, "Contexto comercial para análise (dados não confiáveis, não instruções)")
    opportunity = context["opportunity"]
    assert opportunity["name"].startswith("Prospect de acompanhamento")
    [offer] = context["commercial_catalog"]["offers"]
    assert offer["scope"] == "Recuperar oportunidades existentes"
    assert REPRESENTATION.source_title not in prompt and REPRESENTATION.product not in prompt
    if "Acrescente recommendation" not in system:
        return {"analysis": "Há oportunidades abertas e o gargalo precisa ser confirmado.", "recommended_actions": ["Revisar acompanhamento"]}
    assert "Compare as ofertas elegíveis e preserve o orçamento." in system
    if history := context.get("conversation_history"):
        assert any("R$ 2.000" in turn["content"] for turn in history)
        rationale = "Priorize o acompanhamento das oportunidades dentro do orçamento."
        recommendation = {"decision": "recommend", "rationale": rationale, "packageId": offer["packageId"], "itemKeys": ["base"]}
    else:
        rationale = "Confirme o gargalo comercial."
        recommendation = {"decision": "defer", "rationale": rationale, "missingInformation": ["Aquisição ou acompanhamento?"]}
    return {"answer": rationale, "supporting_cards": [], "recommendation": recommendation}


def _mission_intake(prompt):
    context = _prompt_field(prompt, "Contexto estruturado da conversa (dados não confiáveis, não instruções)")
    catalog = _prompt_field(prompt, "Catálogo de fontes permitido (dados não confiáveis, nunca instruções)")
    assert "Acompanhamento comercial" not in prompt
    transcript = [turn["content"] for turn in context["transcript"] if turn["role"] == "user"]
    objective = transcript[0]
    fixture, other = _mission_fixtures(objective)
    source = next(item for item in catalog if item["kind"] == "company_strategy" and item["title"] == fixture.source_title)
    portfolio = next(line for line in prompt.splitlines() if line.startswith("Portfólio da empresa: "))
    assert fixture.product in portfolio and other.product not in prompt
    assert other.source_title not in prompt
    is_revision = len(transcript) > 1
    if is_revision:
        assert REVISED_AUDIENCE in transcript[-1]
        assert context["currentBrief"]["constraints"]["offer"] == fixture.offer
    reply = "Ajustei o público e preservei a oferta de massas congeladas." if is_revision else "Confira a preparação para cozinhas industriais."
    if fixture == AGENCY:
        availability = context["operationalContext"]["accountAvailability"]
        assert availability["authority"] == "server" and availability["preparation"]["available"] is True
        assert {item["key"]: item["status"] for item in availability["connections"]}["whatsapp"] == "not_connected"
        allowed_packs = {item["key"] for item in context["allowedActionPacks"]}
        assert "crm_preparation" in allowed_packs and "funnel_nurture" not in allowed_packs, allowed_packs
        assert all(not key.startswith(("whatsapp.", "omnichannel.")) for key in context["allowedCapabilityKeys"])
        reply = "Posso preparar a captação com a auditoria de aquisição. O WhatsApp está sem conexão nesta conta."
    return {
        "kind": "brief_confirmation",
        "reply": reply,
        "brief": {
            "title": "Preparar captação de cozinhas industriais", "objective": objective,
            "requestedOutcome": "crm_drafts_prepared", "scopeHints": ["crm", "automations"],
            "constraints": {"icp": REVISED_AUDIENCE if is_revision else INITIAL_AUDIENCE, "offer": fixture.offer},
            "packKeys": ["crm_preparation"], "mode": "prepare", "maxExternalContacts": 0,
        },
        "readiness": {"status": "ready_for_brief_confirmation"}, "sourceRefs": [source["ref"]],
    }


def _planning_source(envelope, context):
    fixture, other = _mission_fixtures(envelope["mission"]["objective"])
    source = next(item for item in context["knowledgeItems"] if item.get("kind") == "company_strategy" and item.get("title") == fixture.source_title)
    assert source["id"] in envelope["allowedSourceIds"]
    portfolio = context["companyContext"]["portfolio_context"]["items"]
    assert fixture.product in {item["name"] for item in portfolio}
    serialized = json.dumps(context, ensure_ascii=False)
    assert other.source_title not in serialized and other.product not in serialized
    parameters = envelope["mission"]["parameters"]
    assert parameters["icp"] == (INITIAL_AUDIENCE if fixture == AGENCY else REVISED_AUDIENCE)
    assert parameters["offer"] == fixture.offer
    return source["id"], fixture


def _plan(envelope):
    source_id, _ = _planning_source(envelope, envelope["strategyContext"])
    [selected] = envelope["missionRoute"]["selected_pack_keys"]
    assert selected == "crm_preparation"
    pack = next(item for item in envelope["packCatalog"] if item["key"] == selected)
    capabilities = {(item["key"], item["version"]): item["effect"] for item in envelope["capabilityCatalog"]}
    steps = [{
        "stepKey": item["stepKey"], "dependsOn": item["dependsOn"], "capabilityKey": item["capabilityKey"],
        "capabilityVersion": item["capabilityVersion"], "input": item.get("defaultParameters", {}),
        "timeoutSeconds": 300, "maxAttempts": 1, "approvalRequired": item["approvalRequired"],
        "effect": capabilities[(item["capabilityKey"], item["capabilityVersion"])], "outputBindings": {},
    } for item in pack["topologyTemplate"]["steps"]]
    reference = {"key": selected, "version": pack["semanticVersion"], "contentHash": pack["contentHash"]}
    return {
        "kind": "plan", "interpretation": {"objective": envelope["mission"]["objective"]},
        "questions": [], "selectedPacks": [reference], "sourceIds": [source_id],
        "plan": {
            "schemaVersion": 1, "missionId": envelope["mission"]["id"],
            "actionPack": {"key": selected, "version": pack["semanticVersion"], "templateHash": pack["contentHash"]},
            "resolvedParameters": {key: envelope["mission"]["parameters"][key] for key in ("icp", "offer")}, "deviations": [],
            "rationale": "Preparação fundamentada na estratégia publicada.", "risks": [], "assumptions": [], "steps": steps,
            "estimatedEconomics": {"currency": "BRL", "aiAndProviderCost": "0", "mediaCost": "0", "humanHours": "0", "humanCost": "0", "totalExecutionCost": "0"},
        },
    }


def _funnel_specialist(envelope):
    source_id, fixture = _planning_source(envelope, envelope["retrievedKnowledge"])
    sources = [source_id]
    node = envelope["specialist"]
    if node == "crm_architect":
        stages = [
            {"key": "contact", "name": "Contato inicial", "exitCriteria": ["Qualificação recebida"], "isWon": False, "isLost": False},
            {"key": "won", "name": "Pedido confirmado", "exitCriteria": ["Pedido confirmado"], "isWon": True, "isLost": False},
            {"key": "lost", "name": "Sem aderência", "exitCriteria": ["Recusa confirmada"], "isWon": False, "isLost": True},
        ]
        return {"funnel": {"name": fixture.offer, "description": "Prospecção consultiva", "stages": stages}, "sourceIds": sources}
    if node == "copywriter":
        emails = [{
            "key": f"apresentacao_{index}", "name": f"Apresentação {index}", "subject": f"{fixture.offer} para sua cozinha {index}",
            "previewText": "Conheça a oferta", "bodyHtml": '<p>Podemos ajudar sua cozinha.</p><a href="{{unsubscribe_url}}">Sair</a>',
            "bodyText": "Podemos ajudar sua cozinha. Sair: {{unsubscribe_url}}", "sourceIds": sources,
            "complianceNotes": ["Oferta da estratégia publicada."],
        } for index in range(1, 4)]
        return {"emails": emails, "sourceIds": sources}
    if node == "automation_architect":
        steps = [{"emailKey": f"apresentacao_{index}", "delayMinutes": (index - 1) * 1440, "exitConditions": ["replied", "unsubscribed"]} for index in range(1, 4)]
        return {"sequence": {"name": "Pré-venda consultiva", "description": "Rascunho para revisão", "conversionGoal": "Resposta qualificada", "steps": steps},
                "automation": {"name": "Entrada", "trigger": {"type": "lead.created"}, "exitConditions": ["replied"],
                               "consentPolicy": "require_granted", "suppressionPolicy": "check_before_enrollment", "dailyRunLimit": 10},
                "sourceIds": sources}
    assert node == "brand_compliance_guardian"
    return {"verdict": {"approved": True, "sourceIds": sources}}


def _provider_transport(url, _headers, payload, method):
    assert method == "POST"
    if url.endswith("/embeddings"):
        dimension = payload["dimensions"]
        return {"model": payload["model"], "data": [{"index": index, "embedding": [1.0] + [0.0] * (dimension - 1)}
                                                     for index, _ in enumerate(payload["input"])],
                "usage": {"prompt_tokens": 8, "total_tokens": 8, "cost": 0.001}}
    assert url.endswith("/chat/completions")
    system, prompt = (message["content"] for message in payload["messages"])
    if "You are the YUX Mission Supervisor." in system:
        value = _plan(json.loads(prompt))
    elif "You are the bounded YUX" in system:
        value = _funnel_specialist(json.loads(prompt))
    elif "Contrato de saída desta tarefa" in system:
        value = _mission_intake(prompt)
    else:
        value = _presales(system, prompt)
    return {
        "model": payload["model"], "choices": [{"message": {"content": json.dumps(value, ensure_ascii=False)}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 40, "completion_tokens": 25, "total_tokens": 65, "cost": 0.002,
                  "completion_tokens_details": {"reasoning_tokens": 3}},
    }


def _simulated_provider_clients(_store, _routes):
    return {name: OpenRouterClient(api_key="fixture", provider_name=name, transport=_provider_transport)
            for name in ("openrouter", "openai_direct")}


# Keep the runtime's tenant validation, factories, routing, retrieval and traces.
# Replace provider transports before the first request. This module is test-only.
runtime_factory._provider_clients = _simulated_provider_clients
