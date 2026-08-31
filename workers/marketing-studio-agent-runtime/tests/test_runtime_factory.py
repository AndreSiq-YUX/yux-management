import json
import unittest

from yux_agent_runtime.providers import OpenRouterClient
from yux_agent_runtime.runtime_factory import RuntimeStrategyKnowledgeStore, build_strategy_workflow_engine
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore


class RuntimeFactoryTest(unittest.TestCase):
    def test_runtime_strategy_store_joins_latest_card_and_chunk_embeddings(self):
        store = InMemoryAgentRuntimeStore({
            "yux_strategy_concept_cards": [{"id": "card-1", "concept": "Card"}],
            "yux_strategy_source_chunks": [{"id": "chunk-1", "chunk_text": "Chunk"}],
            "yux_strategy_card_embeddings": [
                {"card_id": "card-1", "embedding_values": [0.0, 1.0], "content_hash": "old", "created_at": "2026-01-01"},
                {"card_id": "card-1", "embedding_values": [1.0, 0.0], "content_hash": "new", "created_at": "2026-02-01"},
            ],
            "yux_strategy_chunk_embeddings": [
                {"chunk_id": "chunk-1", "embedding_values": [0.5, 0.5], "content_hash": "chunk", "created_at": "2026-02-01"},
            ],
        })

        knowledge = RuntimeStrategyKnowledgeStore(store)

        self.assertEqual(knowledge.list_cards()[0]["embedding_values"], [1.0, 0.0])
        self.assertEqual(knowledge.list_cards()[0]["embedding_content_hash"], "new")
        self.assertEqual(knowledge.list_chunks()[0]["embedding_values"], [0.5, 0.5])

    def test_factory_loads_profile_route_rag_workflow_and_autonomy_from_store(self):
        store = InMemoryAgentRuntimeStore({
            "yux_strategy_agent_profiles": [{
                "id": "profile-1", "profile_key": "ai_sdr_comercial_1", "name": "AI SDR",
                "purpose": "Qualificar com SPIN.", "status": "active", "allowed_tools": [],
                "forbidden_actions": ["promise_discount"], "approval_policy": {},
                "default_context_policy": {}, "output_schema": {}, "max_cards": 4, "max_chunks": 2,
            }],
            "marketing_agent_global_prompts": [{
                "id": "prompt-1", "agent_type": "ai_sdr_comercial_1", "status": "active",
                "system_prompt": "Responda somente JSON valido.", "prompt_version": 1,
                "default_context_policy": {}, "default_quality_gates": {},
            }],
            "model_routing_rules": [{
                "id": "route-1", "agent_type": "ai_sdr_comercial_1", "routing_tier": "default",
                "provider": "openrouter", "model_name": "openai/gpt-4.1-mini", "status": "active",
                "max_output_tokens": 1200, "temperature": 0.2,
            }],
            "strategy_workflow_specs": [{
                "id": "workflow-1", "workflow_key": "whatsapp_conversation_turn", "version": 1,
                "status": "active", "subagent_specs": [], "max_subagents": 0, "max_retries_per_node": 0,
            }],
            "agent_autonomy_policies": [{
                "id": "autonomy-1", "organization_id": "org-1", "profile_key": "ai_sdr_comercial_1",
                "channel": "whatsapp", "action_key": "send_external_message",
                "autonomy_mode": "suggestion", "confidence_threshold": 0.75, "status": "active",
            }],
            "yux_strategy_concept_cards": [{
                "id": "card-1", "organization_id": "org-1", "concept": "Perguntas SPIN",
                "recommended_actions": ["Perguntar situacao atual"], "status": "active",
                "visibility": "internal_only", "target_profiles": ["ai_sdr_comercial_1"],
            }],
        })

        calls = []

        def transport(_url, _headers, payload, _method):
            calls.append(payload)
            content = {
                "reply": {"body": "Qual e o principal gargalo hoje?", "language": "pt-BR"},
                "classification": {"intent": "qualification", "stage": "lead", "sentiment": "neutral", "urgency": "none", "confidence": 0.9},
                "qualification": {"fitScoreDelta": 0, "intentScoreDelta": 5, "objections": [], "nextBestAction": "Perguntar situacao"},
            }
            return {"model": payload["model"], "choices": [{"message": {"content": json.dumps(content)}, "finish_reason": "stop"}], "usage": {}}

        engine = build_strategy_workflow_engine(store, OpenRouterClient(api_key="or-key", transport=transport))
        result = engine.execute(
            message="Quero entender melhor",
            profile_key="ai_sdr_comercial_1",
            source="whatsapp",
            organization_id="org-1",
            mode="conversation_turn",
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(result["policy"]["autonomy_mode"], "suggestion")
        self.assertEqual(result["synthesis"]["supporting_cards"], ["card-1"])
        self.assertEqual(len(store.tables["yux_strategy_retrieval_queries"]), 1)


if __name__ == "__main__":
    unittest.main()
