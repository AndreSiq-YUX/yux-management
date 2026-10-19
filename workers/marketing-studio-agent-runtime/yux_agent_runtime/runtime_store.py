from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from contextvars import ContextVar
import json
import os
from typing import Any, Protocol
from uuid import UUID, uuid4
from threading import RLock


class CreditReservationError(RuntimeError):
    """A wallet rejection proven to occur before any provider request."""

    def __init__(self, reason: str):
        # Keep the legacy message for non-Radar callers that already handle it.
        super().__init__('insufficient_ai_credits_or_invalid_wallet')
        self.reason = reason


@dataclass(frozen=True)
class RuntimeDatabaseScope:
    role: str
    organization_ids: tuple[str, ...]
    contract_id: str = ""
    profile_key: str = ""
    audience: str = ""


_runtime_database_scope: ContextVar[RuntimeDatabaseScope] = ContextVar(
    "runtime_database_scope",
    default=RuntimeDatabaseScope(role="yux_operator", organization_ids=()),
)


def _with_id(payload: dict[str, Any]) -> dict[str, Any]:
    return {"id": payload.get("id") or str(uuid4()), **payload}


class AgentRuntimeStore(Protocol):
    def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        ...

    def update(self, table: str, record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        ...

    def list(self, table: str, filters: dict[str, Any] | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        ...

    def load_provider_credential_envelope(self, provider_key: str) -> dict[str, Any] | None:
        ...


@dataclass
class InMemoryAgentRuntimeStore:
    tables: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    _radar_lock: Any = field(default_factory=RLock, repr=False)

    def begin_radar_effect(self, *, organization_id, action, request_id, analysis_receipt_id, owner_token, input_hash, provider, model_snapshot, lease_until):
        with self._radar_lock:
            parent = self.list('radar_analysis_receipts', dict(id=analysis_receipt_id, organization_id=organization_id, owner_token=owner_token, status='reserved'))
            if not parent:
                raise RuntimeError('radar_analysis_receipt_lease_lost')
            key = f'{action}:{request_id}'
            attempt = max([row['attempt'] for row in self.list('radar_effect_receipts', dict(organization_id=organization_id, effect_key=key))] or [0]) + 1
            return self.insert('radar_effect_receipts', dict(organization_id=organization_id, effect_key=key, attempt=attempt, analysis_receipt_id=analysis_receipt_id,
                owner_token=owner_token, input_hash=input_hash, provider=provider, model_snapshot=model_snapshot, lease_until=lease_until,
                transport_outcome='not_started', validation_outcome='pending', billing_outcome='uncertain', response_body=None, usage=None, failure_code=None))

    def update_radar_effect(self, effect_id, *, owner_token, **changes):
        with self._radar_lock:
            effects = self.list('radar_effect_receipts', dict(id=effect_id, owner_token=owner_token))
            if not effects or not self.list('radar_analysis_receipts', dict(id=effects[0]['analysis_receipt_id'], organization_id=effects[0]['organization_id'], owner_token=owner_token, status='reserved')) or datetime.fromisoformat(effects[0]['lease_until']) <= datetime.now().astimezone():
                raise RuntimeError('radar_analysis_receipt_lease_lost')
            for key in ('response_body', 'usage'):
                if key in changes and effects[0].get(key) is not None and effects[0][key] != changes[key]:
                    raise RuntimeError('radar_effect_response_conflict')
            return self.update('radar_effect_receipts', effect_id, changes)

    def claim_radar_receipt(self, *, organization_id, action, request_id, input_hash, owner_token, input_request=None):
        with self._radar_lock:
            # A fixture-only store cannot prove/consume a production approval.
            if input_request and input_request.get('retry_authorization'):
                raise RuntimeError('radar_analysis_retry_postgres_required')
            lease = (datetime.now().astimezone() + timedelta(minutes=6)).isoformat()
            snapshot = json.loads(json.dumps(input_request))
            key = dict(organization_id=organization_id, action=action, request_id=request_id)
            rows = self.list('radar_analysis_receipts', key)
            if rows:
                row = rows[0]
                if row['input_hash'] != input_hash or row['status'] != 'rejected_before_provider':
                    return row, False
                row = self.update('radar_analysis_receipts', row['id'], dict(status='reserved', owner_token=owner_token, input_request=row.get('input_request') or snapshot, lease_until=lease))
            else:
                row = self.insert('radar_analysis_receipts', dict(**key, input_hash=input_hash, owner_token=owner_token, status='reserved', input_request=snapshot, lease_until=lease))
            return row, True

    def finish_radar_receipt(self, *, organization_id, action, request_id, owner_token, status, result, usage):
        with self._radar_lock:
            rows = self.list('radar_analysis_receipts', dict(organization_id=organization_id, action=action, request_id=request_id, owner_token=owner_token, status='reserved'))
            if not rows:
                raise RuntimeError('radar_analysis_receipt_lease_lost')
            self.update('radar_analysis_receipts', rows[0]['id'], dict(status=status, result=result, usage=usage, lease_until=None))

    def claim_radar_revalidation(self, *, organization_id, action, request_id, input_hash, owner_token, tenant_context=None):
        with self._radar_lock:
            rows = self.list('radar_analysis_receipts', dict(organization_id=organization_id, action=action, request_id=request_id))
            row = rows[0] if rows else None
            if not row or row['input_hash'] != input_hash:
                return row, None
            if tenant_context is not None and (not row.get('input_request') or any(row['input_request'].get(key) != tenant_context.get(key) for key in ('client_id','contract_id'))):
                raise ValueError('radar_analysis_tenant_changed')
            if row['status'] == 'completed':
                return row, None
            effects = sorted(self.list('radar_effect_receipts', dict(organization_id=organization_id, analysis_receipt_id=row['id'], transport_outcome='received')), key=lambda effect: effect['attempt'], reverse=True)
            lease_until = row.get('lease_until')
            if not effects or not row.get('input_request') or row['status'] == 'reserved' and (not lease_until or datetime.fromisoformat(lease_until) > datetime.now().astimezone()):
                return row, None
            lease = (datetime.now().astimezone() + timedelta(minutes=6)).isoformat()
            row = self.update('radar_analysis_receipts', row['id'], dict(status='reserved', owner_token=owner_token, lease_until=lease))
            effect = self.update('radar_effect_receipts', effects[0]['id'], dict(owner_token=owner_token, lease_until=lease))
            return row, effect

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

    def load_provider_credential_envelope(self, provider_key: str) -> dict[str, Any] | None:
        record = next(
            (item for item in self.tables.get("provider_credential_envelopes", []) if item.get("provider_key") == provider_key),
            None,
        )
        return dict(record) if record else None

    def load_provider_configuration(self, provider_key: str) -> dict[str, Any] | None:
        record = next((item for item in self.tables.get("platform_provider_connections", []) if item.get("provider_key") == provider_key), None)
        return dict(record) if record else None


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

    def load_provider_credential_envelope(self, provider_key: str) -> dict[str, Any] | None:
        response = self.client.rpc("runtime_provider_secret_envelope", {"p_provider_key": provider_key}).execute()
        data = response.data or []
        return data[0] if data else None

    def load_provider_configuration(self, provider_key: str) -> dict[str, Any] | None:
        response = self.client.rpc("runtime_provider_configuration", {"p_provider_key": provider_key}).execute()
        return (response.data or [None])[0]


class PostgresAgentRuntimeStore:
    """Durable store used in production; InMemory remains test-only."""

    writable_tables = {
        "agent_events", "agent_queue_jobs", "agent_execution_runs", "agent_execution_steps",
        "agent_context_snapshots", "agent_verification_results", "strategy_subagent_runs",
        "agent_outcomes", "agent_learning_signals", "yux_strategy_retrieval_queries",
    }
    readable_tables = writable_tables | {
        "yux_strategy_agent_profiles", "marketing_agent_global_prompts", "model_routing_rules",
        "marketing_agent_tool_policies", "agent_budget_policies", "strategy_workflow_specs",
        "agent_autonomy_policies", "yux_strategy_concept_cards", "yux_strategy_source_chunks",
        "yux_strategy_source_assets", "yux_strategy_profile_tool_policies",
        "yux_strategy_card_embeddings", "yux_strategy_chunk_embeddings", "yux_strategy_asset_embeddings",
        "organization_company_profiles", "marketing_brand_profiles", "marketing_products_services",
        "knowledge_sources", "knowledge_entries", "marketing_knowledge_documents",
        "marketing_knowledge_chunks", "ai_assistant_knowledge_links",
        "ai_assistant_safety_rules",
    }
    postgres_array_columns = {
        ("agent_execution_steps", "warnings"),
        ("agent_context_snapshots", "card_ids"),
        ("agent_context_snapshots", "chunk_ids"),
        ("agent_context_snapshots", "asset_ids"),
        ("strategy_subagent_runs", "allowed_tools"),
        ("yux_strategy_retrieval_queries", "result_card_ids"),
        ("yux_strategy_retrieval_queries", "result_chunk_ids"),
        ("yux_strategy_retrieval_queries", "result_asset_ids"),
    }

    def __init__(self, database_url: str | None = None):
        self.database_url = database_url or os.getenv("DATABASE_URL", "")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is required for PostgresAgentRuntimeStore")

    def _connection(self):
        import psycopg

        connection = psycopg.connect(self.database_url)
        scope = _runtime_database_scope.get()
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.service_role', 'runtime', true)")
            cursor.execute("SELECT set_config('app.current_role', %s, true)", [scope.role])
            cursor.execute("SELECT set_config('app.current_orgs', %s, true)", ["{" + ",".join(scope.organization_ids) + "}"])
            cursor.execute("SELECT set_config('app.current_contract_id', %s, true)", [scope.contract_id])
            cursor.execute("SELECT set_config('app.current_profile_key', %s, true)", [scope.profile_key])
            cursor.execute("SELECT set_config('app.current_audience', %s, true)", [scope.audience])
        return connection

    def set_internal_scope(self) -> None:
        _runtime_database_scope.set(RuntimeDatabaseScope(role="yux_operator", organization_ids=()))

    def begin_radar_effect(self, *, organization_id, action, request_id, analysis_receipt_id, owner_token, input_hash, provider, model_snapshot, lease_until):
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute("SELECT id FROM public.radar_analysis_receipts WHERE id=%s AND organization_id=%s AND action=%s AND request_id=%s AND input_hash=%s AND owner_token=%s AND status='reserved' FOR UPDATE",[analysis_receipt_id,organization_id,action,request_id,input_hash,owner_token])
            if not cursor.fetchone():
                raise RuntimeError('radar_analysis_receipt_lease_lost')
            key = f'{action}:{request_id}'
            cursor.execute('SELECT COALESCE(MAX(attempt),0)+1 AS attempt FROM public.radar_effect_receipts WHERE organization_id=%s AND effect_key=%s',[organization_id,key])
            attempt = cursor.fetchone()['attempt']
            cursor.execute("INSERT INTO public.radar_effect_receipts(organization_id,effect_key,attempt,analysis_receipt_id,owner_token,input_hash,provider,model_snapshot,lease_until) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",[organization_id,key,attempt,analysis_receipt_id,owner_token,input_hash,provider,model_snapshot,lease_until])
            return dict(cursor.fetchone())

    def update_radar_effect(self, effect_id, *, owner_token, **changes):
        allowed = {'transport_outcome','validation_outcome','billing_outcome','response_body','usage','failure_code','model_snapshot','external_request_id'}
        if not changes or set(changes) - allowed:
            raise ValueError('radar_effect_update_invalid')
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute("SELECT analysis.id FROM public.radar_analysis_receipts analysis JOIN public.radar_effect_receipts effect ON effect.analysis_receipt_id=analysis.id AND effect.organization_id=analysis.organization_id WHERE effect.id=%s AND analysis.owner_token=%s AND analysis.status='reserved' FOR UPDATE OF analysis",[effect_id,owner_token])
            if not cursor.fetchone():
                raise RuntimeError('radar_analysis_receipt_lease_lost')
            clauses, values = [], []
            for key, value in changes.items():
                clauses.append(f'{key}=%s' + ('::jsonb' if key in ('response_body','usage') else ''))
                values.append(json.dumps(value) if key in ('response_body','usage') and value is not None else value)
            guards, immutable = [], []
            for key in ('response_body', 'usage'):
                if key in changes:
                    guards.append(f'AND ({key} IS NULL OR {key}=%s::jsonb)')
                    immutable.append(json.dumps(changes[key]) if changes[key] is not None else None)
            cursor.execute(f"UPDATE public.radar_effect_receipts SET {','.join(clauses)},updated_at=NOW() WHERE id=%s AND owner_token=%s AND lease_until>NOW() {' '.join(guards)} RETURNING *",[*values,effect_id,owner_token,*immutable])
            row = cursor.fetchone()
            if not row:
                raise RuntimeError('radar_analysis_receipt_lease_lost')
            return dict(row)

    def claim_radar_receipt(self, *, organization_id, action, request_id, input_hash, owner_token, input_request=None):
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            if input_request and input_request.get('retry_authorization'):
                cursor.execute('SELECT * FROM private.claim_radar_retry_receipt(%s,%s,%s,%s,%s,%s::jsonb)',[organization_id,action,request_id,input_hash,owner_token,json.dumps(input_request)])
                result=cursor.fetchone()
                return result['receipt'],result['claimed']
            cursor.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', [f'radar-receipt:{organization_id}:{action}:{request_id}'])
            cursor.execute('SELECT * FROM public.radar_analysis_receipts WHERE organization_id=%s AND action=%s AND request_id=%s FOR UPDATE', [organization_id, action, request_id])
            row = cursor.fetchone()
            if row and (row['input_hash'] != input_hash or row['status'] != 'rejected_before_provider'):
                return dict(row), False
            if row:
                cursor.execute("UPDATE public.radar_analysis_receipts SET status='reserved',owner_token=%s,input_request=COALESCE(input_request,%s::jsonb),lease_until=NOW()+INTERVAL '6 minutes',updated_at=NOW() WHERE id=%s RETURNING *", [owner_token,json.dumps(input_request),row['id']])
            else:
                cursor.execute("INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status,input_request,lease_until) VALUES(%s,%s,%s,%s,%s,'reserved',%s::jsonb,NOW()+INTERVAL '6 minutes') RETURNING *", [organization_id, action, request_id, input_hash, owner_token,json.dumps(input_request)])
            return dict(cursor.fetchone()), True

    def finish_radar_receipt(self, *, organization_id, action, request_id, owner_token, status, result, usage):
        with self._connection() as connection, connection.cursor() as cursor:
            cursor.execute("UPDATE public.radar_analysis_receipts SET status=%s,result=%s::jsonb,usage=%s::jsonb,lease_until=NULL,updated_at=NOW() WHERE organization_id=%s AND action=%s AND request_id=%s AND owner_token=%s AND status='reserved' RETURNING id",
                           [status, json.dumps(result) if result is not None else None, json.dumps(usage) if usage is not None else None, organization_id, action, request_id, owner_token])
            if not cursor.fetchone():
                raise RuntimeError('radar_analysis_receipt_lease_lost')

    def claim_radar_revalidation(self, *, organization_id, action, request_id, input_hash, owner_token, tenant_context=None):
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute('SELECT * FROM public.radar_analysis_receipts WHERE organization_id=%s AND action=%s AND request_id=%s FOR UPDATE',[organization_id,action,request_id])
            row = cursor.fetchone()
            if not row or row['input_hash'] != input_hash:
                return dict(row) if row else None, None
            if tenant_context is not None and (not row.get('input_request') or any(row['input_request'].get(key) != tenant_context.get(key) for key in ('client_id','contract_id'))):
                raise ValueError('radar_analysis_tenant_changed')
            if row['status'] == 'completed' or row['status'] == 'reserved' and (row['lease_until'] is None or row['lease_until'] > datetime.now().astimezone()):
                return dict(row), None
            cursor.execute("SELECT * FROM public.radar_effect_receipts WHERE analysis_receipt_id=%s AND organization_id=%s AND transport_outcome='received' AND response_body IS NOT NULL ORDER BY attempt DESC LIMIT 1 FOR UPDATE",[row['id'],organization_id])
            effect = cursor.fetchone()
            if not effect or not row.get('input_request'):
                return dict(row), None
            cursor.execute("UPDATE public.radar_analysis_receipts SET status='reserved',owner_token=%s,lease_until=NOW()+INTERVAL '6 minutes',updated_at=NOW() WHERE id=%s RETURNING *",[owner_token,row['id']])
            updated = dict(cursor.fetchone())
            cursor.execute("UPDATE public.radar_effect_receipts SET owner_token=%s,lease_until=NOW()+INTERVAL '6 minutes',updated_at=NOW() WHERE id=%s RETURNING *",[owner_token,effect['id']])
            return updated,dict(cursor.fetchone())

    def set_tenant_scope(
        self,
        organization_id: str,
        *,
        contract_id: str | None = None,
        profile_key: str | None = None,
        audience: str | None = None,
    ) -> None:
        try:
            canonical_organization_id = str(UUID(organization_id))
            canonical_contract_id = str(UUID(contract_id)) if contract_id else ""
        except (ValueError, TypeError, AttributeError) as error:
            raise ValueError("invalid_runtime_database_scope") from error
        if audience and audience not in {"internal_operator", "client_user", "external_contact"}:
            raise ValueError("invalid_runtime_audience")
        _runtime_database_scope.set(RuntimeDatabaseScope(
            role="client_member",
            organization_ids=(canonical_organization_id,),
            contract_id=canonical_contract_id,
            profile_key=profile_key or "",
            audience=audience or "",
        ))

    @staticmethod
    def _row_factory():
        from psycopg.rows import dict_row

        return dict_row

    def _table(self, table: str, *, write: bool = False) -> str:
        allowed = self.writable_tables if write else self.readable_tables
        if table not in allowed:
            raise ValueError(f"unsupported_runtime_table:{table}")
        return table

    @classmethod
    def _value(cls, table: str, column: str, value: Any) -> Any:
        if (table, column) in cls.postgres_array_columns and isinstance(value, list):
            return value
        if isinstance(value, (dict, list)):
            return json.dumps(value, default=cls._json_default)
        return value

    @staticmethod
    def _json_default(value: Any) -> Any:
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")

    @classmethod
    def _json_safe(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return {str(key): cls._json_safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [cls._json_safe(item) for item in value]
        if isinstance(value, (UUID, datetime, date, Decimal)):
            return cls._json_default(value)
        return value

    @classmethod
    def _row(cls, row: dict[str, Any]) -> dict[str, Any]:
        for key, value in list(row.items()):
            if isinstance(value, str) and value[:1] in ("{", "["):
                try:
                    row[key] = json.loads(value)
                except json.JSONDecodeError:
                    pass
        return cls._json_safe(row)

    def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        table = self._table(table, write=True)
        columns = list(payload.keys())
        values = [self._value(table, column, payload[column]) for column in columns]
        placeholders = ", ".join(["%s"] * len(columns))
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(
                f"INSERT INTO public.{table} ({', '.join(columns)}) VALUES ({placeholders}) RETURNING *",
                values,
            )
            return self._row(dict(cursor.fetchone()))

    def update(self, table: str, record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        table = self._table(table, write=True)
        columns = list(payload.keys())
        assignments = ", ".join(f"{column} = %s" for column in columns)
        values = [self._value(table, column, payload[column]) for column in columns] + [record_id]
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
        values = [self._value(table, column, value) for column, value in filters.items()] + ([limit] if limit is not None else [])
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(f"SELECT * FROM public.{table} WHERE {where}{suffix}", values)
            return [self._row(dict(row)) for row in cursor.fetchall()]

    def load_provider_credential_envelope(self, provider_key: str) -> dict[str, Any] | None:
        """Read the encrypted credential envelope exposed to the runtime, never the secrets table."""
        token = _runtime_database_scope.set(RuntimeDatabaseScope(role="yux_operator", organization_ids=()))
        try:
            with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
                cursor.execute("SELECT * FROM private.runtime_provider_secret_envelope(%s)", [provider_key])
                row = cursor.fetchone()
                return self._row(dict(row)) if row else None
        finally:
            _runtime_database_scope.reset(token)

    def load_provider_configuration(self, provider_key: str) -> dict[str, Any] | None:
        token = _runtime_database_scope.set(RuntimeDatabaseScope(role="yux_operator", organization_ids=()))
        try:
            with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
                cursor.execute("SELECT * FROM private.runtime_provider_configuration(%s)", [provider_key])
                row = cursor.fetchone()
                return self._row(dict(row)) if row else None
        finally:
            _runtime_database_scope.reset(token)

    def retrieve_authorized_knowledge(
        self,
        *,
        organization_id: str,
        contract_id: str | None,
        profile_key: str,
        audience: str,
        module_key: str,
        workflow_key: str | None,
        channel: str | None,
        query_text: str,
        match_limit: int,
        query_embedding: list[float] | None = None,
        embedding_model: str | None = None,
        namespace: str = "all",
    ) -> list[dict[str, Any]]:
        """Run the database policy before ranking; no raw table candidate limit is used."""
        with self._connection() as connection, connection.cursor(row_factory=self._row_factory()) as cursor:
            cursor.execute(
                """SELECT * FROM private.retrieve_authorized_knowledge_v1(
                     %s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s
                   )""",
                [
                    organization_id, contract_id, profile_key, audience, module_key,
                    workflow_key, channel, query_text, match_limit,
                    json.dumps(query_embedding) if query_embedding is not None else None,
                    embedding_model, namespace,
                ],
            )
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
        self.set_internal_scope()
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
                      SET current_balance = CASE
                            WHEN is_unlimited THEN current_balance
                            ELSE current_balance - %s
                          END,
                          monthly_used = monthly_used + %s,
                          updated_at = NOW()
                    WHERE organization_id = %s AND client_id = %s AND contract_id = %s
                      AND (is_unlimited OR current_balance >= %s)
                    RETURNING id, current_balance, monthly_used, is_unlimited""",
                [credits, credits, organization_id, client_id, contract_id, credits],
            )
            wallet = cursor.fetchone()
            if not wallet:
                cursor.execute(
                    """SELECT id FROM public.ai_credit_wallets
                       WHERE organization_id = %s AND client_id = %s AND contract_id = %s""",
                    [organization_id, client_id, contract_id],
                )
                raise CreditReservationError('credits_insufficient' if cursor.fetchone() else 'wallet_missing')
            cursor.execute(
                """INSERT INTO public.ai_usage_ledger (
                     organization_id, client_id, contract_id, wallet_id, workflow_run_id,
                     action, credits_charged, status, metadata
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,'succeeded',%s::jsonb)
                   RETURNING id""",
                [organization_id, client_id, contract_id, wallet["id"], workflow_run_id, action, credits, json.dumps({"source": "agent_runtime", "unlimited": bool(wallet["is_unlimited"])})],
            )
            ledger = cursor.fetchone()
            return {
                "reserved": credits,
                "wallet_id": wallet["id"],
                "ledger_id": ledger["id"],
                "current_balance": wallet["current_balance"],
                "unlimited": bool(wallet["is_unlimited"]),
            }
