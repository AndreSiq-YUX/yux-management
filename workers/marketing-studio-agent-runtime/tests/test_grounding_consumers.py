import hashlib
import json
import unittest

from yux_agent_runtime.mission_contracts import MissionConversationTurnRequestWire, MissionSourceRefWire
from yux_agent_runtime.mission_conversation import (
    build_mission_source_catalog,
    normalize_mission_conversation_response,
)
from yux_agent_runtime.workflow import resolve_retrieval_audience


STRATEGY_ID = "10000000-0000-4000-8000-000000000011"
STRATEGY_PUBLICATION_ID = "10000000-0000-4000-8000-000000000012"
STRATEGY_ITEM_ID = "10000000-0000-4000-8000-000000000013"
COMPANY_ID = "20000000-0000-4000-8000-000000000011"
COMPANY_PUBLICATION_ID = "20000000-0000-4000-8000-000000000012"


def canonical_hash(value):
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class GroundingConsumerTest(unittest.TestCase):
    def test_all_six_consumers_resolve_the_canonical_policy_audience(self):
        consumers = {
            "marketing": ("marketing_studio", None, "client_user"),
            "radar": ("radar", None, "client_user"),
            "automation_ai": ("automation", None, "client_user"),
            "omnichannel": ("whatsapp", None, "external_contact"),
            "strategy_chat": ("strategy_admin", None, "internal_operator"),
            "supervisor": ("mission_intake", "client_user", "client_user"),
        }

        self.assertEqual(
            {name: resolve_retrieval_audience(source, requested) for name, (source, requested, _) in consumers.items()},
            {name: expected for name, (_, _, expected) in consumers.items()},
        )
        self.assertEqual(resolve_retrieval_audience("mission_intake", "internal_operator"), "internal_operator")
        self.assertEqual(resolve_retrieval_audience("automation", "external_contact"), "client_user")

    def test_bridge_preserves_published_identity_and_common_hash_formula(self):
        strategy_content = "Diagnóstico aprovado\nEvita campanha prematura\nValidar oferta"
        company_content = "Oferta publicada e aprovada para PMEs."
        catalog = build_mission_source_catalog({
            "cards": [{
                "id": STRATEGY_ID,
                "publication_id": STRATEGY_PUBLICATION_ID,
                "item_id": STRATEGY_ITEM_ID,
                "content": strategy_content,
                "title": "Diagnóstico aprovado",
                "use_mode": "quotable",
                "binding_fingerprint": "a" * 64,
                "knowledge_policy_version": 1,
            }],
            "chunks": [{
                "id": f"company:{COMPANY_ID}",
                "publication_id": COMPANY_PUBLICATION_ID,
                "item_id": COMPANY_ID,
                "content": company_content,
                "title": "Oferta publicada",
                "source_scope": "organization",
                "use_mode": "internal_reasoning",
                "binding_fingerprint": "b" * 64,
                "knowledge_policy_version": 1,
            }],
        }, "client_user")

        strategy = next(item for item in catalog if item.ref.startswith("yux:"))
        company = next(item for item in catalog if item.ref.startswith("customer:"))
        self.assertEqual(strategy.kind, "strategy_card")
        self.assertEqual(strategy.version, STRATEGY_PUBLICATION_ID)
        self.assertEqual(strategy.publicationId, STRATEGY_PUBLICATION_ID)
        self.assertEqual(strategy.itemId, STRATEGY_ITEM_ID)
        self.assertEqual(strategy.knowledgePolicyVersion, 1)
        self.assertEqual(strategy.useMode, "quotable")
        self.assertEqual(strategy.bindingFingerprint, "a" * 64)
        self.assertEqual(strategy.contentHash, canonical_hash({
            "id": STRATEGY_ID, "version": STRATEGY_PUBLICATION_ID, "content": strategy_content,
        }))
        self.assertEqual(company.kind, "knowledge_chunk")
        self.assertEqual(company.version, COMPANY_PUBLICATION_ID)
        self.assertEqual(company.itemId, COMPANY_ID)
        self.assertEqual(company.contentHash, canonical_hash({
            "id": COMPANY_ID, "version": COMPANY_PUBLICATION_ID, "content": company_content,
        }))

    def test_historical_reference_keeps_legacy_rules_and_governed_identity_is_all_or_none(self):
        [legacy] = build_mission_source_catalog({
            "cards": [{
                "id": "legacy-card", "concept": "Regra histórica", "visibility": "internal_only", "version": "7",
            }],
        }, "internal_operator")
        self.assertEqual(legacy.version, "7")
        self.assertIsNone(legacy.publicationId)
        self.assertIsNone(legacy.bindingFingerprint)

        with self.assertRaisesRegex(ValueError, "mission_source_governed_identity_incomplete"):
            MissionSourceRefWire.model_validate({
                **legacy.model_dump(),
                "publicationId": STRATEGY_PUBLICATION_ID,
            })

    def test_invented_model_reference_returns_a_structured_error_without_retry_loop(self):
        typed_request = MissionConversationTurnRequestWire.model_validate({
            "schemaVersion": 1,
            "organization_id": "org-a",
            "conversation_id": "conversation-a",
            "audience": "client_user",
            "user_message": "Planeje uma campanha",
            "transcript": [],
            "operationalContext": {},
            "allowedActionPacks": [],
            "allowedCapabilityKeys": [],
        })
        with self.assertRaisesRegex(ValueError, "mission_conversation_unknown_source_ref:yux:invented"):
            normalize_mission_conversation_response(
                {
                    "kind": "message", "reply": "Resposta", "understood": {}, "questions": [],
                    "readiness": {"status": "needs_information", "knownFacts": [], "assumptions": [], "missing": []},
                    "brief": {"objective": "Planejar", "requestedOutcome": "Campanha"},
                    "suggestedActions": [], "sourceRefs": ["yux:invented"],
                },
                request=typed_request,
                retrieval_context={},
                retrieval_trace_id="run-1",
                provider={},
            )


if __name__ == "__main__":
    unittest.main()
