import json
import pytest

from yux_agent_runtime.customer_context import CustomerContextService
from yux_agent_runtime.instruction_preview import preview_workflow
from yux_agent_runtime.mission_contracts import MissionConversationTurnRequestWire
from yux_agent_runtime.mission_conversation import MissionConversationWorkflow
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.source_rules import RequiredSourcesMissing
from yux_agent_runtime.trace import stable_hash
from yux_agent_runtime.workflow import estimate_workflow_credits

import test_live_workflows


def execution(subagents):
    return {
        "source": "strategy_admin", "profile_key": "growth_strategist", "mode": "diagnostic_48h",
        "message": "Qual pacote faz sentido?", "presales_candidate": True,
        "workflow_spec": {"workflow_key": "diagnostic_48h", "subagent_specs": subagents},
        "retrieval_context": {
            "cards": [{"id": "approved", "concept": "Confirmar condições."}, {"id": "unused", "concept": "Outra hipótese."}],
            "conversation_history": [{"content": "Orçamento de R$ 4.000."}],
        },
    }


def test_presales_synthesis_uses_late_constraints_and_only_verified_source_ids():
    constraint = "Adiar aquisição até confirmar a capacidade de atendimento."
    engine, calls = test_live_workflows.LiveWorkflowTest().make_engine([
        json.dumps({"analysis": "Análise inicial. " * 40 + constraint, "recommended_actions": ["Verificar CRM"],
                    "constraints": [constraint], "evidence_ids": ["approved", "invented"]}),
        json.dumps({"answer": "Confirmar atendimento.", "supporting_cards": ["approved", "invented"]}),
    ])
    result = engine.execute(**execution([{"key": "finance", "objective": "Avalie o orçamento."}]))
    staged = calls[-1]["messages"]
    assert constraint in staged[1]["content"]
    assert constraint not in staged[0]["content"]
    assert "R$ 4.000" in staged[1]["content"]
    assert result["synthesis"]["supporting_cards"] == ["approved"]
    assert result["subagents"][0]["evidence_ids"] == ["approved"]
    assert result["subagents"][0]["verification"]["status"] == "skipped"


def test_preview_and_real_adapter_share_messages_without_persisting_preview():
    engine, calls = test_live_workflows.LiveWorkflowTest().make_engine([json.dumps({"answer": "Simulação", "supporting_cards": []})])
    frozen = execution([])
    preview = preview_workflow(engine, frozen)
    assert calls == []
    assert engine.store.tables == {}
    engine.execute(**frozen)
    sent = calls[0]
    stage = preview["requests"][0]
    assert stage["providerPayload"] == {key: value for key, value in sent.items() if key != "session_id"}
    assert stage["providerFingerprint"] == stable_hash(stage["providerPayload"])
    assert stage["fingerprint"] == stable_hash(stage["request"])
    assert estimate_workflow_credits(frozen["workflow_spec"], frozen["mode"], frozen["source"]) == 1


def test_named_presales_instruction_changes_one_stage_and_preserves_protected_objective():
    engine, calls = test_live_workflows.LiveWorkflowTest().make_engine([
        json.dumps({"analysis": "Revisar capacidade de entrega.", "recommended_actions": []}),
        json.dumps({"answer": "Confirmar restrições operacionais.", "supporting_cards": []}),
    ])
    frozen = execution([{"key": "finance", "objective": "Avalie o orçamento."}])
    baseline = preview_workflow(engine, frozen)
    scope = {**frozen, "presales_stage_instructions": {"finance": "Considere a capacidade de entrega."},
             "presales_prompt_version": 7}
    compared = preview_workflow(engine, scope)
    assert not calls
    assert not engine.store.tables
    first, last = compared["requests"]
    assert first["stage"] == "finance"
    assert first["stageInstructionApplied"]
    assert first["versions"]["organization"] == 7
    assert first["providerFingerprint"] != baseline["requests"][0]["providerFingerprint"]
    assert last["providerFingerprint"] == baseline["requests"][1]["providerFingerprint"]
    system, context = first["request"]["messages"]
    assert system["content"].index("Avalie o orçamento.") < system["content"].index("Considere a capacidade de entrega.")
    assert "Considere a capacidade de entrega." not in context["content"]

    engine.execute(**scope)
    assert first["providerPayload"] == {key: value for key, value in calls[0].items() if key != "session_id"}
    traces = [item["safe_context"] for item in engine.store.list("agent_context_snapshots") if item["context_kind"] == "runtime"]
    assert {trace["stage"]: trace["stage_instruction_applied"] for trace in traces} == {"finance": True, "synthesizer": False}
    assert all(trace["organization_prompt_version"] == 7 for trace in traces)


def test_mission_conversation_adjustment_stays_in_protected_system_context():
    engine, calls = test_live_workflows.LiveWorkflowTest().make_engine([
        json.dumps({"kind": "message", "reply": "Vamos conferir o contexto.", "readiness": {"status": "needs_information"}}),
    ])
    workflow = MissionConversationWorkflow(engine)
    instruction = "Priorize a pergunta sobre as regiões atendidas."
    turn = MissionConversationTurnRequestWire.model_validate({
        "schemaVersion": 1, "organization_id": "empresa-a", "conversation_id": "fixture",
        "audience": "client_user", "user_message": "Quero preparar a prospecção.",
        "mission_prompt": {"version": 2, "instructions": {"synthesizer": instruction}},
    })
    execution = workflow.prepare_turn(turn)
    assert "mission_prompt" not in execution["retrieval_context"]["mission_request"]
    stage = preview_workflow(engine, execution)["requests"][0]
    assert not calls
    assert stage["stageInstructionApplied"]
    assert stage["versions"]["organization"] == 2
    system, context = stage["request"]["messages"]
    assert system["content"].index("Contrato de saída") < system["content"].index(instruction)
    assert instruction not in context["content"]
    response = workflow.respond(turn, execution=execution).model_dump()
    assert "mission_prompt" not in response
    assert stage["providerPayload"] == {key: value for key, value in calls[0].items() if key != "session_id"}


def test_mission_portfolio_excludes_other_contracts_and_accounts():
    def product(record_id, org, contract, label):
        return {"id": record_id, "organization_id": org, "contract_id": contract,
                "status": "active", "name": label}

    store = InMemoryAgentRuntimeStore({"marketing_products_services": [
        product("item-a", "company-a", "contract-a", "Oferta A"),
        product("item-b", "company-a", "contract-b", "Oferta B"),
        product("item-c", "company-b", "contract-c", "Oferta C"),
    ]})
    service = CustomerContextService(store)
    scope = dict(organization_id="company-a", profile_key="growth_strategist", audience="client_user",
                 query="oferta", scoped_workflow_key="mission_intake_conversation")
    def items(contract):
        return service.retrieve(**scope, contract_id=contract)["portfolio_context"]["items"]

    assert [item["name"] for item in items("contract-a")] == ["Oferta A"]
    assert [item["name"] for item in items("contract-b")] == ["Oferta B"]
    assert items(None) == []


def test_source_rules_filter_before_generation_and_block_without_a_required_source():
    engine, calls = test_live_workflows.LiveWorkflowTest().make_engine([
        json.dumps({"answer": "Simulação", "supporting_cards": ["approved"]}),
    ])
    frozen = execution([])
    frozen["retrieval_context"].update(
        chunks=[{"id": "company:document", "chunk_text": "REGRA-DO-DOCUMENTO"}],
        knowledge_snippets=["REGRA-DO-DOCUMENTO"],
        company_strategy_context={"selected": [{"revisionId": "not-allowed", "revisionNumber": 1, "summary": "ESTRATÉGIA-VEDADA"}]},
        company_strategy_sources=[],
        portfolio_context={"items": [{"id": "product", "name": "PRODUTO-VEDADO"}]},
    )
    rules = dict(methodology="required", company_strategy="forbidden", company_documents="forbidden", portfolio="forbidden")
    configured = {**frozen, "presales_source_rules": rules, "presales_prompt_version": 3}
    preview = preview_workflow(engine, configured)
    assert not calls
    assert preview["sourcePolicy"]["counts"] == dict(methodology=2, company_strategy=0, company_documents=0, portfolio=0)
    content = preview["requests"][0]["request"]["messages"][1]["content"]
    assert "Confirmar condições." in content
    assert not any(value in content for value in ["REGRA-DO-DOCUMENTO", "ESTRATÉGIA-VEDADA", "PRODUTO-VEDADO"])
    assert "R$ 4.000" in content
    engine.execute(**configured)
    assert preview["requests"][0]["providerPayload"] == {key: value for key, value in calls[0].items() if key != "session_id"}

    missing = {**configured, "presales_source_rules": {**rules, "company_strategy": "required"},
               "retrieval_context": {**frozen["retrieval_context"], "company_strategy_context": {}}}
    assert preview_workflow(engine, missing)["requests"] == []
    with pytest.raises(RequiredSourcesMissing) as failure:
        engine.execute(**missing)
    assert failure.value.report["missing"] == ["company_strategy"]
    assert len(calls) == 1

    turn = MissionConversationTurnRequestWire.model_validate({
        "schemaVersion": 1, "organization_id": "empresa-a", "conversation_id": "fixture",
        "audience": "client_user", "user_message": "Quero preparar a prospecção.",
        "mission_prompt": {"version": 1, "instructions": {}, "source_rules": {
            **rules, "methodology": "optional", "company_documents": "required",
        }},
    })
    intake = MissionConversationWorkflow(engine)
    intake_preview = preview_workflow(engine, intake.prepare_turn(turn))
    assert intake_preview["requests"] == []
    assert intake_preview["sourcePolicy"]["missing"] == ["company_documents"]
    assert len(calls) == 1
