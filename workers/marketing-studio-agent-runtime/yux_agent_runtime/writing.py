from __future__ import annotations

from dataclasses import dataclass
from typing import Any


FACTUAL_TERMS = ("dados", "pesquisa", "estatistica", "relatorio", "noticia", "ranking", "%", "R$")


@dataclass(frozen=True)
class WritingBrief:
    title: str
    objective: str
    channel: str
    content_type: str = "social_post"
    cta: str | None = None
    angle: str | None = None


def build_writer_context(
    brief: WritingBrief,
    brand_summary: str = "",
    products: list[str] | None = None,
    knowledge_snippets: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "objective": brief.objective.strip(),
        "channel": brief.channel.strip(),
        "content_type": brief.content_type.strip(),
        "brand_summary": brand_summary.strip(),
        "products": [item.strip() for item in products or [] if item.strip()],
        "knowledge_snippets": [item.strip() for item in knowledge_snippets or [] if item.strip()],
    }


def draft_multichannel_content(brief: WritingBrief, context: dict[str, Any]) -> dict[str, Any]:
    products = context.get("products") or []
    snippets = context.get("knowledge_snippets") or []
    brand = context.get("brand_summary") or "comunicacao clara e consultiva"
    cta = brief.cta or "Fale com a YUX"
    support_line = snippets[0] if snippets else "Conecte estrategia, execucao e acompanhamento em um unico fluxo."
    product_line = f"Oferta relacionada: {products[0]}." if products else "Oferta relacionada: Marketing Studio YUX."

    body = "\n\n".join(
        [
            brief.angle or brief.objective,
            f"Use uma voz {brand}. {support_line}",
            product_line,
            cta,
        ]
    )

    return {
        "title": brief.title.strip(),
        "body": body.strip(),
        "cta": cta.strip(),
        "channel": brief.channel,
        "content_type": brief.content_type,
        "variation_count": 1,
    }


def requires_grounding(text: str, content_type: str = "social_post", source_urls: list[str] | None = None) -> bool:
    if source_urls:
        return True
    normalized = text.lower()
    if content_type == "blog_article" and any(term.lower() in normalized for term in FACTUAL_TERMS):
        return True
    return any(term.lower() in normalized for term in FACTUAL_TERMS)


def review_content_quality(
    draft: dict[str, Any],
    forbidden_topics: list[str] | None = None,
    priority_topics: list[str] | None = None,
) -> dict[str, Any]:
    title = str(draft.get("title") or "").strip()
    body = str(draft.get("body") or "").strip()
    cta = str(draft.get("cta") or "").strip()
    haystack = f"{title} {body}".lower()
    forbidden_topics = forbidden_topics or []
    priority_topics = priority_topics or []
    has_forbidden = any(topic.lower() in haystack for topic in forbidden_topics if topic)
    has_priority = not priority_topics or any(topic.lower() in haystack for topic in priority_topics if topic)
    checklist = {
        "has_title": len(title) >= 6,
        "has_body": len(body) >= 80,
        "has_cta": bool(cta),
        "avoids_forbidden_topics": not has_forbidden,
        "includes_priority_topic": has_priority,
        "grounding_checked_when_needed": not requires_grounding(body, str(draft.get("content_type") or "social_post")),
    }
    score = min(100, sum(14 for passed in checklist.values() if passed) + (2 if len(body) >= 280 else 0))
    risk_flags = []
    if has_forbidden:
        risk_flags.append("forbidden_topic")
    if requires_grounding(body, str(draft.get("content_type") or "social_post")):
        risk_flags.append("factual_claim")
    if not cta:
        risk_flags.append("missing_cta")

    return {
        "status": "passed" if score >= 76 and not has_forbidden else "needs_changes",
        "quality_score": score,
        "checklist": checklist,
        "risk_flags": risk_flags,
        "grounding_required": "factual_claim" in risk_flags,
    }


def jina_grounding_request(text: str, claim_id: str = "draft") -> dict[str, str]:
    return {
        "provider": "jina_grounding",
        "request_type": "grounding",
        "request_key": f"grounding:{claim_id}",
        "claim": text.strip(),
    }
