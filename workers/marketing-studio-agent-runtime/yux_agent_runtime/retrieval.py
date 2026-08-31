from __future__ import annotations

import re
from dataclasses import dataclass, field
from hashlib import sha256
from math import sqrt
from typing import Any, Protocol


TokenSet = set[str]


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return []


def _string_list(value: Any) -> list[str]:
    return [str(item) for item in _as_list(value) if str(item).strip()]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _tokens(value: str) -> TokenSet:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9À-ÿ_-]+", value.lower())
        if len(token) >= 3
    }


def _keyword_score(query_tokens: TokenSet, record: dict[str, Any], fields: list[str]) -> float:
    if not query_tokens:
        return 0.0
    haystack_parts: list[str] = []
    for field_name in fields:
        value = record.get(field_name)
        if isinstance(value, list):
            haystack_parts.extend(str(item) for item in value)
        else:
            haystack_parts.append(str(value or ""))
    matches = query_tokens.intersection(_tokens(" ".join(haystack_parts)))
    return len(matches) / max(len(query_tokens), 1)


def _cosine_similarity(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = sqrt(sum(a * a for a in left))
    right_norm = sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def _record_embedding(record: dict[str, Any]) -> list[float] | None:
    value = record.get("embedding_values") or (record.get("embedding") if isinstance(record.get("embedding"), list) else None)
    if not isinstance(value, list):
        return None
    try:
        return [float(item) for item in value]
    except (TypeError, ValueError):
        return None


def _vector_score(record: dict[str, Any], query_embedding: list[float] | None) -> float:
    if "vector_score" in record:
        try:
            return float(record["vector_score"])
        except (TypeError, ValueError):
            return 0.0
    return _cosine_similarity(query_embedding, _record_embedding(record))


def _iso_sort_value(value: Any) -> str:
    return str(value or "")


def _is_visible(record: dict[str, Any], portal_safe: bool) -> bool:
    if portal_safe:
        return record.get("visibility") == "client_safe"
    return record.get("visibility") in (None, "", "internal_only", "client_safe")


def _is_review_usable(record: dict[str, Any], portal_safe: bool) -> bool:
    status = record.get("human_review_status") or "approved"
    if portal_safe:
        return status == "approved"
    return status in ("approved", "pending", "needs_revision", "")


def _is_profile_allowed(record: dict[str, Any], profile_key: str) -> bool:
    allowed = _string_list(record.get("allowed_agent_profile_keys"))
    if profile_key in allowed:
        return True
    if not allowed and profile_key == "growth_strategist":
        return True
    return False


def _stage_matches(record: dict[str, Any], stage: str | None) -> bool:
    if not stage:
        return False
    return stage in _string_list(record.get("stage_tags"))


def _record_title(record_type: str, record: dict[str, Any]) -> str:
    if record_type == "card":
        return _text(record.get("concept"))
    if record_type == "asset":
        return _text(record.get("asset_type")) or "asset"
    return _text(record.get("section_key")) or "chunk"


def _card_context(record: dict[str, Any]) -> str:
    lines = [
        f"Card: {_text(record.get('concept'))}",
        f"Categoria: {_text(record.get('category'))}",
    ]
    if record.get("problem_solved"):
        lines.append(f"Problema: {_text(record.get('problem_solved'))}")
    for label, key in (
        ("Sinais", "trigger_signals"),
        ("Perguntas", "diagnosis_questions"),
        ("Regras", "decision_rules"),
        ("Evitar", "anti_patterns"),
        ("Acoes", "recommended_actions"),
    ):
        values = _string_list(record.get(key))
        if values:
            lines.append(f"{label}: " + "; ".join(values))
    return "\n".join(lines)


def _chunk_context(record: dict[str, Any]) -> str:
    section = _text(record.get("section_key")) or "section"
    return f"Chunk {section}: {_text(record.get('chunk_text'))}"


def _asset_context(record: dict[str, Any]) -> str:
    asset_type = _text(record.get("asset_type")) or "asset"
    storage_path = _text(record.get("storage_path"))
    return f"Asset {asset_type}: {storage_path}"


def _context_for(record_type: str, record: dict[str, Any]) -> str:
    if record_type == "card":
        return _card_context(record)
    if record_type == "chunk":
        return _chunk_context(record)
    return _asset_context(record)


def _fit_text(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    if max_chars <= 0:
        return ""
    clipped = value[:max_chars].rstrip()
    sentence_boundary = max(clipped.rfind("."), clipped.rfind("?"), clipped.rfind("!"), clipped.rfind("\n"))
    if sentence_boundary >= max(40, max_chars // 2):
        return clipped[: sentence_boundary + 1].rstrip()
    word_boundary = clipped.rfind(" ")
    if word_boundary >= max(20, max_chars // 2):
        return clipped[:word_boundary].rstrip()
    return clipped


def _compact_record(record_type: str, record: dict[str, Any], score: dict[str, float]) -> dict[str, Any]:
    base = {
        "id": record.get("id"),
        "type": record_type,
        "title": _record_title(record_type, record),
        "visibility": record.get("visibility"),
        "source_scope": record.get("source_scope"),
        "stage_tags": _string_list(record.get("stage_tags")),
        "retrieval_tags": _string_list(record.get("retrieval_tags")),
        "allowed_agent_profile_keys": _string_list(record.get("allowed_agent_profile_keys")),
        "updated_at": _text(record.get("updated_at") or record.get("created_at")),
        "score": score,
    }
    if record_type == "card":
        base.update({
            "concept": record.get("concept"),
            "category": record.get("category"),
            "problem_solved": record.get("problem_solved"),
            "recommended_actions": _string_list(record.get("recommended_actions")),
            "decision_rules": _string_list(record.get("decision_rules")),
        })
    elif record_type == "chunk":
        base.update({
            "section_key": record.get("section_key"),
            "chunk_text": record.get("chunk_text"),
        })
    else:
        base.update({
            "asset_type": record.get("asset_type"),
            "storage_path": record.get("storage_path"),
        })
    return base


class StrategyKnowledgeStore(Protocol):
    def list_cards(self) -> list[dict[str, Any]]:
        ...

    def list_chunks(self) -> list[dict[str, Any]]:
        ...

    def list_assets(self) -> list[dict[str, Any]]:
        ...

    def log_retrieval_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass
class InMemoryStrategyKnowledgeStore:
    cards: list[dict[str, Any]] = field(default_factory=list)
    chunks: list[dict[str, Any]] = field(default_factory=list)
    assets: list[dict[str, Any]] = field(default_factory=list)
    retrieval_logs: list[dict[str, Any]] = field(default_factory=list)

    def list_cards(self) -> list[dict[str, Any]]:
        return [dict(card) for card in self.cards]

    def list_chunks(self) -> list[dict[str, Any]]:
        return [dict(chunk) for chunk in self.chunks]

    def list_assets(self) -> list[dict[str, Any]]:
        return [dict(asset) for asset in self.assets]

    def log_retrieval_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.retrieval_logs.append(dict(payload))
        return payload


@dataclass
class SupabaseStrategyKnowledgeStore:
    client: Any
    organization_id: str | None = None
    client_id: str | None = None
    candidate_limit: int = 200

    def list_cards(self) -> list[dict[str, Any]]:
        query = self.client.table("yux_strategy_concept_cards").select("*").limit(self.candidate_limit)
        return (query.execute().data or [])

    def list_chunks(self) -> list[dict[str, Any]]:
        query = self.client.table("yux_strategy_source_chunks").select("*").limit(self.candidate_limit)
        return (query.execute().data or [])

    def list_assets(self) -> list[dict[str, Any]]:
        query = self.client.table("yux_strategy_source_assets").select("*").limit(self.candidate_limit)
        return (query.execute().data or [])

    def log_retrieval_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.table("yux_strategy_retrieval_queries").insert(payload).execute()
        data = response.data or []
        return data[0] if data else payload


@dataclass
class StrategyRetrievalService:
    store: StrategyKnowledgeStore
    max_context_chars: int = 5000
    embedding_service: Any | None = None

    def retrieve_strategy_context(
        self,
        *,
        profile_key: str,
        organization_id: str | None,
        client_id: str | None,
        intent: str | None,
        stage: str | None,
        query: str,
        max_cards: int,
        max_chunks: int,
        include_images: bool = False,
        portal_safe: bool = False,
        query_embedding: list[float] | None = None,
        approved_only: bool = False,
    ) -> dict[str, Any]:
        clean_query = " ".join(query.split())
        embedding_status = "provided" if query_embedding is not None else "unavailable"
        if query_embedding is None and self.embedding_service is not None:
            query_embedding = self.embedding_service.embed_query(clean_query)
            embedding_status = "available" if query_embedding is not None else "unavailable"
        query_tokens = _tokens(clean_query)
        filters = {
            "profile_key": profile_key,
            "stage": stage,
            "intent": intent,
            "portal_safe": portal_safe,
            "include_images": include_images,
            "embedding_status": embedding_status,
        }

        tenant_visible = lambda records: self._filter_tenant_records(
            records,
            organization_id=organization_id,
            client_id=client_id,
        )

        ranked_cards = self._rank_records(
            "card",
            tenant_visible(self.store.list_cards()),
            profile_key=profile_key,
            stage=stage,
            query_tokens=query_tokens,
            portal_safe=portal_safe,
            query_embedding=query_embedding,
            approved_only=approved_only,
        )[: max(0, max_cards)]
        ranked_chunks = self._rank_records(
            "chunk",
            tenant_visible(self.store.list_chunks()),
            profile_key=profile_key,
            stage=stage,
            query_tokens=query_tokens,
            portal_safe=portal_safe,
            query_embedding=query_embedding,
            approved_only=approved_only,
        )[: max(0, max_chunks)]
        ranked_assets = []
        if include_images:
            ranked_assets = self._rank_records(
                "asset",
                tenant_visible(self.store.list_assets()),
                profile_key=profile_key,
                stage=stage,
                query_tokens=query_tokens,
                portal_safe=portal_safe,
                query_embedding=query_embedding,
                approved_only=approved_only,
            )

        cards, chunks, assets, context_text = self._apply_context_budget(ranked_cards, ranked_chunks, ranked_assets)
        result_ids = [str(item["id"]) for item in [*cards, *chunks, *assets] if item.get("id")]
        status = "succeeded" if result_ids else "empty"
        score_metadata = {
            "card_scores": {str(item["id"]): item["score"] for item in cards if item.get("id")},
            "chunk_scores": {str(item["id"]): item["score"] for item in chunks if item.get("id")},
            "asset_scores": {str(item["id"]): item["score"] for item in assets if item.get("id")},
        }
        log_payload = {
            "organization_id": organization_id,
            "client_id": client_id,
            "profile_key": profile_key,
            "query": clean_query,
            "intent": intent,
            "stage": stage,
            "include_images": include_images,
            "portal_safe": portal_safe,
            "embedding_status": embedding_status,
            "filters": filters,
            "result_card_ids": [item["id"] for item in cards if item.get("id")],
            "result_chunk_ids": [item["id"] for item in chunks if item.get("id")],
            "result_asset_ids": [item["id"] for item in assets if item.get("id")],
            "score_metadata": score_metadata,
            "context_chars": len(context_text),
            "status": status,
        }
        self.store.log_retrieval_query(log_payload)

        retrieval_log = {
            **log_payload,
            "result_ids": result_ids,
            "max_context_chars": self.max_context_chars,
            "context_hash": sha256(context_text.encode("utf-8")).hexdigest(),
        }
        return {
            "profile_key": profile_key,
            "query": clean_query,
            "intent": intent,
            "commercial_stage": stage,
            "cards": cards,
            "chunks": chunks,
            "assets": assets,
            "context_text": context_text,
            "retrieval_log": retrieval_log,
        }

    @staticmethod
    def _filter_tenant_records(
        records: list[dict[str, Any]],
        *,
        organization_id: str | None,
        client_id: str | None,
    ) -> list[dict[str, Any]]:
        """Global doctrine is reusable; tenant-scoped records are not."""
        result: list[dict[str, Any]] = []
        for record in records:
            record_organization = record.get("organization_id") or record.get("organizationId")
            record_client = record.get("client_id") or record.get("clientId")
            if record_organization and record_organization != organization_id:
                continue
            if record_client and record_client != client_id:
                continue
            result.append(record)
        return result

    def _rank_records(
        self,
        record_type: str,
        records: list[dict[str, Any]],
        *,
        profile_key: str,
        stage: str | None,
        query_tokens: TokenSet,
        portal_safe: bool,
        query_embedding: list[float] | None,
        approved_only: bool,
    ) -> list[dict[str, Any]]:
        scored: list[tuple[tuple[Any, ...], dict[str, Any]]] = []
        fields = {
            "card": [
                "concept",
                "category",
                "problem_solved",
                "trigger_signals",
                "diagnosis_questions",
                "decision_rules",
                "recommended_actions",
                "retrieval_tags",
            ],
            "chunk": ["section_key", "chunk_text", "retrieval_tags"],
            "asset": ["asset_type", "storage_path", "retrieval_tags"],
        }[record_type]

        for record in records:
            if not _is_visible(record, portal_safe):
                continue
            if not _is_review_usable(record, portal_safe):
                continue
            if approved_only and record.get("human_review_status") != "approved":
                continue
            if not _is_profile_allowed(record, profile_key):
                continue

            profile_match = 1 if profile_key in _string_list(record.get("allowed_agent_profile_keys")) else 0
            stage_match = 1 if _stage_matches(record, stage) else 0
            vector_score = _vector_score(record, query_embedding)
            keyword_score = _keyword_score(query_tokens, record, fields)
            reviewed = 1 if record.get("human_review_status") == "approved" else 0
            sort_key = (
                profile_match,
                stage_match,
                vector_score,
                keyword_score,
                reviewed,
                _iso_sort_value(record.get("updated_at") or record.get("created_at")),
            )
            compact = _compact_record(
                record_type,
                record,
                {
                    "profile_match": float(profile_match),
                    "stage_match": float(stage_match),
                    "vector": round(vector_score, 6),
                    "keyword": round(keyword_score, 6),
                    "reviewed": float(reviewed),
                },
            )
            compact["_context"] = _context_for(record_type, record)
            scored.append((sort_key, compact))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [record for _, record in scored]

    def _apply_context_budget(
        self,
        cards: list[dict[str, Any]],
        chunks: list[dict[str, Any]],
        assets: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], str]:
        included_cards: list[dict[str, Any]] = []
        included_chunks: list[dict[str, Any]] = []
        included_assets: list[dict[str, Any]] = []
        context_parts: list[str] = []
        remaining = self.max_context_chars

        for bucket_name, items, included in (
            ("cards", cards, included_cards),
            ("chunks", chunks, included_chunks),
            ("assets", assets, included_assets),
        ):
            for item in items:
                raw_context = _text(item.pop("_context", ""))
                prefix = f"[{bucket_name}:{item.get('id')}]\n"
                candidate = prefix + raw_context
                separator = "\n\n" if context_parts else ""
                candidate_len = len(separator) + len(candidate)

                if candidate_len <= remaining:
                    context_parts.append(candidate)
                    included.append(item)
                    remaining -= candidate_len
                    continue

                if not context_parts and remaining > len(prefix) + 24:
                    fitted = prefix + _fit_text(raw_context, remaining - len(prefix))
                    context_parts.append(fitted)
                    included.append(item)
                    remaining = 0
                break

        return included_cards, included_chunks, included_assets, "\n\n".join(context_parts)


_default_service = StrategyRetrievalService(InMemoryStrategyKnowledgeStore())


def set_default_strategy_retrieval_service(service: StrategyRetrievalService) -> None:
    global _default_service
    _default_service = service


def retrieve_strategy_context(
    profile_key: str,
    organization_id: str | None,
    client_id: str | None,
    intent: str | None,
    stage: str | None,
    query: str,
    max_cards: int,
    max_chunks: int,
    include_images: bool = False,
    portal_safe: bool = False,
) -> dict[str, Any]:
    return _default_service.retrieve_strategy_context(
        profile_key=profile_key,
        organization_id=organization_id,
        client_id=client_id,
        intent=intent,
        stage=stage,
        query=query,
        max_cards=max_cards,
        max_chunks=max_chunks,
        include_images=include_images,
        portal_safe=portal_safe,
    )
