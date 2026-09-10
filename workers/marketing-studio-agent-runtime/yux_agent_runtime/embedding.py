from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from hashlib import sha256

from .providers import OpenRouterClient, ProviderRequestError


@dataclass
class QueryEmbeddingService:
    client: OpenRouterClient
    model: str = field(default_factory=lambda: os.getenv("OPENROUTER_EMBEDDING_MODEL", "google/gemini-embedding-2"))
    dimensions: int = field(default_factory=lambda: int(os.getenv("OPENROUTER_EMBEDDING_DIMENSIONS", "768")))
    ttl_seconds: int = 300
    cache: dict[str, tuple[float, list[float]]] = field(default_factory=dict)

    def embed_query(self, query: str) -> list[float] | None:
        clean = " ".join(query.split())
        if not clean:
            return None
        key = sha256(f"{self.model}:{self.dimensions}:{clean}".encode("utf-8")).hexdigest()
        cached = self.cache.get(key)
        now = time.monotonic()
        if cached and cached[0] > now:
            return cached[1]
        try:
            vector = self.client.embed_texts([clean], input_type="search_query", model=self.model, dimensions=self.dimensions)["vectors"][0]
        except ProviderRequestError:
            return None
        self.cache[key] = (now + self.ttl_seconds, vector)
        return vector
