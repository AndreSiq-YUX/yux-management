import unittest

from yux_agent_runtime.campaign import (
    CampaignBrief,
    build_campaign_context,
    draft_campaign_creative_package,
    normalize_campaign_name,
    slugify,
)


class CampaignTest(unittest.TestCase):
    def test_builds_campaign_context_and_creative_package(self):
        brief = CampaignBrief(
            title="CRM para PMEs",
            offer="CRM YUX",
            audience="donos de PMEs",
            landing_page_url="https://example.com/crm",
            cta="Fale com a YUX",
            daily_budget=80,
        )
        context = build_campaign_context(
            brief,
            brand_summary="consultiva e direta",
            proof_points=["Centralize leads e follow-ups."],
            source_content="Post aprovado sobre CRM.",
        )
        package = draft_campaign_creative_package(brief, context)

        self.assertEqual(context["landing_page_url"], "https://example.com/crm")
        self.assertEqual(package["campaign_name"], "Campanha CRM para PMEs")
        self.assertEqual(package["provider"], "meta")
        self.assertEqual(package["objective"], "lead_generation")
        self.assertEqual(package["utm_campaign"], "campanha_crm_para_pmes")
        self.assertEqual(len(package["copy_variations"]), 2)
        self.assertEqual(len(package["creative_concepts"]), 2)
        self.assertGreaterEqual(package["quality_score"], 80)

    def test_normalizes_campaign_name_and_slug(self):
        self.assertEqual(normalize_campaign_name("Campanha Growth"), "Campanha Growth")
        self.assertEqual(normalize_campaign_name("CRM para PMEs"), "Campanha CRM para PMEs")
        self.assertEqual(slugify("Campanha CRM para PMEs!"), "campanha_crm_para_pmes")


if __name__ == "__main__":
    unittest.main()
