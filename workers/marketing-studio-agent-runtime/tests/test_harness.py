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

        self.assertEqual(prompt["system_prompt"], "System prompt global da YUX.")
        self.assertEqual(prompt["agent_prompt"], "Use exemplos aprovados do cliente.")
        self.assertIn("Marca consultiva", prompt["context_block"])
        self.assertEqual(prompt["prompt_config"]["minimumQualityScore"], 80)
        self.assertEqual(prompt["prompt_versions"], {"global": 2, "agent": 3})
        self.assertEqual(len(prompt["compiled_prompt_hash"]), 64)

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


if __name__ == "__main__":
    unittest.main()
