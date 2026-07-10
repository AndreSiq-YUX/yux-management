import unittest

from yux_agent_runtime.graph import build_runtime_graph
from yux_agent_runtime.harness import (
    BudgetBlocked,
    Harness,
    compose_prompt,
    enforce_budget,
    filter_allowed_tools,
    select_model_route,
)
from yux_agent_runtime.providers import OpenRouterClient


GLOBAL_PROMPT = {
    "id": "global-1",
    "agent_type": "multichannel_writer",
    "system_prompt": "System prompt global da YUX.",
    "prompt_version": 2,
    "default_context_policy": {"includeBrandProfile": True},
    "default_quality_gates": {"minimumQualityScore": 70},
}

AGENT = {
    "id": "agent-1",
    "agent_type": "multichannel_writer",
    "name": "Redator do cliente",
    "base_prompt": "Use exemplos aprovados do cliente.",
    "prompt_config": {"channel": "linkedin"},
    "context_policy": {"includeProducts": True},
    "quality_gates": {"minimumQualityScore": 80},
    "prompt_version": 3,
    "allowed_tools": ["rag_search", "jina_grounding"],
    "default_model": "model-from-agent",
    "fallback_model": "fallback-from-agent",
}


class HarnessTest(unittest.TestCase):
    def test_compose_prompt_layers_global_agent_and_context(self):
        prompt = compose_prompt(
            GLOBAL_PROMPT,
            AGENT,
            {
                "objective": "Gerar post",
                "brand_summary": "Marca consultiva",
                "products": ["CRM YUX"],
                "knowledge_snippets": ["A marca fala com clareza"],
            },
        )

        self.assertIn("System prompt global da YUX.", prompt["system_prompt"])
        self.assertIn("<user_message>", prompt["system_prompt"])
        self.assertEqual(prompt["agent_prompt"], "Use exemplos aprovados do cliente.")
        self.assertIn("Marca consultiva", prompt["context_block"])
        self.assertEqual(prompt["prompt_config"]["minimumQualityScore"], 80)
        self.assertEqual(prompt["prompt_versions"], {"global": 2, "agent": 3})
        self.assertEqual(len(prompt["compiled_prompt_hash"]), 64)

    def test_compose_prompt_accepts_existing_agent_without_strategy_context(self):
        prompt = compose_prompt(GLOBAL_PROMPT, AGENT, {"objective": "Gerar post"})

        self.assertIn("Objetivo: Gerar post", prompt["context_block"])
        self.assertNotIn("Estratégia YUX", prompt["context_block"])
        self.assertEqual(prompt["agent_prompt"], "Use exemplos aprovados do cliente.")

    def test_compose_prompt_includes_strategy_context_before_rag_snippets(self):
        prompt = compose_prompt(
            GLOBAL_PROMPT,
            AGENT,
            {
                "objective": "Qualificar lead",
                "brand_summary": "Marca consultiva",
                "knowledge_snippets": ["Snippet RAG comum"],
                "strategy_context": {
                    "profile_key": "ai_sdr_comercial_1",
                    "commercial_stage": "raised_hand",
                    "customer_context": "Lead pediu orçamento no WhatsApp.",
                    "skill_rules": ["Pergunte antes de apresentar solução."],
                    "concept_cards": [
                        {
                            "id": "card-spin",
                            "concept": "SPIN SDR",
                            "problem_solved": "Lead sem diagnóstico.",
                            "recommended_actions": ["Conduzir perguntas SPIN."],
                        }
                    ],
                    "chunks": [{"id": "chunk-sdr", "chunk_text": "Registrar próximo passo no CRM."}],
                    "allowed_actions": ["qualify_lead"],
                    "forbidden_actions": ["activate_campaign"],
                    "approval_policy": {"send_external_message": "approval_required"},
                },
            },
        )

        context = prompt["context_block"]
        self.assertIn("Estratégia YUX: ai_sdr_comercial_1", context)
        self.assertIn("Regra: Pergunte antes de apresentar solução.", context)
        self.assertIn("Card: SPIN SDR", context)
        self.assertIn("Chunk chunk-sdr: Registrar próximo passo no CRM.", context)
        self.assertLess(context.index("Regra:"), context.index("Card:"))
        self.assertLess(context.index("Card:"), context.index("Conhecimento:"))

    def test_select_model_route_prefers_agent_override(self):
        route = select_model_route(
            AGENT,
            [
                {
                    "agent_type": "multichannel_writer",
                    "routing_tier": "default",
                    "provider": "openrouter",
                    "model_name": "type-model",
                    "status": "active",
                },
                {
                    "agent_id": "agent-1",
                    "agent_type": "multichannel_writer",
                    "routing_tier": "default",
                    "provider": "openrouter",
                    "model_name": "agent-model",
                    "status": "active",
                },
            ],
        )

        self.assertEqual(route["model_name"], "agent-model")

    def test_filter_allowed_tools_uses_policy(self):
        tools = filter_allowed_tools(
            AGENT,
            [
                {
                    "agent_type": "multichannel_writer",
                    "tool_key": "jina_grounding",
                    "enabled": False,
                }
            ],
        )

        self.assertEqual(tools, ["rag_search"])

    def test_budget_guard_blocks_excessive_runs(self):
        with self.assertRaises(BudgetBlocked):
            enforce_budget(
                {
                    "agent_type": "multichannel_writer",
                    "max_credits_per_run": 10,
                    "max_cost_per_run": 1,
                    "max_runs_per_day": 5,
                    "status": "active",
                },
                estimated_credits=15,
                estimated_cost=0.2,
                runs_today=1,
            )

    def test_graph_executes_provider_neutral_agent_run(self):
        harness = Harness(
            global_prompts={"multichannel_writer": GLOBAL_PROMPT},
            routes=[
                {
                    "agent_type": "multichannel_writer",
                    "routing_tier": "default",
                    "provider": "openrouter",
                    "model_name": "openai/gpt-4o-mini",
                    "status": "active",
                }
            ],
            tool_policies=[],
            budget_policies=[],
        )
        graph = build_runtime_graph(harness)
        result = graph.invoke({
            "agent": AGENT,
            "context": {"objective": "Gerar post"},
            "estimated_credits": 5,
            "estimated_cost": 0.02,
        })

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["agent_runs"][0]["model_name"], "openai/gpt-4o-mini")
        self.assertEqual(result["agent_runs"][0]["agent_prompt_snapshot"], "Use exemplos aprovados do cliente.")
        self.assertNotIn("system_prompt", result["agent_runs"][0])

    def test_graph_executes_existing_marketing_agent_without_strategy_binding(self):
        harness = Harness(
            global_prompts={"multichannel_writer": GLOBAL_PROMPT},
            routes=[],
            tool_policies=[],
            budget_policies=[],
        )
        result = harness.execute_agent({
            "agent": AGENT,
            "context": {"objective": "Gerar post"},
        })

        self.assertEqual(result["status"], "succeeded")
        self.assertNotIn("strategy_context", result["agent_runs"][0])

    def test_harness_executes_openrouter_when_enabled(self):
        def transport(url, headers, payload, method):
            return {
                "id": "chat-1",
                "model": payload["model"],
                "choices": [{"finish_reason": "stop", "message": {"content": "Post gerado pelo OpenRouter"}}],
                "usage": {"prompt_tokens": 30, "completion_tokens": 15, "total_tokens": 45},
            }

        harness = Harness(
            global_prompts={"multichannel_writer": GLOBAL_PROMPT},
            routes=[
                {
                    "agent_type": "multichannel_writer",
                    "routing_tier": "default",
                    "provider": "openrouter",
                    "model_name": "openai/gpt-4.1-mini",
                    "fallback_model_name": "anthropic/claude-sonnet-4",
                    "max_output_tokens": 900,
                    "temperature": 0.5,
                    "status": "active",
                }
            ],
            tool_policies=[],
            budget_policies=[],
            llm_client=OpenRouterClient(api_key="or-key", transport=transport),
        )

        result = harness.execute_agent({
            "agent": AGENT,
            "context": {"objective": "Gerar post"},
            "user_input": "Escreva para LinkedIn",
            "execute_llm": True,
            "workflow_run_id": "run-1",
        })

        output = result["agent_runs"][0]["output_payload"]
        self.assertFalse(output["dry_run"])
        self.assertEqual(output["content"], "Post gerado pelo OpenRouter")
        self.assertEqual(result["agent_runs"][0]["input_tokens"], 30)
        self.assertEqual(result["agent_runs"][0]["output_tokens"], 15)


if __name__ == "__main__":
    unittest.main()
