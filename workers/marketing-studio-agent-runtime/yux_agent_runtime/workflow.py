from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .autonomy import resolve_autonomy_policy
from .harness import Harness
from .radar import RadarCompanyInput, build_radar_workflow_spec, synthesize_radar_output
from .runtime_store import AgentRuntimeStore
from .trace import TraceRecorder, stable_hash


DEFAULT_SUBAGENTS = [
    {
        "key": "crm_pipeline_analyst",
        "profile_key": "crm_controller",
        "objective": "Avaliar funil, follow-up, oportunidades paradas e proximas acoes.",
        "required_terms": ["crm", "follow-up", "proximo passo"],
    },
    {
        "key": "cash_metrics_analyst",
        "profile_key": "metrics_cash_mroi",
        "objective": "Avaliar caixa, CAC, ticket, LTV, margem e prioridade financeira.",
        "required_terms": ["caixa", "metric", "prioridade"],
    },
    {
        "key": "offer_conversion_analyst",
        "profile_key": "offer_conversion",
        "objective": "Avaliar oferta, objecoes, argumentos e conversao.",
        "required_terms": ["oferta", "objec", "convers"],
    },
    {
        "key": "risk_auditor",
        "profile_key": "growth_strategist",
        "objective": "Auditar riscos, premissas, acao sensivel e o que nao recomendar agora.",
        "required_terms": ["risco", "premissa", "aprova"],
    },
]


WORKFLOW_BY_MODE = {
    "diagnostic_48h": "diagnostic_48h",
    "initial_analysis": "diagnostic_48h",
    "service_plan": "diagnostic_48h",
    "proposal": "proposal_consultative",
    "roadmap_30_60_90": "diagnostic_48h",
    "do_not_do": "diagnostic_48h",
    "commercial_radar_local_niche": "commercial_radar_local_niche",
}


def _string(value: Any) -> str:
    return str(value or "").strip()


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return []


def choose_workflow_key(mode: str | None, source: str) -> str:
    if source == "whatsapp":
        return "whatsapp_conversation_turn"
    return WORKFLOW_BY_MODE.get(mode or "", "diagnostic_48h")


def classify_intent_and_stage(message: str, source: str = "strategy_admin") -> dict[str, Any]:
    text = message.lower()
    if any(term in text for term in ("preco", "proposta", "orcamento", "orçamento")):
        intent = "proposal_follow_up"
        stage = "almost_customer"
    elif any(term in text for term in ("suporte", "erro", "problema tecnico", "bug")):
        intent = "support"
        stage = "first_purchase_customer"
    elif any(term in text for term in ("recuper", "reativ", "perdido", "ex-cliente")):
        intent = "revenue_recovery"
        stage = "non_customer"
    elif any(term in text for term in ("diagnostico", "diagnóstico", "analise", "análise", "roadmap")):
        intent = "strategic_diagnosis"
        stage = "raised_hand"
    else:
        intent = "qualification" if source == "whatsapp" else "strategic_diagnosis"
        stage = "lead" if source == "whatsapp" else "raised_hand"
    risk = "high" if any(term in text for term in ("desconto", "contrato", "garantia", "promessa")) else "medium"
    return {"intent_key": intent, "stage_key": stage, "risk_level": risk, "confidence": 0.78}


def build_workflow_plan(workflow_spec: dict[str, Any] | None, classification: dict[str, Any], max_subagents: int | None = None) -> dict[str, Any]:
    configured = _as_list((workflow_spec or {}).get("subagent_specs"))
    subagents = configured or DEFAULT_SUBAGENTS
    limit = max_subagents if max_subagents is not None else int((workflow_spec or {}).get("max_subagents") or len(subagents))
    selected = [dict(item) for item in subagents[: max(0, limit)]]
    return {
        "workflow_key": (workflow_spec or {}).get("workflow_key") or "diagnostic_48h",
        "classification": classification,
        "subagents": selected,
        "requires_subagents": bool(selected),
        "max_retries_per_node": int((workflow_spec or {}).get("max_retries_per_node") or 1),
    }


def verify_output(output: dict[str, Any], rubric: dict[str, Any] | None = None, required_terms: list[str] | None = None) -> dict[str, Any]:
    text = str(output)
    terms = required_terms or _as_list((rubric or {}).get("required_terms"))
    matched = [term for term in terms if term.lower() in text.lower()]
    score = 1.0 if not terms else len(matched) / len(terms)
    passed = score >= float((rubric or {}).get("minimum_score", 0.66))
    return {
        "status": "passed" if passed else "failed",
        "score": score,
        "findings": [] if passed else [{"severity": "warning", "message": "Output nao cobriu todos os criterios da rubrica.", "missing_terms": [term for term in terms if term not in matched]}],
        "retry_recommended": not passed,
        "follow_up_prompt": "" if passed else "Refaca a analise cobrindo explicitamente os criterios ausentes.",
    }


def synthesize_workflow_result(message: str, plan: dict[str, Any], subagent_outputs: list[dict[str, Any]], retrieval_context: dict[str, Any] | None = None) -> dict[str, Any]:
    cards = _as_list((retrieval_context or {}).get("cards"))
    actions = []
    for item in subagent_outputs:
        actions.extend(_as_list(item.get("recommended_actions")))
    if not actions:
        actions = [
            "Mapear estagio comercial e proxima acao por contato.",
            "Priorizar oportunidades de caixa antes de aquisicao fria.",
            "Criar tarefa de follow-up com responsavel, prazo e metrica.",
        ]
    return {
        "summary": "Analise estruturada pela YUX Agent Harness.",
        "workflow_key": plan["workflow_key"],
        "classification": plan["classification"],
        "answer": "\n".join(
            [
                "Diagnostico inicial:",
                f"- Intencao: {plan['classification'].get('intent_key')}",
                f"- Estagio: {plan['classification'].get('stage_key')}",
                f"- Risco: {plan['classification'].get('risk_level')}",
                "",
                "Acoes recomendadas:",
                *[f"- {action}" for action in actions[:6]],
            ]
        ),
        "recommended_actions": actions[:6],
        "supporting_cards": [card.get("id") for card in cards if isinstance(card, dict) and card.get("id")],
        "input_hash": stable_hash({"message": message, "plan": plan}),
    }


def synthesize_radar_workflow_result(message: str, plan: dict[str, Any], subagent_outputs: list[dict[str, Any]], retrieval_context: dict[str, Any] | None = None) -> dict[str, Any]:
    cards = _as_list((retrieval_context or {}).get("cards"))
    chunks = _as_list((retrieval_context or {}).get("chunks"))
    company = RadarCompanyInput(
        name=_string((retrieval_context or {}).get("company_name")) or "oportunidade Radar",
        segment=_string((retrieval_context or {}).get("segment")),
        city=_string((retrieval_context or {}).get("city")),
        state=_string((retrieval_context or {}).get("state")),
        website_url=_string((retrieval_context or {}).get("website_url")),
        channels=tuple(str(item) for item in _as_list((retrieval_context or {}).get("channels"))),
        evidence=tuple(
            str(item.get("title") or item.get("content") or item.get("id"))
            for item in chunks + cards
            if isinstance(item, dict) and (item.get("title") or item.get("content") or item.get("id"))
        ),
    )
    radar = synthesize_radar_output(company)
    radar.update(
        {
            "workflow_key": plan["workflow_key"],
            "classification": plan["classification"],
            "subagent_trace": [
                {
                    "subagent_key": item.get("subagent_key"),
                    "profile_key": item.get("profile_key"),
                    "verification_status": (item.get("verification") or {}).get("status"),
                }
                for item in subagent_outputs
            ],
            "supporting_cards": [card.get("id") for card in cards if isinstance(card, dict) and card.get("id")],
            "input_hash": stable_hash({"message": message, "plan": plan, "radar": radar.get("score")}),
        }
    )
    return radar


@dataclass
class StrategyWorkflowEngine:
    store: AgentRuntimeStore
    harness: Harness | None = None
    trace: TraceRecorder = field(init=False)

    def __post_init__(self) -> None:
        self.trace = TraceRecorder(self.store)

    def execute(
        self,
        *,
        message: str,
        profile_key: str,
        source: str,
        organization_id: str | None = None,
        client_id: str | None = None,
        conversation_id: str | None = None,
        assistant_id: str | None = None,
        mode: str | None = None,
        workflow_spec: dict[str, Any] | None = None,
        retrieval_context: dict[str, Any] | None = None,
        autonomy_policies: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        workflow_key = (workflow_spec or {}).get("workflow_key") or choose_workflow_key(mode, source)
        run = self.trace.start_run(
            {
                "organization_id": organization_id,
                "client_id": client_id,
                "conversation_id": conversation_id,
                "run_source": source,
                "profile_key": profile_key,
                "assistant_id": assistant_id,
                "workflow_key": workflow_key,
                "input_payload": {"message": message, "mode": mode},
            }
        )
        run_id = run["id"]
        try:
            with self.trace.step(run_id, "classify", "classify", {"message": message}) as step:
                classification = classify_intent_and_stage(message, source)
                step.succeed(classification, classification)

            if retrieval_context:
                with self.trace.step(run_id, "retrieval", "retrieval", {"query": message}) as step:
                    step_record = step.succeed({"result_ids": (retrieval_context.get("retrieval_log") or {}).get("result_ids", [])})
                    self.trace.record_context(
                        run_id=run_id,
                        step_id=step_record["id"],
                        profile_key=profile_key,
                        context_kind="rag",
                        safe_context=retrieval_context,
                        card_ids=[item.get("id") for item in _as_list(retrieval_context.get("cards")) if isinstance(item, dict) and item.get("id")],
                        chunk_ids=[item.get("id") for item in _as_list(retrieval_context.get("chunks")) if isinstance(item, dict) and item.get("id")],
                    )

            effective_workflow_spec = workflow_spec
            if workflow_key == "commercial_radar_local_niche" and not workflow_spec:
                effective_workflow_spec = build_radar_workflow_spec()

            with self.trace.step(run_id, "planner", "planner", {"workflow_key": workflow_key}) as step:
                plan = build_workflow_plan(effective_workflow_spec, classification)
                step.succeed(plan, {"subagent_count": len(plan["subagents"])})

            subagent_outputs = []
            for subagent in plan["subagents"]:
                subagent_output = self._execute_subagent(run_id, subagent, message, retrieval_context)
                subagent_outputs.append(subagent_output)

            with self.trace.step(run_id, "synthesizer", "synthesizer", {"subagent_count": len(subagent_outputs)}) as step:
                if plan["workflow_key"] == "commercial_radar_local_niche":
                    synthesis = synthesize_radar_workflow_result(message, plan, subagent_outputs, retrieval_context)
                else:
                    synthesis = synthesize_workflow_result(message, plan, subagent_outputs, retrieval_context)
                step.succeed(synthesis, {"supporting_cards": synthesis["supporting_cards"]})

            action_key = "send_external_message" if source == "whatsapp" else "client_visible_recommendation"
            with self.trace.step(run_id, "policy", "policy", {"action_key": action_key}) as step:
                decision = resolve_autonomy_policy(
                    autonomy_policies or [],
                    {
                        "organization_id": organization_id,
                        "client_id": client_id,
                        "assistant_id": assistant_id,
                        "profile_key": profile_key,
                        "channel": "whatsapp" if source == "whatsapp" else "strategy_admin",
                        "intent_key": classification["intent_key"],
                        "stage_key": classification["stage_key"],
                        "action_key": action_key,
                    },
                    confidence=float(classification["confidence"]),
                )
                step.succeed(decision.to_dict(), decision.to_dict())

            with self.trace.step(run_id, "learning", "learning", {"workflow_key": workflow_key}) as step:
                signal = self.trace.record_learning_signal(
                    run_id=run_id,
                    organization_id=organization_id,
                    profile_key=profile_key,
                    signal_type="workflow_completed",
                    target_type="workflow",
                    target_id=workflow_key,
                    signal_score=0.7,
                    confidence=float(classification["confidence"]),
                    evidence={"classification": classification, "supporting_cards": synthesis["supporting_cards"]},
                )
                step.succeed({"learning_signal_id": signal["id"]})

            final_status = "blocked" if decision.blocked else ("waiting_approval" if decision.requires_approval and not decision.should_send else "succeeded")
            completed = self.trace.complete_run(
                run_id,
                final_status,
                {
                    "autonomy_mode": decision.autonomy_mode,
                    "risk_level": decision.risk_level,
                    "confidence": float(classification["confidence"]),
                    "output_payload": {"synthesis": synthesis, "policy": decision.to_dict()},
                    "decision_summary": decision.reason,
                },
            )
            return {"run": completed, "synthesis": synthesis, "policy": decision.to_dict(), "subagents": subagent_outputs}
        except Exception as error:
            self.trace.complete_run(run_id, "failed", {"error_message": str(error), "output_payload": {"error": str(error)}})
            raise

    def _execute_subagent(
        self,
        run_id: str,
        subagent: dict[str, Any],
        message: str,
        retrieval_context: dict[str, Any] | None,
    ) -> dict[str, Any]:
        key = _string(subagent.get("key") or subagent.get("subagent_key"))
        profile_key = _string(subagent.get("profile_key")) or "growth_strategist"
        objective = _string(subagent.get("objective")) or key
        with self.trace.step(run_id, key, "subagent", {"objective": objective, "profile_key": profile_key}) as step:
            output = {
                "subagent_key": key,
                "profile_key": profile_key,
                "objective": objective,
                "analysis": f"{objective} Mensagem analisada: {message[:280]}",
                "recommended_actions": _actions_for_subagent(key),
                "retrieval_used": bool(retrieval_context),
            }
            step_record = step.succeed(output, {"objective": objective})
        verification = verify_output(output, {"minimum_score": 0.5}, _as_list(subagent.get("required_terms")))
        verification_record = self.trace.record_verification(
            run_id=run_id,
            step_id=step_record["id"],
            verifier_key=f"{key}_verifier",
            status=verification["status"],
            score=float(verification["score"]),
            rubric={"required_terms": _as_list(subagent.get("required_terms"))},
            findings=verification["findings"],
            retry_recommended=bool(verification["retry_recommended"]),
            follow_up_prompt=verification["follow_up_prompt"],
        )
        self.store.insert(
            "strategy_subagent_runs",
            {
                "run_id": run_id,
                "subagent_key": key,
                "profile_key": profile_key,
                "objective": objective,
                "context_summary": str(retrieval_context or {})[:600],
                "allowed_tools": _as_list(subagent.get("allowed_tools")),
                "rubric": {"required_terms": _as_list(subagent.get("required_terms"))},
                "status": "succeeded" if verification["status"] == "passed" else "failed",
                "output_payload": output,
                "verification_result_id": verification_record["id"],
            },
        )
        return {**output, "verification": verification}


def _actions_for_subagent(key: str) -> list[str]:
    if "crm" in key:
        return ["Auditar cards sem proximo passo.", "Criar cadencia de follow-up por estagio."]
    if "cash" in key:
        return ["Priorizar oportunidades de caixa de baixa complexidade.", "Validar CAC, ticket e margem antes de aquisicao."]
    if "offer" in key or "objection" in key:
        return ["Transformar objecoes recorrentes em argumentos e ajustes de oferta.", "Atualizar scripts e proposta com prova e proximo passo."]
    if "risk" in key:
        return ["Bloquear promessas comerciais sem aprovacao.", "Registrar premissas e criterios de decisao."]
    if "proposal" in key:
        return ["Converter diagnostico em fases, entregaveis e riscos.", "Separar escopo essencial de expansoes futuras."]
    return ["Registrar achado, acao, responsavel, metrica e proximo passo."]
