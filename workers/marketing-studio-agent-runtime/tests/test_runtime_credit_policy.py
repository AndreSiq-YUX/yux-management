import json
import unittest

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
