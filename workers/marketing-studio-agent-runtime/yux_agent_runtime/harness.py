from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from .providers import OpenRouterClient


class BudgetBlocked(Exception):
    """Raised when a run exceeds the configured budget guard."""


def compose_prompt(global_prompt: dict[str, Any], agent: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    context_lines = []
    if context.get("objective"):
        context_lines.append(f"Objetivo: {context['objective']}")
    if context.get("brand_summary"):
        context_lines.append(f"Marca: {context['brand_summary']}")
    if context.get("products"):
        context_lines.append("Produtos: " + "; ".join(context["products"]))
    if context.get("knowledge_snippets"):
        context_lines.append("Conhecimento: " + " | ".join(context["knowledge_snippets"]))

    prompt_config = {
        **global_prompt.get("default_context_policy", {}),
        **global_prompt.get("default_quality_gates", {}),
        **agent.get("context_policy", {}),
        **agent.get("quality_gates", {}),
        **agent.get("prompt_config", {}),
    }

    agent_prompt = (agent.get("base_prompt") or f"Execute a funcao configurada para {agent.get('name', 'este agente')}.").strip()
    system_prompt = global_prompt["system_prompt"].strip()

    return {
        "system_prompt": system_prompt,
        "agent_prompt": agent_prompt,
        "context_block": "\n".join(context_lines),
        "prompt_config": prompt_config,
        "prompt_versions": {
            "global": int(global_prompt.get("prompt_version", 1)),
            "agent": int(agent.get("prompt_version", 1)),
        },
        "compiled_prompt_hash": estimate_prompt_hash(system_prompt, agent_prompt, "\n".join(context_lines), prompt_config),
    }


def estimate_prompt_hash(system_prompt: str, agent_prompt: str, context_block: str, prompt_config: dict[str, Any]) -> str:
    payload = f"{system_prompt}\n---\n{agent_prompt}\n---\n{context_block}\n---\n{sorted(prompt_config.items())}"
    return sha256(payload.encode("utf-8")).hexdigest()


def select_model_route(agent: dict[str, Any], routes: list[dict[str, Any]], tier: str = "default") -> dict[str, Any]:
    active_routes = [route for route in routes if route.get("status", "active") == "active"]
    for predicate in (
        lambda route: route.get("agent_id") == agent.get("id") and route.get("routing_tier") == tier,
        lambda route: route.get("agent_type") == agent.get("agent_type") and route.get("routing_tier") == tier,
        lambda route: route.get("agent_type") == agent.get("agent_type"),
    ):
        match = next((route for route in active_routes if predicate(route)), None)
        if match:
            return match

    return {
        "provider": "configured",
        "model_name": agent.get("default_model") or "unconfigured",
        "fallback_model_name": agent.get("fallback_model"),
        "routing_tier": tier,
        "max_input_tokens": 8000,
        "max_output_tokens": 1200,
        "temperature": 0.4,
        "max_cost_per_run": 0 if agent.get("default_model") else float("inf"),
        "status": "active",
    }


def filter_allowed_tools(agent: dict[str, Any], policies: list[dict[str, Any]]) -> list[str]:
    allowed_tools = agent.get("allowed_tools", [])
    filtered = []
    for tool in allowed_tools:
        policy = next(
            (
                item
                for item in policies
                if (item.get("agent_id") == agent.get("id") or item.get("agent_type") == agent.get("agent_type"))
                and item.get("tool_key") == tool
            ),
            None,
        )
        if policy is None or policy.get("enabled", True):
            filtered.append(tool)
    return filtered


def enforce_budget(policy: dict[str, Any] | None, estimated_credits: int, estimated_cost: float, runs_today: int) -> None:
    if not policy or policy.get("status", "active") != "active":
        return
    if policy.get("max_credits_per_run", 0) > 0 and estimated_credits > policy["max_credits_per_run"]:
        raise BudgetBlocked("credits_per_run_exceeded")
    if policy.get("max_cost_per_run", 0) > 0 and estimated_cost > policy["max_cost_per_run"]:
        raise BudgetBlocked("cost_per_run_exceeded")
    if policy.get("max_runs_per_day", 0) > 0 and runs_today >= policy["max_runs_per_day"]:
        raise BudgetBlocked("runs_per_day_exceeded")


@dataclass
class Harness:
    global_prompts: dict[str, dict[str, Any]]
    routes: list[dict[str, Any]]
    tool_policies: list[dict[str, Any]]
    budget_policies: list[dict[str, Any]]
    llm_client: OpenRouterClient | None = None

    def execute_agent(self, state: dict[str, Any]) -> dict[str, Any]:
        agent = state["agent"]
        global_prompt = self.global_prompts[agent["agent_type"]]
        prompt = compose_prompt(global_prompt, agent, state.get("context", {}))
        route = select_model_route(agent, self.routes, state.get("routing_tier", "default"))
        tools = filter_allowed_tools(agent, self.tool_policies)
        budget = self._find_budget(agent)

        estimated_credits = int(state.get("estimated_credits", 0))
        estimated_cost = float(state.get("estimated_cost", 0))
        enforce_budget(budget, estimated_credits, estimated_cost, int(state.get("runs_today", 0)))

        provider_output = self._execute_llm_if_configured(state, prompt, route)
        output_payload = provider_output or {
            "dry_run": True,
            "message": f"{agent.get('name', agent['agent_type'])} executed by provider-neutral harness",
        }

        agent_run = {
            "agent_id": agent.get("id"),
            "agent_type": agent["agent_type"],
            "status": "succeeded",
            "global_prompt_id": global_prompt.get("id"),
            "agent_prompt_snapshot": prompt["agent_prompt"],
            "prompt_config_snapshot": prompt["prompt_config"],
            "compiled_prompt_hash": prompt["compiled_prompt_hash"],
            "model_provider": route["provider"],
            "model_name": route["model_name"],
            "fallback_model_name": route.get("fallback_model_name"),
            "allowed_tools": tools,
            "credits_charged": estimated_credits,
            "raw_cost_estimate": estimated_cost,
            "input_tokens": int(output_payload.get("input_tokens", 0)),
            "output_tokens": int(output_payload.get("output_tokens", 0)),
            "output_payload": output_payload,
        }

        return {
            **state,
            "status": "succeeded",
            "prompt": prompt,
            "route": route,
            "allowed_tools": tools,
            "agent_runs": [*state.get("agent_runs", []), agent_run],
        }

    def _find_budget(self, agent: dict[str, Any]) -> dict[str, Any] | None:
        return next(
            (
                policy
                for policy in self.budget_policies
                if policy.get("agent_id") == agent.get("id") or policy.get("agent_type") == agent.get("agent_type")
            ),
            None,
        )

    def _execute_llm_if_configured(
        self,
        state: dict[str, Any],
        prompt: dict[str, Any],
        route: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not state.get("execute_llm"):
            return None
        if route.get("provider") != "openrouter":
            return None
        if self.llm_client is None:
            return None

        response = self.llm_client.chat_completion(
            model=route["model_name"],
            fallback_models=[route["fallback_model_name"]] if route.get("fallback_model_name") else None,
            max_tokens=int(route.get("max_output_tokens", 1200)),
            temperature=float(route.get("temperature", 0.4)),
            session_id=state.get("workflow_run_id") or state.get("session_id"),
            messages=[
                {"role": "system", "content": prompt["system_prompt"]},
                {
                    "role": "user",
                    "content": "\n\n".join(
                        part
                        for part in [
                            prompt["context_block"],
                            prompt["agent_prompt"],
                            state.get("user_input", ""),
                        ]
                        if part
                    ),
                },
            ],
        )
        return {
            "dry_run": False,
            "provider": response["provider"],
            "model": response["model"],
            "content": response["content"],
            "finish_reason": response.get("finish_reason"),
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "total_tokens": response["total_tokens"],
            "raw_response_id": response.get("raw_response_id"),
        }
