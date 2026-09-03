import json
import unittest
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore


class FakeCursor:
    def __init__(self):
        self.calls = []
        self.rows = [
            {"id": "wallet-1", "current_balance": 0, "monthly_used": 8, "is_unlimited": True},
            {"id": "ledger-1"},
        ]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params):
        self.calls.append((query, params))

    def fetchone(self):
        return self.rows.pop(0)


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self, **_kwargs):
        return self._cursor


class RuntimeCreditPolicyTest(unittest.TestCase):
    def test_postgres_rows_are_normalized_for_json_prompts_and_traces(self):
        store = PostgresAgentRuntimeStore("postgresql://test")
        row = store._row({
            "id": UUID("00000000-0000-0000-0000-000000000001"),
            "created_at": datetime(2026, 9, 2, 23, 0, tzinfo=UTC),
            "score": Decimal("0.75"),
            "payload": {"owner_id": UUID("00000000-0000-0000-0000-000000000002")},
        })

        self.assertEqual(row["id"], "00000000-0000-0000-0000-000000000001")
        self.assertEqual(row["created_at"], "2026-09-02T23:00:00+00:00")
        self.assertEqual(row["score"], 0.75)
        self.assertEqual(row["payload"]["owner_id"], "00000000-0000-0000-0000-000000000002")
        json.dumps(row)

    def test_postgres_arrays_stay_native_while_json_fields_are_serialized(self):
        store = PostgresAgentRuntimeStore("postgresql://test")

        self.assertEqual(
            store._value("yux_strategy_retrieval_queries", "result_card_ids", []),
            [],
        )
        self.assertEqual(
            json.loads(store._value("yux_strategy_retrieval_queries", "filters", {"stages": []})),
            {"stages": []},
        )

    def test_strategy_embedding_tables_are_read_only_runtime_dependencies(self):
        store = PostgresAgentRuntimeStore("postgresql://test")

        for table in (
            "yux_strategy_card_embeddings",
            "yux_strategy_chunk_embeddings",
            "yux_strategy_asset_embeddings",
        ):
            self.assertEqual(store._table(table), table)
            with self.assertRaises(ValueError):
                store._table(table, write=True)

    def test_unlimited_wallet_is_metered_without_balance_deduction(self):
        cursor = FakeCursor()
        store = PostgresAgentRuntimeStore("postgresql://test")
        store._connection = lambda: FakeConnection(cursor)
        store._row_factory = lambda: None

        result = store.reserve_credits(
            organization_id="00000000-0000-0000-0000-000000000001",
            client_id="00000000-0000-0000-0000-000000000002",
            contract_id="00000000-0000-0000-0000-000000000003",
            credits=1,
            action="mission_conversation_turn",
        )

        wallet_sql, wallet_params = cursor.calls[0]
        self.assertIn("WHEN is_unlimited THEN current_balance", wallet_sql)
        self.assertIn("is_unlimited OR current_balance >= %s", wallet_sql)
        self.assertEqual(wallet_params, [1, 1, "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003", 1])

        ledger_params = cursor.calls[1][1]
        self.assertEqual(json.loads(ledger_params[-1]), {"source": "agent_runtime", "unlimited": True})
        self.assertEqual(result["current_balance"], 0)
        self.assertTrue(result["unlimited"])


if __name__ == "__main__":
    unittest.main()
