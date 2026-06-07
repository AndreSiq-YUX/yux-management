from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from urllib.parse import quote, urlencode, urlparse, urlunparse, parse_qsl


TRACKING_PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"}


def normalize_url(value: str | None) -> str:
    if not value or not value.strip():
        return ""
    parsed = urlparse(value.strip())
    if not parsed.scheme or not parsed.netloc:
        return value.strip().lower()
    query = urlencode([(key, val) for key, val in parse_qsl(parsed.query) if key not in TRACKING_PARAMS])
    path = parsed.path.rstrip("/") or ""
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, "", query, "")).lower()


def content_hash(title: str, summary: str = "", url: str | None = None) -> str:
    payload = f"{title.strip().lower()}|{summary.strip().lower()}|{normalize_url(url)}"
    return sha256(payload.encode("utf-8")).hexdigest()


def dedupe_key(title: str, url: str | None = None, source_id: str | None = None) -> str:
    normalized = normalize_url(url)
    if normalized:
        return normalized
    tokens = "-".join(token for token in title.lower().split() if len(token) >= 3)
    return f"{source_id or 'manual'}:{tokens or title.strip().lower()}"


def jina_reader_request(url: str) -> dict[str, str]:
    normalized = normalize_url(url)
    return {
        "provider": "jina_reader",
        "request_type": "reader",
        "request_key": f"reader:{normalized}",
        "url": f"https://r.jina.ai/{normalized}",
        "target_url": normalized,
    }


def jina_search_request(query: str, count: int = 10) -> dict[str, str | int]:
    clean_query = " ".join(query.strip().split())
    return {
        "provider": "jina_search",
        "request_type": "search",
        "request_key": f"search:{clean_query.lower()}:{count}",
        "url": f"https://s.jina.ai/{quote(clean_query)}",
        "query": clean_query,
        "count": count,
    }


@dataclass(frozen=True)
class SourceCandidate:
    title: str
    summary: str
    source_url: str | None = None
    source_id: str | None = None
    relevance_score: int = 0
    novelty_score: int = 0
    commercial_score: int = 0

    def to_source_item(self) -> dict[str, object]:
        return {
            "title": self.title.strip(),
            "summary": self.summary.strip(),
            "source_url": self.source_url,
            "normalized_url": normalize_url(self.source_url),
            "content_hash": content_hash(self.title, self.summary, self.source_url),
            "dedupe_key": dedupe_key(self.title, self.source_url, self.source_id),
            "relevance_score": clamp_score(self.relevance_score),
            "novelty_score": clamp_score(self.novelty_score),
            "commercial_score": clamp_score(self.commercial_score),
            "opportunity_score": opportunity_score(self.relevance_score, self.novelty_score, self.commercial_score),
        }


def opportunity_score(relevance: int, novelty: int, commercial: int) -> int:
    return round((clamp_score(relevance) * 0.4) + (clamp_score(commercial) * 0.4) + (clamp_score(novelty) * 0.2))


def dedupe_candidates(candidates: list[SourceCandidate]) -> list[SourceCandidate]:
    seen: set[str] = set()
    unique: list[SourceCandidate] = []
    for candidate in candidates:
        key = dedupe_key(candidate.title, candidate.source_url, candidate.source_id)
        if key in seen:
            continue
        seen.add(key)
        unique.append(candidate)
    return unique


def clamp_score(value: int) -> int:
    return max(0, min(100, int(value)))
