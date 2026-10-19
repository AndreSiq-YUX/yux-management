-- Progress is not polling, lease renewal, wall-clock metadata or array order.
CREATE FUNCTION private.radar_progress_content(value JSONB) RETURNS JSONB
 LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE result JSONB;
BEGIN
 IF jsonb_typeof(value)='object' THEN
  SELECT COALESCE(jsonb_object_agg(key,private.radar_progress_content(val)),'{}'::jsonb) INTO result
  FROM jsonb_each(value) entry(key,val)
  WHERE key NOT IN('observedAt','checkedAt','updatedAt','updated_at','startedAt','completedAt','heartbeatAt','leaseUntil','lease_until');
  RETURN result;
 ELSIF jsonb_typeof(value)='array' THEN
  SELECT COALESCE(jsonb_agg(cleaned ORDER BY cleaned::text),'[]'::jsonb) INTO result
  FROM(SELECT private.radar_progress_content(element) AS cleaned FROM jsonb_array_elements(value) element) elements;
  RETURN result;
 END IF;
 RETURN value;
END;
$$;
REVOKE ALL ON FUNCTION private.radar_progress_content(JSONB) FROM PUBLIC,yux_runtime;
GRANT EXECUTE ON FUNCTION private.radar_progress_content(JSONB) TO yux_api,yux_worker;

ALTER TABLE public.radar_candidate_research_runs ADD COLUMN last_progress_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.radar_capture_operations ADD COLUMN last_progress_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.radar_research_requests ADD COLUMN last_progress_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- Do not claim that a historical polling timestamp proves useful progress.
UPDATE public.radar_candidate_research_runs SET last_progress_at=COALESCE(completed_at,created_at);
UPDATE public.radar_capture_operations SET last_progress_at=created_at;
UPDATE public.radar_research_requests SET last_progress_at=created_at;

CREATE FUNCTION private.radar_mark_run_progress() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.stage IS DISTINCT FROM OLD.stage
  OR private.radar_progress_content(NEW.output) IS DISTINCT FROM private.radar_progress_content(OLD.output)
  OR (SELECT jsonb_object_agg(key,value->>'status') FROM jsonb_each(COALESCE(NEW.calls,'{}'))) IS DISTINCT FROM
     (SELECT jsonb_object_agg(key,value->>'status') FROM jsonb_each(COALESCE(OLD.calls,'{}')))
 THEN NEW.last_progress_at=NOW(); END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER radar_run_progress BEFORE UPDATE ON public.radar_candidate_research_runs FOR EACH ROW EXECUTE FUNCTION private.radar_mark_run_progress();

CREATE FUNCTION private.radar_mark_parent_progress() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.last_progress_at=NOW(); END IF;
 IF TG_TABLE_NAME='radar_capture_operations' THEN
  IF NEW.queries IS DISTINCT FROM OLD.queries OR NEW.scope_pages IS DISTINCT FROM OLD.scope_pages OR NEW.discovery_stopped IS DISTINCT FROM OLD.discovery_stopped THEN NEW.last_progress_at=NOW(); END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER radar_capture_progress BEFORE UPDATE ON public.radar_capture_operations FOR EACH ROW EXECUTE FUNCTION private.radar_mark_parent_progress();
CREATE TRIGGER radar_request_progress BEFORE UPDATE ON public.radar_research_requests FOR EACH ROW EXECUTE FUNCTION private.radar_mark_parent_progress();

CREATE FUNCTION private.radar_propagate_progress() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='radar_candidate_research_runs' THEN
  IF NEW.last_progress_at IS NOT DISTINCT FROM OLD.last_progress_at THEN RETURN NEW; END IF;
  UPDATE public.radar_capture_operations parent SET last_progress_at=NEW.last_progress_at
   WHERE parent.organization_id=NEW.organization_id AND parent.campaign_id=NEW.campaign_id AND EXISTS(SELECT 1 FROM public.radar_capture_items item WHERE item.operation_id=parent.id AND item.organization_id=NEW.organization_id AND item.run_id=NEW.id);
  UPDATE public.radar_research_requests parent SET last_progress_at=NEW.last_progress_at
   WHERE parent.organization_id=NEW.organization_id AND parent.campaign_id=NEW.campaign_id AND EXISTS(SELECT 1 FROM public.radar_research_request_items item WHERE item.research_request_id=parent.id AND item.organization_id=NEW.organization_id AND item.run_id=NEW.id);
 ELSIF TG_TABLE_NAME='radar_capture_items' THEN
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.run_id IS DISTINCT FROM OLD.run_id THEN
   UPDATE public.radar_capture_operations SET last_progress_at=NOW() WHERE id=NEW.operation_id AND organization_id=NEW.organization_id;
  END IF;
 ELSE
  IF TG_OP='INSERT' OR NEW.state IS DISTINCT FROM OLD.state OR NEW.run_id IS DISTINCT FROM OLD.run_id THEN
   UPDATE public.radar_research_requests SET last_progress_at=NOW() WHERE id=NEW.research_request_id AND organization_id=NEW.organization_id;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER radar_run_parent_progress AFTER UPDATE ON public.radar_candidate_research_runs FOR EACH ROW EXECUTE FUNCTION private.radar_propagate_progress();
CREATE TRIGGER radar_capture_item_progress AFTER INSERT OR UPDATE ON public.radar_capture_items FOR EACH ROW EXECUTE FUNCTION private.radar_propagate_progress();
CREATE TRIGGER radar_request_item_progress AFTER INSERT OR UPDATE ON public.radar_research_request_items FOR EACH ROW EXECUTE FUNCTION private.radar_propagate_progress();
REVOKE ALL ON FUNCTION private.radar_mark_run_progress(),private.radar_mark_parent_progress(),private.radar_propagate_progress() FROM PUBLIC,yux_api,yux_worker,yux_runtime;

CREATE TABLE public.radar_research_attention (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,campaign_id UUID NOT NULL,
 operation_id UUID,research_request_id UUID,reason TEXT NOT NULL CHECK(reason IN('running_with_heartbeat','waiting_capacity','waiting_authorization','queue_unavailable','lease_expired','effect_uncertain','no_progress')),
 last_progress_at TIMESTAMPTZ NOT NULL,detected_at TIMESTAMPTZ NOT NULL,resolved_at TIMESTAMPTZ,
 CHECK((operation_id IS NULL)<>(research_request_id IS NULL)),UNIQUE(operation_id),UNIQUE(research_request_id),
 FOREIGN KEY(operation_id,organization_id,campaign_id) REFERENCES public.radar_capture_operations(id,organization_id,campaign_id) ON DELETE CASCADE,
 FOREIGN KEY(research_request_id,organization_id,campaign_id) REFERENCES public.radar_research_requests(id,organization_id,campaign_id) ON DELETE CASCADE
);
CREATE INDEX radar_research_attention_scope ON public.radar_research_attention(organization_id,campaign_id) WHERE resolved_at IS NULL;
CREATE INDEX radar_capture_stalled ON public.radar_capture_operations(last_progress_at) WHERE status IN('queued','discovering','researching','blocked');
CREATE INDEX radar_request_stalled ON public.radar_research_requests(last_progress_at) WHERE status IN('accepted','running','waiting');
ALTER TABLE public.radar_research_attention ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_research_attention FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_research_attention FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT ON public.radar_research_attention TO yux_api;
GRANT SELECT,INSERT,UPDATE ON public.radar_research_attention TO yux_worker;
CREATE POLICY radar_attention_admin ON public.radar_research_attention FOR SELECT TO yux_api USING(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_attention_worker ON public.radar_research_attention FOR ALL TO yux_worker
 USING(private.rls_can_access_organization(organization_id) AND organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]))
 WITH CHECK(private.rls_can_access_organization(organization_id) AND organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[]));

-- Global maintenance sees only tenant identifiers; all diagnosis/persistence is
-- performed later under that tenant's restrictive worker RLS, never as owner.
CREATE FUNCTION private.radar_watchdog_scopes() RETURNS TABLE(organization_id UUID)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('app.service_role',true) IS DISTINCT FROM 'worker' THEN RAISE EXCEPTION 'radar_watchdog_worker_required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT DISTINCT scopes.organization_id FROM(
  SELECT capture.organization_id FROM public.radar_capture_operations capture WHERE capture.status IN('queued','discovering','researching','blocked')
  UNION SELECT request.organization_id FROM public.radar_research_requests request WHERE request.status IN('accepted','running','waiting')
  UNION SELECT attention.organization_id FROM public.radar_research_attention attention WHERE attention.resolved_at IS NULL
 ) scopes;
END;
$$;
REVOKE ALL ON FUNCTION private.radar_watchdog_scopes() FROM PUBLIC,yux_api,yux_runtime;
GRANT EXECUTE ON FUNCTION private.radar_watchdog_scopes() TO yux_worker;
SELECT private.backfill_radar_operational_defaults('{"stalledAfterMinutes":10}'::jsonb);
