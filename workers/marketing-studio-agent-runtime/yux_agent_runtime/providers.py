from __future__ import annotations

import json
import os
from hashlib import sha256
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


class ProviderRequestError(Exception):
    """Raised when a live provider request fails with a protected message."""


Transport = Callable[[str, dict[str, str], dict[str, Any] | None, str], dict[str, Any] | str]


def _default_transport(url: str, headers: dict[str, str], payload: dict[str, Any] | None, method: str) -> dict[str, Any] | str:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=data, method=method, headers=headers)
    try:
        with urlopen(request, timeout=45) as response:  # nosec B310 - URLs are fixed provider endpoints.
            text = response.read().decode("utf-8")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise ProviderRequestError(f"provider_http_{error.code}:{body[:240]}") from error
    except Exception as error:  # pragma: no cover - exercised through mocked transport.
        raise ProviderRequestError(str(error)) from error

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
    transport: Transport = _default_transport

    @classmethod
    def from_env(cls) -> "OpenRouterClient":
        return cls(api_key=os.getenv("OPENROUTER_API_KEY"))

    def chat_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 1200,
        temperature: float = 0.4,
        fallback_models: list[str] | None = None,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderRequestError("missing_openrouter_api_key")

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        if fallback_models:
            payload["models"] = [model, *fallback_models]
        if session_id:
            payload["session_id"] = session_id

        response = self.transport(
            f"{self.base_url.rstrip('/')}/chat/completions",
            _bearer_headers(self.api_key, {"X-OpenRouter-Experimental-Metadata": "enabled"}),
            payload,
            "POST",
        )
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
        return {
            "provider": "openrouter",
            "model": response.get("model") or model,
            "content": message.get("content") or "",
            "finish_reason": choice.get("finish_reason"),
            "input_tokens": int(usage.get("prompt_tokens") or 0),
            "output_tokens": int(usage.get("completion_tokens") or 0),
            "total_tokens": int(usage.get("total_tokens") or 0),
            "raw_response_id": response.get("id"),
            "request_parameters": {"temperature": temperature, "max_tokens": max_tokens},
            "prompt_hash": sha256(json.dumps(messages, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
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

    def embed_texts(self, texts: list[str], *, task: str, model: str = "jina-embeddings-v3", dimensions: int = 1024) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderRequestError("missing_jina_api_key")
        response = self.transport(
            "https://api.jina.ai/v1/embeddings",
            _bearer_headers(self.api_key),
            {"model": model, "task": task, "normalized": True, "embedding_type": "float", "dimensions": dimensions, "input": texts},
            "POST",
        )
        if not isinstance(response, dict):
            raise ProviderRequestError("invalid_jina_embeddings_response")
        records = sorted(response.get("data") or [], key=lambda item: int(item.get("index") or 0))
        vectors = [item.get("embedding") for item in records]
        if len(vectors) != len(texts) or any(not isinstance(vector, list) or len(vector) != dimensions for vector in vectors):
            raise ProviderRequestError("invalid_jina_embedding_vector")
        return {"model": response.get("model") or model, "dimensions": dimensions, "vectors": vectors, "tokens": int((response.get("usage") or {}).get("total_tokens") or 0)}

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
