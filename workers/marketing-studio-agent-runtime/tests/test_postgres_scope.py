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


class RetrievalCursor(ScopeCursor):
    def __init__(self):
        super().__init__()
        self.rows = [{"namespace": "company", "id": "item-1", "content": "Conteúdo aprovado"}]

    def fetchall(self):
        return self.rows


class RetrievalConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self, **_kwargs):
        return self._cursor


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

    def test_authorized_retrieval_forwards_every_scope_dimension_to_database_policy(self):
        cursor = RetrievalCursor()
        store = PostgresAgentRuntimeStore("postgresql://runtime")
        store._connection = lambda: RetrievalConnection(cursor)
        store._row_factory = lambda: None

        rows = store.retrieve_authorized_knowledge(
            organization_id="10000000-0000-4000-8000-000000000001",
            contract_id="30000000-0000-4000-8000-000000000001",
            profile_key="growth_strategist",
            audience="external_contact",
            module_key="marketing_studio",
            workflow_key="mission_intake",
            channel="whatsapp",
            query_text="diagnóstico",
            match_limit=5,
            query_embedding=[0.2, 0.8],
            embedding_model="jina-v3",
            namespace="company",
        )

        sql, params = cursor.calls[0]
        self.assertIn("private.retrieve_authorized_knowledge_v1", sql)
        self.assertEqual(params[:9], [
            "10000000-0000-4000-8000-000000000001",
            "30000000-0000-4000-8000-000000000001",
            "growth_strategist", "external_contact", "marketing_studio",
            "mission_intake", "whatsapp", "diagnóstico", 5,
        ])
        self.assertEqual(params[-3:], ["[0.2, 0.8]", "jina-v3", "company"])
        self.assertEqual(rows[0]["id"], "item-1")


if __name__ == "__main__":
    unittest.main()
