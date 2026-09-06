import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from yux_agent_runtime.knowledge_contracts import KnowledgeQueryV1, RetrievalResultV1, canonical_json, hash_canonical


def test_python_accepts_and_rejects_shared_query_cases():
    cases = json.loads((Path(__file__).parents[3] / "contracts/knowledge/v1/policy-cases.json").read_text("utf-8"))
    for value in cases["valid"]:
        KnowledgeQueryV1.model_validate(value)
    for case in cases["invalid"]:
        with pytest.raises(ValidationError):
            KnowledgeQueryV1.model_validate(case["value"])


def test_canonical_hash_preserves_arrays_unicode_and_normalizes_key_order():
    first = {"ação": "única", "nested": {"b": None, "a": 1}, "items": [2, 1]}
    second = {"items": [2, 1], "nested": {"a": 1, "b": None}, "ação": "única"}
    assert canonical_json(first) == canonical_json(second)
    assert hash_canonical(first) == hash_canonical(second)
    assert hash_canonical({"items": [1, 2]}) != hash_canonical({"items": [2, 1]})


def test_retrieval_result_requires_versioned_sources_and_explicit_degraded_mode():
    result = RetrievalResultV1.model_validate({
        "schemaVersion": 1,
        "status": "degraded",
        "reasonCode": "query_embedding_unavailable",
        "retrievalMode": "lexical",
        "queryId": "10000000-0000-4000-8000-000000000001",
        "sources": [{
            "namespace": "company",
            "id": "20000000-0000-4000-8000-000000000001",
            "publicationId": "30000000-0000-4000-8000-000000000001",
            "itemId": "20000000-0000-4000-8000-000000000001",
            "documentId": None,
            "sourceLocator": "section:1",
            "contentHash": "a" * 64,
            "knowledgePolicyVersion": 1,
            "useMode": "internal_reasoning",
        }],
        "contextHash": "b" * 64,
        "elapsedMs": 12,
    })
    assert result.retrievalMode == "lexical"
