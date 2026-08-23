from __future__ import annotations

from decimal import Decimal
from hashlib import sha256
import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ModelProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1)
    version: int = Field(ge=1)
    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
    temperature: float = Field(ge=0, le=2)
    max_tokens: int = Field(ge=1)
    timeout_seconds: int = Field(ge=1, le=600)
    max_cost_brl: Decimal = Field(ge=0)
    fallback_profile_keys: list[str] = Field(default_factory=list)
    prompt_bundle_hash: str = Field(pattern=r"^[a-f0-9]{64}$")


def build_model_trace(profile: ModelProfile, resolved_model_id: str, messages: list[dict[str, str]], usage: dict[str, Any]) -> dict[str, Any]:
    prompt_hash = sha256(_stable_json(messages).encode("utf-8")).hexdigest()
    return {
        "profileKey": profile.key, "profileVersion": profile.version, "provider": profile.provider,
        "requestedModelId": profile.model, "resolvedModelId": resolved_model_id,
        "parameters": {"temperature": profile.temperature, "maxTokens": profile.max_tokens, "timeoutSeconds": profile.timeout_seconds},
        "promptBundleHash": profile.prompt_bundle_hash, "promptHash": prompt_hash, "usage": usage,
    }


def _stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
