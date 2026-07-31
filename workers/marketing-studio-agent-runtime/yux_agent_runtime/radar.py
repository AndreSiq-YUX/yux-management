from __future__ import annotations

from dataclasses import dataclass
from typing import Any


RADAR_SUBAGENTS = [
    {
        "key": "radar_fit_analyst",
        "profile_key": "ai_sdr_comercial_1",
        "objective": "Avaliar fit da empresa, nicho, contato e prioridade de abordagem.",
        "required_terms": ["fit", "empresa", "prioridade"],
    },
    {
        "key": "radar_offer_analyst",
        "profile_key": "offer_conversion",
        "objective": "Recomendar oferta YUX com base em dor, evidencia publica e contexto estrategico.",
        "required_terms": ["oferta", "dor", "evidencia"],
    },
    {
        "key": "radar_crm_analyst",
        "profile_key": "crm_controller",
        "objective": "Definir proxima acao de CRM e criterios para conversao em lead.",
        "required_terms": ["crm", "lead", "proxima acao"],
    },
    {
        "key": "radar_metrics_analyst",
        "profile_key": "metrics_cash_mroi",
        "objective": "Avaliar custo, prioridade comercial e potencial de caixa.",
        "required_terms": ["custo", "caixa", "prioridade"],
    },
    {
        "key": "radar_risk_auditor",
        "profile_key": "growth_strategist",
        "objective": "Auditar LGPD, promessa, risco reputacional e necessidade de aprovacao humana.",
        "required_terms": ["risco", "aprovacao", "lgpd"],
    },
]


@dataclass(frozen=True)
class RadarCompanyInput:
    name: str
    segment: str = ""
    city: str = ""
    state: str = ""
    website_url: str = ""
    source_type: str = ""
    source_url: str = ""
    channels: tuple[str, ...] = ()
    evidence: tuple[str, ...] = ()


def build_radar_workflow_spec(max_subagents: int = 5) -> dict[str, Any]:
    return {
        "workflow_key": "commercial_radar_local_niche",
        "max_subagents": max_subagents,
        "subagent_specs": RADAR_SUBAGENTS[:max_subagents],
        "max_retries_per_node": 1,
    }


def radar_policy_decision(can_convert_to_lead: bool = True, blocked_reasons: list[str] | None = None) -> dict[str, Any]:
    reasons = blocked_reasons or []
    return {
        "status": "blocked" if reasons else "requires_human_approval",
        "canSendAutomatically": False,
        "canConvertToLead": can_convert_to_lead and not reasons,
        "blockedReasons": reasons,
        "requiredReviewFields": ["message", "evidence", "risk_flags"],
    }


def synthesize_radar_output(company: RadarCompanyInput, recommended_offer: str = "Diagnostico YUX 48h") -> dict[str, Any]:
    evidence = list(company.evidence) or [
        f"Empresa identificada em {company.city}/{company.state} no segmento {company.segment or 'nao informado'}."
    ]
    contactability = 80 if company.channels else 45
    fit = 80 if company.segment else 55
    pain = 70 if company.website_url else 60
    total = round((fit * 0.35) + (pain * 0.3) + (contactability * 0.2) + 12)
    total = max(0, min(100, total))

    return {
        "summary": f"Analise da oportunidade para {company.name}.",
        "source": {"type": company.source_type, "url": company.source_url},
        "evidence": evidence,
        "pain_hypotheses": ["Possivel perda de oportunidades por baixa estrutura de captura e follow-up."],
        "recommended_offer": recommended_offer,
        "score": {
            "total_score": total,
            "fit_score": fit,
            "timing_score": 65,
            "pain_score": pain,
            "contactability_score": contactability,
            "budget_score": 60,
            "personalization_score": 75 if evidence else 50,
            "explanation": "Score calculado por fit, dor aparente, contato publico, timing e personalizacao disponivel.",
        },
        "message": {
            "channel": "email",
            "subject": f"Analise rapida para {company.name}",
            "body": (
                f"Analisei sinais publicos da {company.name} e encontrei oportunidades de melhoria comercial. "
                "Posso te enviar 3 ideias praticas?"
            ),
            "personalization_notes": "Mensagem deve ser revisada por humano antes de qualquer envio.",
            "evidence_used": evidence,
        },
        "risk_flags": [],
        "policyDecision": radar_policy_decision(can_convert_to_lead=True),
    }
