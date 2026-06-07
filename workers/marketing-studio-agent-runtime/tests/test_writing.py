import unittest

from yux_agent_runtime.writing import (
    WritingBrief,
    build_writer_context,
    draft_multichannel_content,
    jina_grounding_request,
    requires_grounding,
    review_content_quality,
)


class WritingTest(unittest.TestCase):
    def test_builds_writer_context_and_draft_contract(self):
        brief = WritingBrief(
            title="Post sobre CRM",
            objective="Explicar como CRM ajuda PMEs",
            channel="linkedin",
            cta="Fale com a YUX",
        )
        context = build_writer_context(
            brief,
            brand_summary="consultiva e direta",
            products=["CRM YUX"],
            knowledge_snippets=["A marca fala com clareza."],
        )
        draft = draft_multichannel_content(brief, context)

        self.assertEqual(context["channel"], "linkedin")
        self.assertEqual(draft["title"], "Post sobre CRM")
        self.assertIn("consultiva e direta", draft["body"])
        self.assertEqual(draft["cta"], "Fale com a YUX")
        self.assertEqual(draft["variation_count"], 1)

    def test_review_flags_factual_claims_and_grounding_request(self):
        draft = {
            "title": "Como reduzir CPL",
            "body": "Pesquisa indica reducao de 20% no CPL quando CRM e landing pages estao conectados. Fale com a YUX.",
            "cta": "Fale com a YUX",
            "content_type": "blog_article",
        }
        review = review_content_quality(draft)

        self.assertTrue(requires_grounding(draft["body"], "blog_article"))
        self.assertEqual(review["status"], "needs_changes")
        self.assertIn("factual_claim", review["risk_flags"])
        self.assertTrue(review["grounding_required"])

        request = jina_grounding_request(draft["body"], claim_id="content-1")
        self.assertEqual(request["provider"], "jina_grounding")
        self.assertEqual(request["request_key"], "grounding:content-1")

    def test_review_blocks_forbidden_topics(self):
        review = review_content_quality(
            {
                "title": "Promessa garantida",
                "body": "Resultado garantido para todas as empresas. Fale com a YUX.",
                "cta": "Fale com a YUX",
            },
            forbidden_topics=["resultado garantido"],
        )

        self.assertEqual(review["status"], "needs_changes")
        self.assertIn("forbidden_topic", review["risk_flags"])


if __name__ == "__main__":
    unittest.main()
