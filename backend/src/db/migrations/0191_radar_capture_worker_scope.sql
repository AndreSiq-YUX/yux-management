-- Explicit worker scope even for global maintenance's internal service identity.
-- Reconciliation is allowed to read the metadata-only outbox, not tenant payloads.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['radar_capture_operations','radar_capture_items','radar_capture_overflow'] LOOP
  EXECUTE format('CREATE POLICY capture_worker_scope ON public.%I AS RESTRICTIVE FOR ALL TO yux_worker USING(organization_id=ANY(COALESCE(NULLIF(current_setting(''app.current_orgs'',true),''''),''{}'')::uuid[])) WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting(''app.current_orgs'',true),''''),''{}'')::uuid[]))',t);
 END LOOP;
END $$;
CREATE POLICY capture_outbox_worker_insert ON public.radar_capture_outbox AS RESTRICTIVE FOR INSERT TO yux_worker
 WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
CREATE POLICY capture_outbox_worker_update ON public.radar_capture_outbox AS RESTRICTIVE FOR UPDATE TO yux_worker
 USING(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]))
 WITH CHECK(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
CREATE POLICY capture_outbox_worker_delete ON public.radar_capture_outbox AS RESTRICTIVE FOR DELETE TO yux_worker
 USING(organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));
