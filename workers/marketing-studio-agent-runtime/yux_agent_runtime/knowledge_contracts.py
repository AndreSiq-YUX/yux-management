from __future__ import annotations

import hashlib
import json
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KnowledgeQueryV1(StrictContract):
    schemaVersion: Literal[1]
    organizationId: UUID
    contractId: UUID | None
    profileKey: str = Field(min_length=1)
    audience: Literal["internal_operator", "client_user", "external_contact"]
    moduleKey: str = Field(min_length=1)
    workflowKey: str | None
    channel: str | None
    queryText: str = Field(min_length=1, max_length=10_000)
    matchLimit: int = Field(ge=1, le=20)


class KnowledgeSourceRefV1(StrictContract):
    namespace: Literal["strategy", "company"]
    id: UUID
    publicationId: UUID
    itemId: UUID
    documentId: UUID | None
    sourceLocator: str | None
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    knowledgePolicyVersion: Literal[1]
    useMode: Literal["internal_reasoning", "quotable"]


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def hash_canonical(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
