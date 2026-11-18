import json

from yux_agent_runtime.customer_context import CustomerContextService
from yux_agent_runtime.instruction_preview import preview_workflow
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
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
