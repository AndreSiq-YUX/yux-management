"""Optional synthetic-data integration; never accepts a remote/shared DB."""
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4
import pytest
from yux_agent_runtime.runtime_store import PostgresAgentRuntimeStore
from yux_agent_runtime.radar_receipts import revalidate_radar_receipt

DATABASE = os.getenv('YUX_RADAR_TEST_DATABASE_URL')
if DATABASE:
    target = urlsplit(DATABASE)
    if target.hostname != '127.0.0.1' or target.path != '/yux_radar_research_test':
        raise RuntimeError('isolated_radar_test_database_required')


@pytest.mark.skipif(not DATABASE, reason='isolated PostgreSQL URL required')
def test_runtime_writer_and_free_revalidation_with_real_postgres_lease_and_tenant_scope():
    import psycopg
    target = urlsplit(DATABASE)
    url = urlunsplit((target.scheme, f'yux_runtime@{target.hostname}:{target.port}', target.path, target.query, target.fragment))
    store = PostgresAgentRuntimeStore(url)
    org = '10000000-0000-4000-8000-000000000003'
    store.set_tenant_scope(org, profile_key='radar_presence_resolution', audience='internal_operator')
    request_id, owner = str(uuid4()), str(uuid4())
    key = dict(organization_id=org, action='radar_presence_resolution', request_id=request_id)
    receipt = None
    try:
        receipt, claimed = store.claim_radar_receipt(**key, input_hash='d' * 64, owner_token=owner, input_request=dict(client_id=None, contract_id=None, evidence=[]))
        assert claimed
        effect = store.begin_radar_effect(**key, analysis_receipt_id=receipt['id'], owner_token=owner, input_hash='d' * 64, provider='fixture', model_snapshot='fixture', lease_until=(datetime.now(timezone.utc) + timedelta(minutes=6)).isoformat())
        saved = store.update_radar_effect(effect['id'], owner_token=owner, transport_outcome='received', response_body=dict(content='saved fixture response', raw_response_id='fixture-response'), usage=dict(costUsd=.001), billing_outcome='known')
        assert saved['response_body']['content'] == 'saved fixture response'
        with pytest.raises(RuntimeError, match='radar_analysis_receipt_lease_lost'):
            store.update_radar_effect(effect['id'], owner_token=str(uuid4()), validation_outcome='valid')
        with pytest.raises(RuntimeError):
            store.update_radar_effect(effect['id'], owner_token=owner, response_body=dict(content='changed response'))
        store.finish_radar_receipt(**key, owner_token=owner, status='uncertain', result=None, usage=None)
        result = revalidate_radar_receipt(store, **key, input_hash='d' * 64, tenant_context=dict(client_id=None, contract_id=None), validate=lambda response, saved: dict(scope='unresolved', fixture=True))
        assert result == dict(scope='unresolved', fixture=True)
        row, claimed = store.claim_radar_receipt(**key, input_hash='d' * 64, owner_token=str(uuid4()))
        assert not claimed and row['status'] == 'completed'
        store.set_tenant_scope('10000000-0000-4000-8000-000000000001')
        foreign, _ = store.claim_radar_revalidation(**key, input_hash='d' * 64, owner_token=str(uuid4()))
        assert foreign is None
    finally:
        store.set_internal_scope()
        if receipt:
            with psycopg.connect(DATABASE) as connection:
                connection.execute('DELETE FROM public.radar_analysis_receipts WHERE id=%s', [receipt['id']])
