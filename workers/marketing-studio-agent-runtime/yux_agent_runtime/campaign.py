from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CampaignBrief:
    title: str
    offer: str
    audience: str
    landing_page_url: str | None = None
    provider: str = "meta"
    objective: str = "lead_generation"
    cta: str = "Fale com a YUX"
    daily_budget: float = 80


def build_campaign_context(
    brief: CampaignBrief,
    brand_summary: str = "",
    proof_points: list[str] | None = None,
    source_content: str = "",
) -> dict[str, Any]:
    return {
        "title": brief.title.strip(),
        "offer": brief.offer.strip(),
        "audience": brief.audience.strip(),
        "provider": brief.provider,
        "objective": brief.objective,
        "landing_page_url": (brief.landing_page_url or "").strip(),
        "brand_summary": brand_summary.strip(),
        "proof_points": [item.strip() for item in proof_points or [] if item.strip()],
        "source_content": source_content.strip(),
    }


def draft_campaign_creative_package(brief: CampaignBrief, context: dict[str, Any]) -> dict[str, Any]:
    proof = (context.get("proof_points") or ["Integre CRM, landing pages e acompanhamento comercial."])[0]
    brand = context.get("brand_summary") or "consultiva e direta"
    headline = f"{brief.offer.strip()} para {brief.audience.strip()}"
    campaign_name = normalize_campaign_name(brief.title)

    return {
        "title": brief.title.strip(),
        "campaign_name": campaign_name,
        "provider": brief.provider,
        "objective": brief.objective,
        "angle": f"Mostrar como {brief.offer.strip()} resolve uma dor pratica de {brief.audience.strip()}.",
        "target_audience": brief.audience.strip(),
        "funnel_stage": "consideration",
        "cta": brief.cta.strip(),
        "daily_budget": max(float(brief.daily_budget), 0),
        "utm_source": brief.provider,
        "utm_medium": "paid",
        "utm_campaign": slugify(campaign_name),
        "copy_variations": [
            {
                "headline": headline,
                "body": f"Com uma comunicacao {brand}, destaque: {proof}",
                "cta": brief.cta.strip(),
            },
            {
                "headline": f"Pare de perder oportunidades com {brief.offer.strip()}",
                "body": f"Organize proximos passos, acompanhe leads e transforme interesse em conversa comercial.",
                "cta": brief.cta.strip(),
            },
        ],
        "creative_concepts": [
            {
                "name": "Antes e depois operacional",
                "format": "image",
                "prompt": f"Interface limpa mostrando evolucao de processo para {brief.audience.strip()}, estilo profissional YUX.",
            },
            {
                "name": "Prova visual de funil",
                "format": "carousel",
                "prompt": "Carrossel com problema, solucao, prova e chamada para acao.",
            },
        ],
        "targeting_suggestions": {
            "audience": brief.audience.strip(),
            "interests": [brief.offer.strip(), "CRM", "marketing digital"],
            "exclusions": ["promessas absolutas", "segmentos regulados sem revisao"],
        },
        "quality_score": 84 if proof else 72,
        "risk_flags": [],
    }


def normalize_campaign_name(title: str) -> str:
    clean = " ".join(title.split()).strip()
    return clean if clean.lower().startswith("campanha") else f"Campanha {clean}"


def slugify(value: str) -> str:
    return "_".join(
        token
        for token in "".join(char.lower() if char.isalnum() else " " for char in value).split()
        if token
    )
