from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from hashlib import sha256

from .providers import JinaClient, ProviderRequestError


@dataclass
class QueryEmbeddingService:
    client: JinaClient
    model: str = field(default_factory=lambda: os.getenv("JINA_EMBEDDING_MODEL", "jina-embeddings-v3"))
    dimensions: int = field(default_factory=lambda: int(os.getenv("JINA_EMBEDDING_DIMENSIONS", "1024")))
    ttl_seconds: int = 300
    cache: dict[str, tuple[float, list[float]]] = field(default_factory=dict)

    def embed_query(self, query: str) -> list[float] | None:
        clean = " ".join(query.split())
        if not clean:
            return None
        key = sha256(f"{self.model}:{clean}".encode("utf-8")).hexdigest()
        cached = self.cache.get(key)
        now = time.monotonic()
        if cached and cached[0] > now:
            return cached[1]
        try:
            vector = self.client.embed_texts([clean], task="retrieval.query", model=self.model, dimensions=self.dimensions)["vectors"][0]
        except ProviderRequestError:
            return None
        self.cache[key] = (now + self.ttl_seconds, vector)
        return vector
