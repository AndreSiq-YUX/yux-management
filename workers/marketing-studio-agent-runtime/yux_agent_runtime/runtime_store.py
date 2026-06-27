from __future__ import annotations

from dataclasses import dataclass, field
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
