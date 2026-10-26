from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def project_memory_strategies(tables: dict, *, organization_id, contract_id, profile_key, audience, query, strategy_ids=None, max_chars=6000) -> dict:
    """In-memory adapter for tests. Production authorization is enforced in PostgreSQL."""
    if audience not in {'internal_operator', 'client_user', 'external_contact'}:
        raise ValueError('invalid_company_strategy_audience')
    owned = [row for row in tables.get('company_strategies', []) if row.get('organization_id') == organization_id]
    if strategy_ids and not set(strategy_ids).issubset({row['id'] for row in owned}):
        raise ValueError('company_strategy_selection_scope_forbidden')
    revisions = {row['id']: row for row in tables.get('company_strategy_revisions', []) if row.get('organization_id') == organization_id}
    publications = {row['revision_id'] for row in tables.get('company_strategy_publications', []) if row.get('organization_id') == organization_id}
    tokens = set(re.findall(r'\w+', query.lower()))
    owned.sort(key=lambda row: (not row.get('is_primary'), -len(tokens.intersection(re.findall(r'\w+', json.dumps(revisions.get(row.get('published_revision_id'), {}), ensure_ascii=False).lower()))), row['id']))
    selected, index = [], []
    omitted, truncated, total, incomplete = 0, 0, 0, False
    for row in owned:
        revision = revisions.get(row.get('published_revision_id'))
        if row.get('archived_at') or not revision or revision['id'] not in publications or (strategy_ids and row['id'] not in strategy_ids):
            continue
        projection = json.loads(json.dumps(revision['content']))
        if audience == 'external_contact':
            projection = {'schemaVersion': 1, 'title': 'Orientações comerciais', 'sections': [section for section in projection.get('sections', []) if section.get('agentUse') == 'external_guidance']}
            if not projection['sections']:
                continue
        total += 1
        entry = {'strategyId': row['id'], 'revisionId': revision['id'], 'title': projection['title'][:120], 'isPrimary': bool(row.get('is_primary'))}
        if len(json.dumps(index + [entry], ensure_ascii=False)) < min(1500, max_chars // 4):
            index.append(entry)
        if len(selected) >= 3:
            continue
        compact = {**entry, 'title': projection['title'], 'revisionNumber': revision['revision_number']}
        if audience != 'external_contact':
            compact.update(objective=projection.get('objective', '')[:500], summary=projection.get('summary', '')[:700])
        sections = [section for section in projection.get('sections', []) if section.get('kind') == 'constraints']
        compact['sections'] = list(sections)
        budget = max_chars - len(json.dumps(index, ensure_ascii=False)) - len(json.dumps([{k:v for k,v in item.items() if k != 'sourceContent'} for item in selected], ensure_ascii=False)) - 600
        if len(json.dumps(compact, ensure_ascii=False)) > budget:
            incomplete = True
            continue
        for section in projection.get('sections', []):
            if section.get('kind') == 'constraints':
                continue
            if len(json.dumps({**compact, 'sections': compact['sections'] + [section]}, ensure_ascii=False)) <= budget:
                compact['sections'].append(section)
            else:
                available = max(0, budget - len(json.dumps(compact, ensure_ascii=False)) - 300)
                if available >= 80:
                    compact['sections'].append({**section, 'body': section['body'][:available]})
                    truncated += 1
                else:
                    omitted += 1
        compact['sourceContent'] = json.dumps(projection, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        selected.append(compact)
    return {'index': index, 'selected': selected, 'coverage': {'total': total, 'selected': len(selected), 'indexed': len(index), 'omittedStrategies': total-len(selected), 'omittedSections': omitted, 'truncatedSections': truncated, 'incomplete': incomplete}, 'contextHash': canonical_hash(selected)}


@dataclass
class CompanyStrategyContextService:
    store: Any

    def retrieve(self, *, organization_id, contract_id, profile_key, audience, query, strategy_ids=None, max_chars=6000) -> dict:
        result = self.store.retrieve_company_strategy_context(organization_id=organization_id, contract_id=contract_id, profile_key=profile_key, audience=audience, query=query, strategy_ids=strategy_ids or [], max_chars=max_chars)
        selected, sources = [], []
        represented_ids=[]
        for raw in result.get('selected', []):
            item = dict(raw)
            source_content = item.pop('sourceContent')
            if audience != 'external_contact':
                represented_ids.extend((json.loads(source_content).get('references') or {}).get('representedBusinessIds',[]))
            content_hash = canonical_hash({'id': item['revisionId'], 'version': str(item['revisionNumber']), 'content': source_content})
            item['projectionHash'] = content_hash
            selected.append(item)
            sources.append({'ref': f"customer:strategy:{item['revisionId']}", 'kind': 'company_strategy', 'id': item['revisionId'], 'version': str(item['revisionNumber']), 'contentHash': content_hash, 'visibility': 'external' if audience == 'external_contact' else 'internal', 'title': item['title'], 'displayMode': 'named'})
        return {'strategy_context': {**result, 'selected': selected}, 'sources': sources,'portfolio_selection':{'representedBusinessIds':list(dict.fromkeys(represented_ids))[:100]}}
