from __future__ import annotations

from decimal import Decimal
from hashlib import sha256
import json
from math import isfinite
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
    fallback_models: list[str] = Field(default_factory=list)
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


def measure_generation(node: str, response: dict[str, Any]) -> dict[str, Any]:
    usage = response.get("model_usage") or {}
    attempts = response.get("attempts")
    cost = response.get("cost_usd")
    # A provider-side fallback without receipts can incur usage that the final
    # response alone does not account for.
    if not attempts or any(attempt.get("cost_usd") is None for attempt in attempts):
        cost = None
    return {
        "node": node,
        "attemptCount": len(attempts) if attempts else None,
        "inputTokens": usage.get("input_tokens"),
        "outputTokens": usage.get("output_tokens"),
        "reasoningTokens": usage.get("reasoning_tokens"),
        "reportedCostUsd": cost if type(cost) in (int, float) and isfinite(cost) and cost >= 0 else None,
        **({"requestFingerprint": response["provider_request_fingerprint"]} if response.get("provider_request_fingerprint") else {}),
    }


def _stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
