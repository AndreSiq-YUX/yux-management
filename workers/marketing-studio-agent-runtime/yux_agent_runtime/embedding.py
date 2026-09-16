from __future__ import annotations

import os
import json
import time
from dataclasses import dataclass, field
from hashlib import sha256

from .providers import OpenRouterClient, ProviderRequestError


@dataclass
class QueryEmbeddingService:
    client: OpenRouterClient
    model: str = field(default_factory=lambda: os.getenv("OPENROUTER_EMBEDDING_MODEL", "qwen/qwen3-embedding-8b"))
    dimensions: int = field(default_factory=lambda: int(os.getenv("OPENROUTER_EMBEDDING_DIMENSIONS", "1024")))
    ttl_seconds: int = 300
    cache: dict[str, tuple[float, list[float], str, int]] = field(default_factory=dict)

    def embed_query(self, query: str) -> list[float] | None:
        clean = " ".join(query.split())
        if not clean:
            return None
        routed = callable(getattr(self.client, "configuration", None))
        try:
            configuration = self.client.configuration() if routed else None
            identity = json.dumps(configuration[0]["attempts"], sort_keys=True) if configuration else self.model
            key = sha256(f"{identity}:{self.dimensions}:{clean}".encode("utf-8")).hexdigest()
            now = time.monotonic()
            cached = self.cache.get(key)
            if cached and cached[0] > now:
                self.model, self.dimensions = cached[2], cached[3]
                return cached[1]
            response = self.client.embed_texts([clean], input_type="search_query", model=self.model, dimensions=self.dimensions, **({"configuration": configuration} if routed else {}))
            vector = response["vectors"][0]
            self.model = str(response.get("model") or self.model)
            self.dimensions = int(response.get("dimensions") or self.dimensions)
        except ProviderRequestError:
            return None
        self.cache[key] = (now + self.ttl_seconds, vector, self.model, self.dimensions)
        return vector
