import json
import unittest

from yux_agent_runtime.mission_conversation import MissionConversationWorkflow
from yux_agent_runtime.providers import OpenRouterClient
from yux_agent_runtime.runtime_factory import build_strategy_workflow_engine
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


def request(audience="client_user"):
    return {
        "schemaVersion": 1,
        "organization_id": "org-a",
        "client_id": "client-a",
        "contract_id": "contract-a",
        "conversation_id": "conversation-a",
        "audience": audience,
        "user_message": "Quero uma campanha para captar PMEs locais",
        "transcript": [{"role": "user", "content": "Precisamos gerar oportunidades"}],
        "rollingSummary": "Cliente quer aquisição local.",
        "currentBrief": {"objective": "Captar leads"},
        "operationalContext": {"availableModules": ["campaigns", "crm"]},
        "allowedActionPacks": [{
            "key": "campaign_launch_v1", "version": "1.0.0", "contentHash": "a" * 64,
        }],
        "allowedCapabilityKeys": ["campaign.draft"],
    }


class MissionConversationWorkflowTest(unittest.TestCase):
    def make_store(self):
        return InMemoryAgentRuntimeStore(tables={
            "yux_strategy_agent_profiles": [{
                "id": "profile-growth", "profile_key": "growth_strategist", "status": "active",
                "purpose": "Planejar crescimento com a metodologia YUX.", "allowed_tools": [],
                "forbidden_actions": [], "max_cards": 4, "max_chunks": 4,
            }],
            "marketing_agent_global_prompts": [{
                "id": "prompt-growth", "agent_type": "growth_strategist", "status": "active",
                "system_prompt": "Responda em JSON e use somente o contexto fornecido.", "prompt_version": 1,
            }],
            "model_routing_rules": [{
                "id": "route-growth", "agent_type": "growth_strategist", "routing_tier": "default",
                "provider": "openrouter", "model_name": "test/model", "status": "active",
                "max_output_tokens": 1800, "temperature": 0,
            }],
            "yux_strategy_concept_cards": [{
                "id": "card-growth", "concept": "Diagnóstico antes do canal", "category": "growth",
                "problem_solved": "Evita campanha sem oferta e público definidos.",
                "recommended_actions": ["Validar oferta e público"], "status": "active",
                "visibility": "internal_only", "human_review_status": "approved",
                "allowed_agent_profile_keys": ["growth_strategist"],
            }],
            "yux_strategy_source_chunks": [],
            "yux_strategy_source_assets": [],
            "organization_company_profiles": [{
                "id": "company-a", "organization_id": "org-a", "trade_name": "Empresa A",
                "industry": "Serviços", "positioning": "Crescimento previsível",
            }],
            "marketing_brand_profiles": [{
                "id": "brand-a", "organization_id": "org-a", "contract_id": "contract-a",
                "status": "active", "brand_voice_summary": "Consultiva", "tone_of_voice": "direto",
                "vocabulary_dont": ["garantido"],
            }],
            "marketing_products_services": [{
                "id": "product-a", "organization_id": "org-a", "status": "active",
                "name": "Consultoria", "description": "Estratégia comercial",
                "target_audience": "PMEs locais", "proof_points": ["20 projetos"],
                "objections": ["falta de tempo"], "cta": "Agendar diagnóstico",
            }],
            "knowledge_sources": [{
                "id": "source-a", "organization_id": "org-a", "status": "published",
                "visibility": "both", "allowed_agent_profile_keys": [], "blocked_agent_profile_keys": [],
            }, {
                "id": "source-internal", "organization_id": "org-a", "status": "published",
                "visibility": "internal", "allowed_agent_profile_keys": [], "blocked_agent_profile_keys": [],
            }, {
                "id": "source-other", "organization_id": "org-b", "status": "published", "visibility": "both",
            }],
            "knowledge_entries": [{
                "id": "entry-a", "organization_id": "org-a", "source_id": "source-a",
                "title": "Oferta", "body": "A oferta começa por diagnóstico.", "status": "published",
            }, {
                "id": "entry-internal", "organization_id": "org-a", "source_id": "source-internal",
                "title": "Nota privada", "body": "Segredo interno do cliente.", "status": "published",
            }, {
                "id": "entry-other", "organization_id": "org-b", "source_id": "source-other",
                "title": "Outro tenant", "body": "Não pode vazar.", "status": "published",
            }],
            "marketing_knowledge_documents": [{
                "id": "doc-a", "organization_id": "org-a", "source_id": "source-a", "status": "published",
            }],
            "marketing_knowledge_chunks": [{
                "id": "chunk-a", "organization_id": "org-a", "document_id": "doc-a",
                "entry_id": "entry-a", "chunk_kind": "curated_fact", "curation_status": "approved",
                "body": "Diagnóstico comercial antes da campanha.", "quality_score": 1,
            }],
        })

    def make_workflow(self, captured):
        def transport(_url, _headers, payload, _method):
            captured.append(payload)
            body = {
                "kind": "questions",
                "reply": "Já considerei sua oferta e a metodologia YUX. Preciso confirmar o orçamento.",
                "understood": {"objective": "Captar PMEs locais"},
                "questions": [{
                    "key": "budget", "label": "Qual é o orçamento total?",
                    "whyNeeded": "Define o limite da campanha.", "priority": 1,
                    "answerType": "currency", "choices": [],
                }],
                "readiness": {
                    "status": "needs_information",
                    "knownFacts": [
                        {"key": "method", "value": "diagnosis_first", "sourceRef": "yux:card-growth"},
                        {"key": "offer", "value": "Consultoria", "sourceRef": "customer:chunk-a"},
                    ],
                    "assumptions": [],
                    "missing": [{
                        "key": "budget", "category": "budget", "reason": "Orçamento não informado.",
                        "requiredFor": ["campaign"],
                    }],
                },
                "brief": {
                    "title": "Campanha para PMEs locais", "objective": "Captar PMEs locais",
                    "requestedOutcome": "Leads qualificados", "scopeHints": ["campaign"],
                    "constraints": {}, "acceptanceCriteria": [], "packKeys": ["campaign_launch_v1"],
                    "mode": "assisted",
                },
                "suggestedActions": [{
                    "key": "answer_budget", "label": "Informar orçamento", "kind": "quick_reply",
                    "payload": {},
                }],
                "sourceRefs": ["yux:card-growth", "customer:chunk-a"],
            }
            return {
                "id": "response-1", "model": payload["model"],
                "choices": [{"message": {"content": json.dumps(body)}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 120, "completion_tokens": 80, "total_tokens": 200},
            }

        engine = build_strategy_workflow_engine(
            self.make_store(), OpenRouterClient(api_key="test", transport=transport)
        )
        return MissionConversationWorkflow(engine)

    def test_reuses_harness_strategy_company_brand_product_and_curated_context(self):
        captured = []
        workflow = self.make_workflow(captured)

        response = workflow.respond(request())

        self.assertEqual(response.kind, "questions")
        self.assertEqual(response.usage.totalTokens, 200)
        self.assertTrue(response.retrievalTraceId)
        self.assertEqual({item.ref for item in response.sources}, {"yux:card-growth", "customer:chunk-a"})
        yux_source = next(item for item in response.sources if item.ref == "yux:card-growth")
        self.assertEqual(yux_source.title, "Metodologia YUX")
        self.assertEqual(yux_source.displayMode, "generic")
        prompt = json.dumps(captured[0], ensure_ascii=False)
        self.assertIn("Empresa A", prompt)
        self.assertIn("Consultiva", prompt)
        self.assertIn("PMEs locais", prompt)
        self.assertIn("20 projetos", prompt)
        self.assertIn("falta de tempo", prompt)
        self.assertIn("Agendar diagnóstico", prompt)
        self.assertIn("Diagnóstico comercial antes da campanha", prompt)
        self.assertNotIn("Segredo interno do cliente", prompt)
        self.assertNotIn("Não pode vazar", prompt)

    def test_context_hash_is_deterministic_and_trace_id_is_per_run(self):
        captured = []
        workflow = self.make_workflow(captured)

        first = workflow.respond(request())
        second = workflow.respond(request())

        self.assertEqual(first.contextHash, second.contextHash)
        self.assertNotEqual(first.retrievalTraceId, second.retrievalTraceId)

    def test_internal_operator_receives_named_internal_yux_evidence(self):
        captured = []
        response = self.make_workflow(captured).respond(request("internal_operator"))

        yux_source = next(item for item in response.sources if item.ref == "yux:card-growth")
        self.assertEqual(yux_source.title, "Diagnóstico antes do canal")
        self.assertEqual(yux_source.displayMode, "named")


if __name__ == "__main__":
    unittest.main()
