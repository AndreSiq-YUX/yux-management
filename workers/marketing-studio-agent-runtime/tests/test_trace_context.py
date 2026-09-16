import unittest
from copy import deepcopy
from uuid import UUID

from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.trace import TraceRecorder, sanitize_trace_payload, stable_hash


class UuidContextStore(InMemoryAgentRuntimeStore):
    """Enforce the production UUID[] contract without accessing a database."""

    def insert(self, table, payload):
        if table == "agent_context_snapshots":
            for column in ("card_ids", "chunk_ids", "asset_ids"):
                for value in payload[column]:
                    UUID(value)
        return super().insert(table, payload)


class TraceContextTest(unittest.TestCase):
    def test_namespaced_company_evidence_is_not_a_strategy_uuid_reference(self):
        strategy_id = "10000000-0000-4000-8000-000000000001"
        company_id = "company:03bc98dc-08d9-4a1d-b9dd-f89238b36f6d"
        context = {"chunks": [
            {"id": strategy_id, "content": "Conhecimento do livro."},
            {"id": company_id, "content": "Oferta e capacidades da empresa."},
        ]}
        original = deepcopy(context)

        snapshot = TraceRecorder(UuidContextStore()).record_context(
            run_id=strategy_id,
            profile_key="growth_strategist",
            context_kind="rag",
            safe_context=context,
            card_ids=["legacy-card", strategy_id],
            chunk_ids=[strategy_id, company_id],
            asset_ids=["company:asset", strategy_id],
        )

        for column in ("card_ids", "chunk_ids", "asset_ids"):
            self.assertEqual(snapshot[column], [strategy_id])
        self.assertEqual(snapshot["safe_context"], sanitize_trace_payload(original))
        self.assertEqual(snapshot["context_hash"], stable_hash(original))
        self.assertEqual(context, original)
        self.assertEqual(snapshot["safe_context"]["chunks"][1]["id"], company_id)

    def test_empty_reference_arrays_remain_empty(self):
        snapshot = TraceRecorder(UuidContextStore()).record_context(
            run_id="10000000-0000-4000-8000-000000000001",
            profile_key="growth_strategist",
            context_kind="rag",
            safe_context={},
        )
        for column in ("card_ids", "chunk_ids", "asset_ids"):
            self.assertEqual(snapshot[column], [])


if __name__ == "__main__":
    unittest.main()
