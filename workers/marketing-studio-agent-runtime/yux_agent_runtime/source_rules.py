from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


SourceUse = Literal["required", "optional", "forbidden"]


class AgentSourceRulesWire(BaseModel):
    model_config = ConfigDict(extra="forbid")

    methodology: SourceUse
    company_strategy: SourceUse
    company_documents: SourceUse
    portfolio: SourceUse


class RequiredSourcesMissing(RuntimeError):
    def __init__(self, report: dict[str, Any]):
        super().__init__("agent_required_sources_missing")
        self.report = report


def _is_company_chunk(item: dict[str, Any]) -> bool:
    return item.get("source_scope") == "organization" or str(item.get("id", "")).startswith("company:")


def apply_source_rules(context: dict[str, Any], rules: dict[str, str]) -> dict[str, Any]:
    chunks = context.get("chunks") or []
    coverage = dict(context.get("context_coverage") or {})
    if rules["methodology"] == "forbidden":
        context.update(cards=[], assets=[], chunks=[item for item in chunks if _is_company_chunk(item)])
    if rules["company_documents"] == "forbidden":
        context.update(company_chunks=[], knowledge_snippets=[], company_context_source_ids=[],
                       chunks=[item for item in context.get("chunks") or [] if not _is_company_chunk(item)])
        coverage.pop("customerKnowledge", None)
        coverage.pop("knowledgeContractRequired", None)
    if rules["company_strategy"] == "forbidden":
        context.update(company_strategy_context={}, company_strategy_sources=[])
    if rules["portfolio"] == "forbidden":
        context.update(portfolio_context={}, products=[], product_profiles=[])
        coverage.pop("products", None)
    context["context_coverage"] = coverage
    counts = {
        "methodology": len(context.get("cards") or []) + len(context.get("assets") or [])
        + sum(not _is_company_chunk(item) for item in context.get("chunks") or []),
        "company_documents": sum(_is_company_chunk(item) for item in context.get("chunks") or []),
        "company_strategy": len((context.get("company_strategy_context") or {}).get("selected") or []),
        "portfolio": len((context.get("portfolio_context") or {}).get("items") or []),
    }
    missing = [source for source, use in rules.items() if use == "required" and counts[source] == 0]
    report = {"rules": rules, "counts": counts, "missing": missing}
    if missing:
        raise RequiredSourcesMissing(report)
    return report
