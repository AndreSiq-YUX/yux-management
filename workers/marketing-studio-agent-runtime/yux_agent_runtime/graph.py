from __future__ import annotations

from typing import Any

from .harness import Harness

try:
    from langgraph.graph import END, StateGraph

    HAS_LANGGRAPH = True
except Exception:
    END = None
    StateGraph = None
    HAS_LANGGRAPH = False


class FallbackGraph:
    def __init__(self, harness: Harness):
        self.harness = harness

    def invoke(self, state: dict[str, Any]) -> dict[str, Any]:
        return self.harness.execute_agent(state)


def build_runtime_graph(harness: Harness):
    if not HAS_LANGGRAPH:
        return FallbackGraph(harness)

    graph = StateGraph(dict)
    graph.add_node("execute_agent", harness.execute_agent)
    graph.set_entry_point("execute_agent")
    graph.add_edge("execute_agent", END)
    return graph.compile()
