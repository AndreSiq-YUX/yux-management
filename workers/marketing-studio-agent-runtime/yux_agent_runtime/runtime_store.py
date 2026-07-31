from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from typing import Any, Protocol
from uuid import uuid4


def _with_id(payload: dict[str, Any]) -> dict[str, Any]:
    return {"id": payload.get("id") or str(uuid4()), **payload}


class AgentRuntimeStore(Protocol):
    def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        ...

    def update(self, table: str, record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        ...

    def list(self, table: str, filters: dict[str, Any] | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        ...


@dataclass
class InMemoryAgentRuntimeStore:
    tables: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        record = _with_id(dict(payload))
        self.tables.setdefault(table, []).append(record)
        return dict(record)

    def update(self, table: str, record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        records = self.tables.setdefault(table, [])
        for index, record in enumerate(records):
            if str(record.get("id")) == str(record_id):
                updated = {**record, **payload}
                records[index] = updated
                return dict(updated)
        raise KeyError(f"{table}:{record_id}")

    def list(self, table: str, filters: dict[str, Any] | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        filters = filters or {}
        records = []
        for record in self.tables.get(table, []):
            if all(record.get(key) == value for key, value in filters.items() if value is not None):
                records.append(dict(record))
        return records[:limit] if limit is not None else records


@dataclass
class SupabaseAgentRuntimeStore:
    client: Any

    def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.table(table).insert(payload).execute()
        data = response.data or []
        return data[0] if data else dict(payload)

    def update(self, table: str, record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.table(table).update(payload).eq("id", record_id).execute()
        data = response.data or []
        return data[0] if data else {"id": record_id, **payload}

    def list(self, table: str, filters: dict[str, Any] | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        query = self.client.table(table).select("*")
        for key, value in (filters or {}).items():
            if value is not None:
                query = query.eq(key, value)
        if limit is not None:
            query = query.limit(limit)
        response = query.execute()
        return response.data or []


class PostgresAgentRuntimeStore:
    """Durable store used in production; InMemory remains test-only."""

    allowed_tables = {
        "agent_events", "agent_queue_jobs", "agent_execution_runs", "agent_execution_steps",
        "agent_context_snapshots", "agent_verification_results", "strategy_subagent_runs",
        "agent_outcomes", "agent_learning_signals",
    }

    def __init__(self, database_url: str | None = None):
        self.database_url = database_url or os.getenv("DATABASE_URL", "")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is required for PostgresAgentRuntimeStore")

    def _connection(self):
        import psycopg

        return psycopg.connect(self.database_url)

    @staticmethod
    def _row_factory():
        from psycopg.rows import dict_row

        return dict_row

    def _table(self, table: str) -> str:
        if table not in self.allowed_tables:
            raise ValueError(f"unsupported_runtime_table:{table}")
        return table

    @staticmethod
    def _value(value: Any) -> Any:
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return value

    @staticmethod
    def _row(row: dict[str, Any]) -> dict[str, Any]:
        for key, value in list(row.items()):
            if isinstance(value, str) and value[:1] in ("{", "["):
                try:
                    row[key] = json.loads(value)
                except json.JSONDecodeError:
                    pass
        return row

    def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        table = self._table(table)
        columns = list(payload.keys())
        values = [self._value(payload[column]) for column in columns]
        placeholders = ", ".join(["%s"] * len(columns))
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(
                f"INSERT INTO public.{table} ({', '.join(columns)}) VALUES ({placeholders}) RETURNING *",
                values,
            )
            return self._row(dict(cursor.fetchone()))

    def update(self, table: str, record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        table = self._table(table)
        columns = list(payload.keys())
        assignments = ", ".join(f"{column} = %s" for column in columns)
        values = [self._value(payload[column]) for column in columns] + [record_id]
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(f"UPDATE public.{table} SET {assignments} WHERE id = %s RETURNING *", values)
            row = cursor.fetchone()
            if not row:
                raise KeyError(f"{table}:{record_id}")
            return self._row(dict(row))

    def list(self, table: str, filters: dict[str, Any] | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        table = self._table(table)
        filters = {key: value for key, value in (filters or {}).items() if value is not None}
        where = " AND ".join(f"{key} = %s" for key in filters) or "TRUE"
        suffix = " LIMIT %s" if limit is not None else ""
        values = [self._value(value) for value in filters.values()] + ([limit] if limit is not None else [])
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(f"SELECT * FROM public.{table} WHERE {where}{suffix}", values)
            return [self._row(dict(row)) for row in cursor.fetchall()]

    def claim_next_job(self, worker_id: str, queue_name: str) -> dict[str, Any] | None:
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(
                """WITH next_job AS (
                     SELECT id FROM public.agent_queue_jobs
                     WHERE status = 'queued' AND queue_name = %s AND available_at <= NOW()
                     ORDER BY priority ASC, created_at ASC
                     FOR UPDATE SKIP LOCKED LIMIT 1
                   )
                   UPDATE public.agent_queue_jobs j SET status = 'running', locked_by = %s,
                     locked_at = NOW(), attempt_count = attempt_count + 1, updated_at = NOW()
                   FROM next_job WHERE j.id = next_job.id RETURNING j.*""",
                [queue_name, worker_id],
            )
            row = cursor.fetchone()
            return self._row(dict(row)) if row else None

    def validate_tenant(self, organization_id: str, client_id: str | None = None, contract_id: str | None = None) -> bool:
        """Check every supplied tenant reference belongs to the organization."""
        with self._connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """SELECT EXISTS (
                     SELECT 1 FROM public.organizations organization
                     WHERE organization.id = %s
                       AND (%s::uuid IS NULL OR organization.client_id = %s)
                       AND (%s::uuid IS NULL OR EXISTS (
                         SELECT 1 FROM public.contracts contract
                         WHERE contract.id = %s
                           AND contract.client_id = COALESCE(%s::uuid, organization.client_id)
                       ))
                   )""",
                [organization_id, client_id, client_id, contract_id, contract_id, client_id],
            )
            row = cursor.fetchone()
            return bool(row and row[0])

    def reserve_credits(
        self,
        *,
        organization_id: str,
        client_id: str,
        contract_id: str,
        credits: int,
        action: str,
        workflow_run_id: str | None = None,
    ) -> dict[str, Any]:
        if credits <= 0:
            return {"reserved": 0}
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(
                """UPDATE public.ai_credit_wallets
                      SET current_balance = current_balance - %s,
                          monthly_used = monthly_used + %s,
                          updated_at = NOW()
                    WHERE organization_id = %s AND client_id = %s AND contract_id = %s
                      AND current_balance >= %s
                    RETURNING id, current_balance, monthly_used""",
                [credits, credits, organization_id, client_id, contract_id, credits],
            )
            wallet = cursor.fetchone()
            if not wallet:
                raise RuntimeError("insufficient_ai_credits_or_invalid_wallet")
            cursor.execute(
                """INSERT INTO public.ai_usage_ledger (
                     organization_id, client_id, contract_id, wallet_id, workflow_run_id,
                     action, credits_charged, status, metadata
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,'succeeded',%s::jsonb)
                   RETURNING id""",
                [organization_id, client_id, contract_id, wallet["id"], workflow_run_id, action, credits, json.dumps({"source": "agent_runtime"})],
            )
            ledger = cursor.fetchone()
            return {"reserved": credits, "wallet_id": wallet["id"], "ledger_id": ledger["id"], "current_balance": wallet["current_balance"]}
