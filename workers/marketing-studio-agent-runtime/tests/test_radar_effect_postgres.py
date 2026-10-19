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
@pytest.mark.parametrize('action',['radar_presence_resolution','radar_discovery_extraction'])
def test_runtime_writer_and_free_revalidation_with_real_postgres_lease_and_tenant_scope(action):
    import psycopg
    target = urlsplit(DATABASE)
    url = urlunsplit((target.scheme, f'yux_runtime@{target.hostname}:{target.port}', target.path, target.query, target.fragment))
    store = PostgresAgentRuntimeStore(url)
    org = '10000000-0000-4000-8000-000000000003'
    store.set_tenant_scope(org, profile_key=action, audience='internal_operator')
    request_id, owner = str(uuid4()), str(uuid4())
    key = dict(organization_id=org, action=action, request_id=request_id)
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


@pytest.mark.skipif(not DATABASE, reason='isolated PostgreSQL URL required')
def test_runtime_claim_consumes_explicit_retry_atomically_and_completed_delivery_does_not_repeat_it():
    import json
    import psycopg
    from psycopg.rows import dict_row
    target=urlsplit(DATABASE)
    store=PostgresAgentRuntimeStore(urlunsplit((target.scheme,f'yux_runtime@{target.hostname}:{target.port}',target.path,'','')))
    org='10000000-0000-4000-8000-000000000003'
    store.set_tenant_scope(org,profile_key='radar_presence_resolution',audience='internal_operator')
    campaign_id,candidate_id,route_id,old_id,grant_id=[str(uuid4()) for _ in range(5)]
    new_receipt=None
    try:
        with psycopg.connect(DATABASE,row_factory=dict_row) as db:
            actor=db.execute("SELECT id FROM public.app_users WHERE role='yux_admin' AND is_active=TRUE LIMIT 1").fetchone()['id']
            tenant=db.execute("SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=%s",[org]).fetchone()
            db.execute("INSERT INTO public.radar_campaigns(id,organization_id,name,target_segment,target_states,offer_type,campaign_type) VALUES(%s,%s,'Synthetic retry fixture','Empresas',ARRAY['PR'],'Serviço','regional_b2b')",[campaign_id,org])
            db.execute("INSERT INTO public.radar_candidate_records(id,organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES(%s,%s,%s,'manual','Empresa sintética',%s,'{}')",[candidate_id,org,campaign_id,str(uuid4())])
            db.execute("INSERT INTO public.model_routing_rules(id,agent_type,organization_id,provider,model_name) VALUES(%s,'radar_presence_resolution',%s,'openrouter','fixture-never-called')",[route_id,org])
            routes=db.execute("SELECT * FROM public.model_routing_rules WHERE agent_type='radar_presence_resolution' AND status='active' AND routing_tier='default' AND agent_id IS NULL AND (organization_id IS NULL OR organization_id=%s) AND (client_id IS NULL OR client_id=%s) AND (contract_id IS NULL OR contract_id=%s) ORDER BY id",[org,tenant['client_id'],tenant['contract_id']]).fetchall()
            snapshots=[dict(id=str(row['id']),version=row.get('version'),action=row['agent_type'],organizationId=str(row['organization_id']) if row.get('organization_id') else None,clientId=str(row['client_id']) if row.get('client_id') else None,contractId=str(row['contract_id']) if row.get('contract_id') else None,provider=row['provider'],model=row['model_name'],fallbackModel=row.get('fallback_model_name'),fallbacks=[dict(provider=item['provider'],modelName=item.get('modelName') or item.get('model_name')) for item in row.get('fallback_routes') or []],maxInputTokens=row.get('max_input_tokens'),maxOutputTokens=row.get('max_output_tokens'),maxCostPerRun=float(row['max_cost_per_run']) if row.get('max_cost_per_run') is not None else None,temperature=float(row['temperature']) if row.get('temperature') is not None else None) for row in routes]
            policy=db.execute('SELECT version,limits FROM public.radar_operational_limits WHERE singleton=TRUE').fetchone()
            snapshot=dict(campaignOperationalVersion=1,operationalPolicy=policy,routes=snapshots)
            db.execute("INSERT INTO public.radar_analysis_receipts(id,organization_id,action,request_id,input_hash,owner_token,status) VALUES(%s,%s,'radar_presence_resolution',%s,%s,%s,'uncertain')",[old_id,org,str(uuid4()),'a'*64,str(uuid4())])
            db.execute("INSERT INTO public.radar_analysis_retry_authorizations(id,organization_id,campaign_id,candidate_id,request_id,batch_hash,configuration_revision,previous_analysis_receipt_id,action,approved_by,expires_at,acknowledged_previous_charge,policy_snapshot,policy_hash) VALUES(%s,%s,%s,%s,%s,%s,1,%s,'radar_presence_resolution',%s,NOW()+INTERVAL '1 hour',TRUE,%s::jsonb,%s)",[grant_id,org,campaign_id,candidate_id,str(uuid4()),'c'*64,old_id,actor,json.dumps(snapshot),'d'*64])
        payload=dict(client_id=str(tenant['client_id']) if tenant['client_id'] else None,contract_id=str(tenant['contract_id']) if tenant['contract_id'] else None,retry_authorization=dict(authorization_id=grant_id,candidate_id=candidate_id,campaign_id=campaign_id,configuration_revision=1,policy_hash='d'*64))
        key=dict(organization_id=org,action='radar_presence_resolution',request_id=str(uuid4()))
        owner=str(uuid4())
        new_receipt,claimed=store.claim_radar_receipt(**key,input_hash='e'*64,owner_token=owner,input_request=payload)
        assert claimed
        store.finish_radar_receipt(**key,owner_token=owner,status='completed',result=dict(scope='unresolved'),usage=None)
        recovered,claimed=store.claim_radar_receipt(**key,input_hash='e'*64,owner_token=str(uuid4()),input_request=payload)
        assert not claimed and recovered['status']=='completed'
        with pytest.raises(Exception,match='radar_analysis_retry_authorization_invalid'):
            store.claim_radar_receipt(**{**key,'request_id':str(uuid4())},input_hash='f'*64,owner_token=str(uuid4()),input_request=payload)
        with psycopg.connect(DATABASE,row_factory=dict_row) as db:
            grant=db.execute('SELECT consumed_by_analysis_receipt_id FROM public.radar_analysis_retry_authorizations WHERE id=%s',[grant_id]).fetchone()
            assert str(grant['consumed_by_analysis_receipt_id'])==str(new_receipt['id'])
            assert db.execute('SELECT status FROM public.radar_analysis_receipts WHERE id=%s',[old_id]).fetchone()['status']=='uncertain'
    finally:
        store.set_internal_scope()
        with psycopg.connect(DATABASE) as db:
            db.execute('DELETE FROM public.radar_campaigns WHERE id=%s',[campaign_id])
            db.execute('DELETE FROM public.model_routing_rules WHERE id=%s',[route_id])
            db.execute('DELETE FROM public.radar_analysis_receipts WHERE id=ANY(%s::uuid[])',[[old_id]+([str(new_receipt['id'])] if new_receipt else [])])
