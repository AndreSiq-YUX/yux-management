from __future__ import annotations

import json
import re
from dataclasses import dataclass
from math import sqrt
from typing import Any

from .runtime_store import AgentRuntimeStore


def _list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, (list, tuple)) else []


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in _list(value) if str(item).strip()]


def _tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[\w-]+", value.lower(), flags=re.UNICODE) if len(token) >= 3}


def _latest(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not records:
        return None
    return sorted(records, key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""), reverse=True)[0]


@dataclass
class CustomerContextService:
    store: AgentRuntimeStore
    embedding_service: Any | None = None
    max_snippets: int = 4
    max_context_chars: int = 6000

    def retrieve(
        self,
        *,
        organization_id: str | None,
        contract_id: str | None,
        profile_key: str,
        query: str,
        assistant_id: str | None = None,
        external: bool = False,
    ) -> dict[str, Any]:
        if not organization_id:
            return {}

        company = _latest(self.store.list("organization_company_profiles", {"organization_id": organization_id}, limit=2))
        brands = self.store.list("marketing_brand_profiles", {"organization_id": organization_id}, limit=20)
        active_brands = [item for item in brands if item.get("status") == "active"]
        contract_brands = [item for item in active_brands if contract_id and str(item.get("contract_id")) == contract_id]
        brand = _latest(contract_brands) or _latest(active_brands)
        products = [
            item for item in self.store.list("marketing_products_services", {"organization_id": organization_id}, limit=40)
            if item.get("status") == "active"
        ]
        sources = [
            item for item in self.store.list("knowledge_sources", {"organization_id": organization_id}, limit=300)
            if item.get("status") == "published" and self._source_allowed(item, profile_key, external)
        ]
        source_by_id = {str(item.get("id")): item for item in sources if item.get("id")}
        entries = [
            item for item in self.store.list("knowledge_entries", {"organization_id": organization_id}, limit=500)
            if item.get("status") in ("approved", "published") and str(item.get("source_id")) in source_by_id
        ]
        documents = [
            item for item in self.store.list("marketing_knowledge_documents", {"organization_id": organization_id}, limit=300)
            if item.get("status") == "published" and str(item.get("source_id")) in source_by_id
        ]
        documents_by_id = {str(item.get("id")): item for item in documents if item.get("id")}
        curated_chunks = [
            item for item in self.store.list("marketing_knowledge_chunks", {"organization_id": organization_id}, limit=500)
            if str(item.get("document_id")) in documents_by_id
            and item.get("chunk_kind") in ("curated_fact", "curated_summary")
            and item.get("curation_status") == "approved"
        ]
        linked_ids = self._assistant_linked_entry_ids(assistant_id)
        ranked = self._rank_entries(entries, query, linked_ids)
        query_embedding = self.embedding_service.embed_query(query) if self.embedding_service is not None else None
        ranked_curated = self._rank_chunks(curated_chunks, query, query_embedding)
        if ranked_curated:
            snippets, source_ids = self._fit_curated_snippets(ranked_curated, documents_by_id)
            context_items = [
                {
                    "id": f"company:{item.get('id')}",
                    "entry_id": item.get("entry_id"),
                    "source_id": (documents_by_id.get(str(item.get("document_id"))) or {}).get("source_id"),
                    "section_key": item.get("title") or item.get("source_locator") or "knowledge",
                    "chunk_text": str(item.get("body") or "")[:1600],
                    "source_scope": "organization",
                    "source_locator": item.get("source_locator"),
                    "retrieval_score": item.get("retrieval_score"),
                    "updated_at": str(item.get("updated_at") or item.get("created_at") or ""),
                    "content_hash": item.get("content_hash"),
                }
                for item in ranked_curated[: self.max_snippets]
            ]
        else:
            snippets, source_ids = self._fit_snippets(ranked)
            context_items = [
                {
                    "id": f"company:{entry.get('id')}",
                    "entry_id": entry.get("id"),
                    "source_id": entry.get("source_id"),
                    "section_key": entry.get("title") or "knowledge",
                    "chunk_text": str(entry.get("body") or "")[:1600],
                    "source_scope": "organization",
                    "updated_at": str(entry.get("updated_at") or entry.get("created_at") or ""),
                }
                for entry in ranked[: self.max_snippets]
            ]
        safety_rules = self._assistant_safety_rules(assistant_id)
        brand_rules = self._brand_rules(brand, safety_rules)

        return {
            "company_profile": self._safe_company(company),
            "customer_context": self._company_summary(company),
            "brand_summary": self._brand_summary(brand),
            "brand_rules": brand_rules,
            "visual_identity": (brand or {}).get("visual_identity") or {},
            "products": [self._product_summary(item) for item in products[:10]],
            "product_profiles": [self._safe_product(item) for item in products[:10]],
            "knowledge_snippets": snippets,
            "company_chunks": context_items,
            "company_context_source_ids": source_ids,
            "brand_profile_id": brand.get("id") if brand else None,
            "context_coverage": {
                "company": bool(company),
                "brand": bool(brand),
                "products": len(products),
                "customerKnowledge": len(context_items),
            },
        }

    @staticmethod
    def _source_allowed(source: dict[str, Any], profile_key: str, external: bool) -> bool:
        if external and source.get("visibility") == "internal":
            return False
        allowed = _strings(source.get("allowed_agent_profile_keys"))
        blocked = _strings(source.get("blocked_agent_profile_keys"))
        if profile_key in blocked:
            return False
        return not allowed or profile_key in allowed

    def _assistant_linked_entry_ids(self, assistant_id: str | None) -> set[str]:
        if not assistant_id:
            return set()
        return {
            str(item.get("knowledge_entry_id"))
            for item in self.store.list("ai_assistant_knowledge_links", {"assistant_id": assistant_id}, limit=300)
            if item.get("knowledge_entry_id")
        }

    def _assistant_safety_rules(self, assistant_id: str | None) -> list[str]:
        if not assistant_id:
            return []
        return [
            str(item.get("instructions") or "").strip()
            for item in self.store.list("ai_assistant_safety_rules", {"assistant_id": assistant_id}, limit=100)
            if item.get("is_enabled", True) and str(item.get("instructions") or "").strip()
        ]

    @staticmethod
    def _rank_entries(entries: list[dict[str, Any]], query: str, linked_ids: set[str]) -> list[dict[str, Any]]:
        query_tokens = _tokens(query)
        scored = []
        for entry in entries:
            haystack = _tokens(f"{entry.get('title', '')} {entry.get('body', '')}")
            overlap = len(query_tokens.intersection(haystack)) / max(len(query_tokens), 1) if query_tokens else 0
            linked = 1 if str(entry.get("id")) in linked_ids else 0
            scored.append(((linked, overlap, str(entry.get("updated_at") or "")), entry))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [entry for _, entry in scored]

    @staticmethod
    def _rank_chunks(chunks: list[dict[str, Any]], query: str, query_embedding: list[float] | None) -> list[dict[str, Any]]:
        query_tokens = _tokens(query)
        scored = []
        for chunk in chunks:
            haystack = _tokens(f"{chunk.get('title', '')} {chunk.get('body', '')}")
            keyword = len(query_tokens.intersection(haystack)) / max(len(query_tokens), 1) if query_tokens else 0.0
            vector = CustomerContextService._cosine(query_embedding, chunk.get("embedding"))
            quality = float(chunk.get("quality_score") or 0)
            total = (0.60 * vector) + (0.25 * keyword) + (0.10 * quality)
            scored.append((total, str(chunk.get("updated_at") or ""), {**chunk, "retrieval_score": round(total, 6)}))
        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return [item[2] for item in scored]

    @staticmethod
    def _cosine(left: list[float] | None, right: Any) -> float:
        if not left or not isinstance(right, list) or len(left) != len(right):
            return 0.0
        try:
            values = [float(item) for item in right]
        except (TypeError, ValueError):
            return 0.0
        denominator = sqrt(sum(item * item for item in left)) * sqrt(sum(item * item for item in values))
        return sum(a * b for a, b in zip(left, values)) / denominator if denominator else 0.0

    def _fit_curated_snippets(self, chunks: list[dict[str, Any]], documents_by_id: dict[str, dict[str, Any]]) -> tuple[list[str], list[str]]:
        snippets: list[str] = []
        source_ids: list[str] = []
        remaining = self.max_context_chars
        for chunk in chunks[: self.max_snippets]:
            body = str(chunk.get("body") or "").strip()[: min(1600, remaining)]
            if not body or remaining <= 0:
                break
            snippets.append(body)
            source_id = (documents_by_id.get(str(chunk.get("document_id"))) or {}).get("source_id")
            if source_id:
                source_ids.append(str(source_id))
            remaining -= len(body)
        return snippets, source_ids

    def _fit_snippets(self, entries: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
        snippets: list[str] = []
        source_ids: list[str] = []
        remaining = self.max_context_chars
        for entry in entries[: self.max_snippets]:
            title = str(entry.get("title") or "Conhecimento").strip()
            body = str(entry.get("body") or "").strip()
            snippet = f"{title}: {body}"[: min(1600, remaining)]
            if not snippet or remaining <= 0:
                break
            snippets.append(snippet)
            source_id = str(entry.get("source_id") or "")
            if source_id:
                source_ids.append(source_id)
            remaining -= len(snippet)
        return snippets, source_ids

    @staticmethod
    def _safe_company(company: dict[str, Any] | None) -> dict[str, Any]:
        if not company:
            return {}
        return {
            key: company.get(key)
            for key in (
                "legal_name", "trade_name", "description", "website_url", "industry",
                "positioning", "differentiators", "service_regions", "social_links",
            )
            if company.get(key) not in (None, "", [], {})
        }

    @staticmethod
    def _company_summary(company: dict[str, Any] | None) -> str:
        if not company:
            return ""
        parts = [
            company.get("trade_name") or company.get("legal_name"),
            company.get("industry"), company.get("positioning"), company.get("description"),
        ]
        return " | ".join(str(part).strip() for part in parts if str(part or "").strip())[:1800]

    @staticmethod
    def _brand_summary(brand: dict[str, Any] | None) -> str:
        if not brand:
            return ""
        visual_identity = brand.get("visual_identity") or {}
        visual_summary = json.dumps(visual_identity, ensure_ascii=False) if visual_identity else ""
        parts = [
            brand.get("brand_voice_summary"),
            f"Tom: {brand.get('tone_of_voice')}" if brand.get("tone_of_voice") else "",
            f"Persona: {brand.get('persona')}" if brand.get("persona") else "",
            f"Diretrizes visuais: {brand.get('visual_guidelines')}" if brand.get("visual_guidelines") else "",
            f"Identidade visual: {visual_summary}" if visual_summary else "",
        ]
        return " | ".join(str(part).strip() for part in parts if str(part or "").strip())

    @staticmethod
    def _brand_rules(brand: dict[str, Any] | None, assistant_rules: list[str]) -> dict[str, Any]:
        brand = brand or {}
        return {
            "vocabulary_do": _strings(brand.get("vocabulary_do")),
            "vocabulary_dont": _strings(brand.get("vocabulary_dont")),
            "forbidden_topics": _strings(brand.get("forbidden_topics")),
            "priority_topics": _strings(brand.get("priority_topics")),
            "compliance_notes": str(brand.get("compliance_notes") or "").strip(),
            "visual_identity": brand.get("visual_identity") or {},
            "assistant_safety_rules": assistant_rules,
        }

    @staticmethod
    def _product_summary(product: dict[str, Any]) -> str:
        return " | ".join(
            str(part).strip()
            for part in (product.get("name"), product.get("description"), product.get("value_proposition"))
            if str(part or "").strip()
        )[:1000]

    @staticmethod
    def _safe_product(product: dict[str, Any]) -> dict[str, Any]:
        return {
            key: product.get(key)
            for key in (
                "id",
                "name",
                "description",
                "value_proposition",
                "target_audience",
                "proof_points",
                "objections",
                "cta",
            )
            if product.get(key) not in (None, "", [], {})
        }
