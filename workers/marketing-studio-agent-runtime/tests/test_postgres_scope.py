from types import SimpleNamespace
import sys
import unittest
from unittest.mock import patch

from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore


class ScopeCursor:
    def __init__(self):
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=None):
        self.calls.append((query, params))


class ScopeConnection:
    def __init__(self):
        self.scope_cursor = ScopeCursor()

    def cursor(self, **_kwargs):
        return self.scope_cursor


class PostgresScopeTest(unittest.TestCase):
    def test_applies_validated_tenant_profile_and_audience_to_each_connection(self):
        connection = ScopeConnection()
        store = PostgresAgentRuntimeStore("postgresql://runtime")
        store.set_tenant_scope(
            "10000000-0000-4000-8000-000000000001",
            contract_id="30000000-0000-4000-8000-000000000001",
            profile_key="growth_strategist",
            audience="client_user",
        )

        with patch.dict(sys.modules, {"psycopg": SimpleNamespace(connect=lambda _url: connection)}):
            self.assertIs(store._connection(), connection)

        params = [call[1] for call in connection.scope_cursor.calls]
        self.assertIn(["client_member"], params)
        self.assertIn(["{10000000-0000-4000-8000-000000000001}"], params)
        self.assertIn(["30000000-0000-4000-8000-000000000001"], params)
        self.assertIn(["growth_strategist"], params)
        self.assertIn(["client_user"], params)

    def test_rejects_invalid_scope_before_database_access(self):
        store = PostgresAgentRuntimeStore("postgresql://runtime")
        with self.assertRaisesRegex(ValueError, "invalid_runtime_database_scope"):
            store.set_tenant_scope("not-an-organization")
        with self.assertRaisesRegex(ValueError, "invalid_runtime_audience"):
            store.set_tenant_scope("10000000-0000-4000-8000-000000000001", audience="unknown")


if __name__ == "__main__":
    unittest.main()
