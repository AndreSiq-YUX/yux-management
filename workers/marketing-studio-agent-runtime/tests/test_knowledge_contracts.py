import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from yux_agent_runtime.knowledge_contracts import KnowledgeQueryV1, canonical_json, hash_canonical


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
