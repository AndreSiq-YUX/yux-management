import unittest

from yux_agent_runtime.strategy import (
    StrategyActionBlocked,
    build_agent_handoff,
    build_strategy_context_pack,
    build_recommendation_payload,
    enforce_profile_action_policy,
    select_skill_pack,
    select_strategy_profile,
)


PROFILES = {
    "ai_sdr_comercial_1": {
        "id": "profile-sdr",
        "profile_key": "ai_sdr_comercial_1",
        "display_name": "AI SDR",
        "allowed_actions": ["qualify_lead", "create_crm_task"],
        "forbidden_actions": ["activate_campaign", "promise_discount", "send_contractual_commitment"],
        "requires_human_approval_for": ["send_external_message"],
        "default_context_policy": {"max_cards": 4, "max_chunks": 2},
    },
    "support_assistant": {
        "id": "profile-support",
        "profile_key": "support_assistant",
        "display_name": "Support Assistant",
        "allowed_actions": ["answer_support_question", "create_support_ticket"],
        "forbidden_actions": ["send_sales_pressure_message", "promise_discount", "activate_campaign"],
        "requires_human_approval_for": [],
    },
    "ai_closer": {
        "id": "profile-closer",
        "profile_key": "ai_closer",
        "display_name": "AI Closer",
        "allowed_actions": ["follow_up_proposal", "schedule_meeting"],
        "forbidden_actions": ["promise_discount_without_approved_offer", "change_proposal_terms_without_approval"],
        "requires_human_approval_for": ["send_external_message"],
    },
    "marketing_strategist": {
        "id": "profile-marketing",
        "profile_key": "marketing_strategist",
        "display_name": "Marketing Strategist",
        "allowed_actions": ["draft_campaign", "brief_writer"],
        "forbidden_actions": ["publish_without_approval", "activate_paid_campaign_without_approval"],
        "requires_human_approval_for": ["publish_content"],
    },
    "metrics_cash_mroi": {
        "id": "profile-metrics",
        "profile_key": "metrics_cash_mroi",
        "display_name": "Metrics & Cash",
        "allowed_actions": ["analyze_metrics", "recommend_budget_change"],
        "forbidden_actions": ["change_ads_budget_without_approval", "alter_financial_records"],
        "requires_human_approval_for": ["change_ads_budget"],
    },
    "growth_strategist": {
        "id": "profile-growth",
        "profile_key": "growth_strategist",
        "display_name": "Growth Strategist",
        "allowed_actions": ["diagnose_growth_system", "create_internal_recommendation"],
        "forbidden_actions": ["send_external_message", "publish_without_approval"],
        "requires_human_approval_for": ["create_client_visible_recommendation"],
        "default_context_policy": {"allow_internal_sources": True, "max_cards": 8},
    },
}


class StrategyPolicyTest(unittest.TestCase):
    def test_sdr_rejects_activate_campaign(self):
        with self.assertRaisesRegex(StrategyActionBlocked, "activate_campaign"):
            enforce_profile_action_policy(PROFILES["ai_sdr_comercial_1"], "activate_campaign")

    def test_support_rejects_sales_pressure(self):
        with self.assertRaisesRegex(StrategyActionBlocked, "send_sales_pressure_message"):
            enforce_profile_action_policy(PROFILES["support_assistant"], "send_sales_pressure_message")

    def test_closer_rejects_unapproved_discount(self):
        with self.assertRaisesRegex(StrategyActionBlocked, "promise_discount_without_approved_offer"):
            enforce_profile_action_policy(PROFILES["ai_closer"], "promise_discount_without_approved_offer")

    def test_marketing_strategist_rejects_publish_without_approval(self):
        with self.assertRaisesRegex(StrategyActionBlocked, "publish_without_approval"):
            enforce_profile_action_policy(PROFILES["marketing_strategist"], "publish_without_approval")

    def test_metrics_cash_rejects_budget_change_without_approval(self):
        with self.assertRaisesRegex(StrategyActionBlocked, "change_ads_budget_without_approval"):
            enforce_profile_action_policy(PROFILES["metrics_cash_mroi"], "change_ads_budget_without_approval")

    def test_growth_strategist_reads_broad_context_but_cannot_send_external_message(self):
        profile = PROFILES["growth_strategist"]
        self.assertTrue(profile["default_context_policy"]["allow_internal_sources"])
        with self.assertRaisesRegex(StrategyActionBlocked, "send_external_message"):
            enforce_profile_action_policy(profile, "send_external_message")

    def test_allowed_action_returns_policy_result(self):
        result = enforce_profile_action_policy(PROFILES["ai_sdr_comercial_1"], "qualify_lead")

        self.assertEqual(result["status"], "allowed")
        self.assertFalse(result["requires_approval"])

    def test_action_requiring_approval_returns_approval_result(self):
        result = enforce_profile_action_policy(PROFILES["ai_sdr_comercial_1"], "send_external_message")

        self.assertEqual(result["status"], "approval_required")
        self.assertTrue(result["requires_approval"])

    def test_select_strategy_profile_prefers_direct_profile_key(self):
        selected = select_strategy_profile(
            {"strategy_profile_key": "ai_sdr_comercial_1", "agent_type": "content_radar"},
            [],
            profiles=list(PROFILES.values()),
        )

        self.assertEqual(selected["profile_key"], "ai_sdr_comercial_1")

    def test_select_strategy_profile_uses_active_binding(self):
        selected = select_strategy_profile(
            {"agent_type": "content_radar"},
            [
                {"binding_type": "marketing_agent_type", "binding_key": "content_radar", "profile_key": "marketing_strategist", "status": "active"},
                {"binding_type": "marketing_agent_type", "binding_key": "content_radar", "profile_key": "support_assistant", "status": "disabled"},
            ],
            profiles=list(PROFILES.values()),
        )

        self.assertEqual(selected["profile_key"], "marketing_strategist")

    def test_select_skill_pack_orders_profile_skills_and_sections(self):
        skills = [
            {
                "skill_key": "offer_conversion",
                "priority": 20,
                "sections": [{"title": "Oferta", "priority": 2}, {"title": "Objeções", "priority": 1}],
            },
            {
                "skill_key": "growth_core",
                "priority": 10,
                "sections": [{"title": "Prioridade de caixa", "priority": 1}],
            },
        ]

        pack = select_skill_pack(PROFILES["growth_strategist"], skills)

        self.assertEqual([skill["skill_key"] for skill in pack["skills"]], ["growth_core", "offer_conversion"])
        self.assertEqual(pack["skills"][1]["sections"][0]["title"], "Objeções")

    def test_build_agent_handoff_requires_profiles_and_objective(self):
        handoff = build_agent_handoff(
            PROFILES["ai_sdr_comercial_1"],
            PROFILES["ai_closer"],
            "Conduzir follow-up de proposta com objeção de preço.",
            {"lead_id": "lead-1", "urgency": "high", "requested_output": "mensagem de follow-up"},
        )

        self.assertEqual(handoff["source_profile_key"], "ai_sdr_comercial_1")
        self.assertEqual(handoff["target_profile_key"], "ai_closer")
        self.assertEqual(handoff["related_record_id"], "lead-1")
        self.assertEqual(handoff["status"], "pending")

    def test_build_recommendation_payload_requires_operational_fields(self):
        payload = build_recommendation_payload(
            PROFILES["marketing_strategist"],
            {
                "objective": "Recuperar oportunidades paradas",
                "audience": "quase-clientes",
                "stage": "almost_customer",
                "action": "Criar sequência de follow-up",
                "channel": "whatsapp",
                "owner": "comercial",
                "metric": "reunioes_agendadas",
                "next_step": "Aprovar roteiro",
                "confidence": 0.74,
                "requires_approval": True,
                "supporting_cards": ["card-closing"],
            },
        )

        self.assertEqual(payload["profile_key"], "marketing_strategist")
        self.assertTrue(payload["requires_approval"])
        self.assertEqual(payload["supporting_cards"], ["card-closing"])

    def test_build_recommendation_payload_rejects_missing_required_field(self):
        with self.assertRaisesRegex(ValueError, "next_step"):
            build_recommendation_payload(
                PROFILES["marketing_strategist"],
                {
                    "objective": "Gerar demanda",
                    "audience": "leads",
                    "stage": "lead_warm",
                    "action": "Criar conteúdo",
                    "channel": "linkedin",
                    "owner": "marketing",
                    "metric": "levantadas_de_mao",
                    "confidence": 0.6,
                    "requires_approval": False,
                    "supporting_cards": [],
                },
            )

    def test_build_strategy_context_pack_excludes_raw_internal_chunks_by_default(self):
        pack = build_strategy_context_pack(
            PROFILES["growth_strategist"],
            {
                "rules": ["Nunca recomendar lead frio antes de avaliar base atual."],
                "context_policy": {"allow_internal_sources": False},
            },
            {
                "cards": [
                    {
                        "id": "card-1",
                        "concept": "Comercial 2",
                        "visibility": "internal_only",
                        "problem_solved": "Cliente compra uma vez e desaparece.",
                    }
                ],
                "chunks": [
                    {
                        "id": "chunk-internal",
                        "visibility": "internal_only",
                        "source_scope": "internal",
                        "chunk_text": "Texto bruto interno do livro.",
                    },
                    {
                        "id": "chunk-client-safe",
                        "visibility": "client_safe",
                        "source_scope": "system",
                        "chunk_text": "Resumo operacional seguro.",
                    },
                ],
            },
            commercial_stage="raised_hand",
        )

        self.assertEqual(pack["profile_key"], "growth_strategist")
        self.assertEqual(pack["commercial_stage"], "raised_hand")
        self.assertEqual(pack["skill_rules"], ["Nunca recomendar lead frio antes de avaliar base atual."])
        self.assertEqual([chunk["id"] for chunk in pack["chunks"]], ["chunk-client-safe"])
        self.assertNotIn("Texto bruto interno do livro.", str(pack))
        self.assertEqual(len(pack["context_hash"]), 64)

    def test_build_strategy_context_pack_allows_internal_chunks_when_enabled(self):
        pack = build_strategy_context_pack(
            PROFILES["growth_strategist"],
            {"rules": [], "context_policy": {"allow_internal_sources": True}},
            {
                "chunks": [
                    {
                        "id": "chunk-internal",
                        "visibility": "internal_only",
                        "source_scope": "internal",
                        "chunk_text": "Texto bruto interno do livro.",
                    },
                ],
            },
        )

        self.assertEqual(pack["chunks"][0]["chunk_text"], "Texto bruto interno do livro.")

    def test_strategy_context_hash_changes_when_retrieved_cards_change(self):
        base_pack = build_strategy_context_pack(
            PROFILES["ai_sdr_comercial_1"],
            {"rules": ["Pergunte antes de apresentar solução."]},
            {"cards": [{"id": "card-1", "concept": "SPIN SDR"}]},
        )
        changed_pack = build_strategy_context_pack(
            PROFILES["ai_sdr_comercial_1"],
            {"rules": ["Pergunte antes de apresentar solução."]},
            {"cards": [{"id": "card-2", "concept": "Follow-up SDR"}]},
        )

        self.assertNotEqual(base_pack["context_hash"], changed_pack["context_hash"])


if __name__ == "__main__":
    unittest.main()
