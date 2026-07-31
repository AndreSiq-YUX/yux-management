import unittest

from yux_agent_runtime.research import (
    SourceCandidate,
    content_hash,
    dedupe_candidates,
    dedupe_key,
    jina_reader_request,
    jina_search_request,
    normalize_url,
    opportunity_score,
)


class ResearchTest(unittest.TestCase):
    def test_normalize_url_removes_tracking_and_fragment(self):
        self.assertEqual(
            normalize_url("https://Example.com/post/?utm_source=x&utm_campaign=y#section"),
            "https://example.com/post",
        )

    def test_builds_jina_reader_and_search_requests(self):
        reader = jina_reader_request("https://example.com/post/?utm_medium=social")
        self.assertEqual(reader["request_key"], "reader:https://example.com/post")
        self.assertEqual(reader["url"], "https://r.jina.ai/https://example.com/post")

        search = jina_search_request(" crm para   pmes ", count=5)
        self.assertEqual(search["request_key"], "search:crm para pmes:5")
        self.assertEqual(search["url"], "https://s.jina.ai/crm%20para%20pmes")

    def test_candidate_generates_source_item_contract(self):
        candidate = SourceCandidate(
            title="Tendencia CRM",
            summary="Resumo",
            source_url="https://example.com/crm",
            relevance_score=90,
            novelty_score=70,
            commercial_score=80,
        )
        item = candidate.to_source_item()

        self.assertEqual(item["dedupe_key"], "https://example.com/crm")
        self.assertEqual(item["opportunity_score"], 82)
        self.assertEqual(len(item["content_hash"]), 64)

    def test_dedupe_candidates_uses_url_or_title_key(self):
        candidates = [
            SourceCandidate("Titulo", "Resumo", "https://example.com/a?utm_source=x"),
            SourceCandidate("Titulo duplicado", "Resumo", "https://example.com/a"),
            SourceCandidate("Outro titulo", "Resumo", None, source_id="source-1"),
        ]

        self.assertEqual(len(dedupe_candidates(candidates)), 2)
        self.assertEqual(dedupe_key("Outro titulo", None, "source-1"), "source-1:outro-titulo")
        self.assertEqual(content_hash("Titulo", "Resumo", "https://example.com/a"), content_hash("Titulo", "Resumo", "https://example.com/a/"))
        self.assertEqual(opportunity_score(90, 70, 80), 82)


if __name__ == "__main__":
    unittest.main()
