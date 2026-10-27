from __future__ import annotations

import json
import os
import math
from hashlib import sha256
from dataclasses import dataclass, field
from contextlib import contextmanager
from contextvars import ContextVar
from time import monotonic
from typing import Any, Callable, Iterator
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request

from .provider_http_deadline import HttpDeadlineExceeded, open_url as urlopen, run_with_deadline


class ProviderRequestError(Exception):
    """Raised when a live provider request fails with a protected message."""


class ProviderAuthorizationError(ProviderRequestError):
    """A policy/credential denial is terminal and must never cause fallback."""


class ProviderAvailabilityError(ProviderRequestError):
    """Unavailable credentials/provider can use an explicitly configured fallback."""


class ProviderDeadlineExceededError(ProviderRequestError):
    """The current workflow has no time left for another provider attempt."""


_request_deadline: ContextVar[float | None] = ContextVar("provider_request_deadline", default=None)


@contextmanager
def provider_request_budget(seconds: float) -> Iterator[None]:
    """Share a deadline within one request; nested scopes cannot extend it."""
    if isinstance(seconds, bool) or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("provider_request_budget_invalid")
    deadline = monotonic() + seconds
    parent = _request_deadline.get()
    token = _request_deadline.set(min(deadline, parent) if parent is not None else deadline)
    try:
        yield
    finally:
        _request_deadline.reset(token)


def provider_request_timeout() -> float:
    deadline = _request_deadline.get()
    if deadline is None:
        return 45
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise ProviderDeadlineExceededError("provider_request_deadline_exceeded")
    return remaining


Transport = Callable[[str, dict[str, str], dict[str, Any] | None, str], dict[str, Any] | str]


def _configured_paid_models() -> frozenset[str]:
    return frozenset(
        model.strip()
        for model in os.getenv("OPENROUTER_ALLOWED_PAID_MODELS", "").split(",")
        if model.strip()
    )


def _is_free_openrouter_model(model: str) -> bool:
    return model == "openrouter/free" or model.endswith(":free")


def _default_transport(url: str, headers: dict[str, str], payload: dict[str, Any] | None, method: str) -> dict[str, Any] | str:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=data, method=method, headers=headers)
    timeout = provider_request_timeout()

    def read_response():
        with urlopen(request, timeout=provider_request_timeout()) as response:  # nosec B310 - URLs are fixed provider endpoints.
            return response.read().decode("utf-8")

    try:
        text = run_with_deadline(read_response, timeout) if _request_deadline.get() is not None else read_response()
        provider_request_timeout()
    except HTTPError as error:
        error_class = ProviderAuthorizationError if error.code in {401, 403} else ProviderRequestError
        raise error_class(f"provider_http_{error.code}") from error
    except ProviderDeadlineExceededError:
        raise
    except HttpDeadlineExceeded as error:
        raise ProviderDeadlineExceededError("provider_request_deadline_exceeded") from error
    except Exception as error:  # pragma: no cover - exercised through mocked transport.
        provider_request_timeout()
        raise ProviderRequestError("provider_transport_unavailable") from error

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _bearer_headers(api_key: str, extra: dict[str, str] | None = None) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        **(extra or {}),
    }


@dataclass
class OpenRouterClient:
    api_key: str | None = None
    base_url: str = "https://openrouter.ai/api/v1"
    provider_name: str = "openrouter"
    transport: Transport = _default_transport
    allowed_paid_models: frozenset[str] = field(default_factory=frozenset)
    enforce_paid_model_approval: bool = False

    @classmethod
    def from_env(cls) -> "OpenRouterClient":
        return cls(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            allowed_paid_models=_configured_paid_models(),
            enforce_paid_model_approval=True,
        )

    def _require_model_approval(self, models: list[str]) -> None:
        if not self.enforce_paid_model_approval:
            return
        denied = [
            model for model in models
            if not _is_free_openrouter_model(model) and model not in self.allowed_paid_models
        ]
        if denied:
            raise ProviderAuthorizationError(f"paid_openrouter_model_not_approved:{denied[0]}")

    def chat_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 1200,
        temperature: float = 0.4,
        fallback_models: list[str] | None = None,
        session_id: str | None = None,
        response_format: dict[str, Any] | None = None,
        reasoning: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderAvailabilityError(f"missing_{self.provider_name}_api_key")
        self._require_model_approval([model, *(fallback_models or [])])

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        if self.provider_name == "openrouter":
            payload["provider"] = {"data_collection": "deny"}
            if reasoning is not None:
                payload["reasoning"] = reasoning
        if fallback_models and self.provider_name == "openrouter":
            payload["models"] = [model, *fallback_models]
        if session_id:
            payload["session_id"] = session_id
        if response_format:
            payload["response_format"] = response_format

        response = self.transport(
            f"{self.base_url.rstrip('/')}/chat/completions",
            _bearer_headers(
                self.api_key,
                {"X-OpenRouter-Experimental-Metadata": "enabled"} if self.provider_name == "openrouter" else None,
            ),
            payload,
            "POST",
        )
        from .radar_receipts import capture_radar_raw_response
        capture_radar_raw_response(response)
        if not isinstance(response, dict):
            raise ProviderRequestError("invalid_openrouter_response")

        choice = (response.get("choices") or [{}])[0]
        if not isinstance(choice, dict):
            raise ProviderRequestError("invalid_openrouter_choice")
        message = choice.get("message") or {}
        if not isinstance(message, dict):
            raise ProviderRequestError("invalid_openrouter_message")
        usage = response.get("usage") or {}
        if not isinstance(usage, dict):
            usage = {}
        output_tokens = int(usage.get("completion_tokens") or 0)
        details = usage.get("completion_tokens_details")
        count = details.get("reasoning_tokens") if isinstance(details, dict) else None
        reasoning_tokens = min(output_tokens, max(0, count)) if isinstance(count, int) and not isinstance(count, bool) else 0
        return {
            "provider": self.provider_name,
            "model": response.get("model") or model,
            "content": message.get("content") or "",
            "finish_reason": choice.get("finish_reason"),
            "input_tokens": int(usage.get("prompt_tokens") or 0),
            "output_tokens": output_tokens,
            "reasoning_tokens": reasoning_tokens,
            "visible_output_tokens": max(0, output_tokens - reasoning_tokens),
            "total_tokens": int(usage.get("total_tokens") or 0),
            "cost_usd": float(usage["cost"]) if isinstance(usage.get("cost"), (int, float)) else None,
            "raw_response_id": response.get("id"),
            "request_parameters": {"temperature": temperature, "max_tokens": max_tokens,
                                   **({"reasoning": reasoning} if self.provider_name == "openrouter" and reasoning is not None else {})},
            "prompt_hash": sha256(json.dumps(messages, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
        }

    def embed_texts(
        self,
        texts: list[str],
        *,
        input_type: str,
        model: str = "qwen/qwen3-embedding-8b",
        dimensions: int = 1024,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderAvailabilityError(f"missing_{self.provider_name}_api_key")
        self._require_model_approval([model])
        response = self.transport(
            f"{self.base_url.rstrip('/')}/embeddings",
            _bearer_headers(self.api_key),
            {
                "model": model,
                "input": texts,
                **({"input_type": input_type, "provider": {"data_collection": "deny"}} if self.provider_name == "openrouter" else {}),
                "dimensions": dimensions,
                "encoding_format": "float",
            },
            "POST",
        )
        if not isinstance(response, dict):
            raise ProviderRequestError("invalid_openrouter_embeddings_response")
        records = sorted(response.get("data") or [], key=lambda item: int(item.get("index") or 0))
        vectors = [item.get("embedding") for item in records]
        if len(vectors) != len(texts) or any(
            not isinstance(vector, list)
            or len(vector) != dimensions
            or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector)
            for vector in vectors
        ):
            raise ProviderRequestError("invalid_openrouter_embedding_vector")
        return {
            "model": response.get("model") or model,
            "provider": self.provider_name,
            "dimensions": dimensions,
            "vectors": vectors,
            "tokens": int((response.get("usage") or {}).get("total_tokens") or 0),
        }


@dataclass
class JinaClient:
    api_key: str | None = None
    reader_base_url: str = "https://r.jina.ai"
    search_base_url: str = "https://s.jina.ai"
    grounding_base_url: str = "https://g.jina.ai"
    transport: Transport = _default_transport

    @classmethod
    def from_env(cls) -> "JinaClient":
        return cls(api_key=os.getenv("JINA_API_KEY"))

    def read_url(self, url: str) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderRequestError("missing_jina_api_key")
        response = self.transport(
            f"{self.reader_base_url.rstrip('/')}/{url.strip()}",
            {"Authorization": f"Bearer {self.api_key}", "Accept": "text/plain"},
            None,
            "GET",
        )
        return {
            "provider": "jina_reader",
            "content": response if isinstance(response, str) else json.dumps(response, ensure_ascii=False),
        }

    def search(self, query: str) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderRequestError("missing_jina_api_key")
        response = self.transport(
            f"{self.search_base_url.rstrip('/')}/{quote(' '.join(query.split()))}",
            {"Authorization": f"Bearer {self.api_key}", "Accept": "text/plain"},
            None,
            "GET",
        )
        return {
            "provider": "jina_search",
            "content": response if isinstance(response, str) else json.dumps(response, ensure_ascii=False),
        }

    def ground_statement(self, statement: str, references: list[str] | None = None) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderRequestError("missing_jina_api_key")
        payload: dict[str, Any] = {"statement": statement.strip()}
        if references:
            payload["references"] = references
        response = self.transport(
            self.grounding_base_url.rstrip("/"),
            _bearer_headers(self.api_key),
            payload,
            "POST",
        )
        if not isinstance(response, dict):
            raise ProviderRequestError("invalid_jina_grounding_response")
        data = response.get("data") or response
        return {
            "provider": "jina_grounding",
            "factuality": float(data.get("factuality") or 0),
            "result": bool(data.get("result")),
            "reason": data.get("reason") or "",
            "references": data.get("references") or [],
            "tokens": int((data.get("usage") or {}).get("tokens") or 0),
        }
