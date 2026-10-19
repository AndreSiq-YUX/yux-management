-- Keep progress local to the row being changed. Writing a parent from a child
-- trigger would invert the existing campaign/parent->child lock order.
DROP TRIGGER radar_run_parent_progress ON public.radar_candidate_research_runs;
DROP TRIGGER radar_capture_item_progress ON public.radar_capture_items;
DROP TRIGGER radar_request_item_progress ON public.radar_research_request_items;
DROP FUNCTION private.radar_propagate_progress();
ALTER TABLE public.radar_capture_items ADD COLUMN last_progress_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.radar_research_request_items ADD COLUMN last_progress_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.radar_capture_items SET last_progress_at=created_at;
UPDATE public.radar_research_request_items SET last_progress_at=COALESCE(started_at,created_at);
CREATE FUNCTION private.radar_mark_item_progress() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='radar_capture_items' THEN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.run_id IS DISTINCT FROM OLD.run_id THEN NEW.last_progress_at=NOW(); END IF;
 ELSE
  IF NEW.state IS DISTINCT FROM OLD.state OR NEW.run_id IS DISTINCT FROM OLD.run_id THEN NEW.last_progress_at=NOW(); END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER radar_capture_item_progress BEFORE UPDATE ON public.radar_capture_items FOR EACH ROW EXECUTE FUNCTION private.radar_mark_item_progress();
CREATE TRIGGER radar_request_item_progress BEFORE UPDATE ON public.radar_research_request_items FOR EACH ROW EXECUTE FUNCTION private.radar_mark_item_progress();
REVOKE ALL ON FUNCTION private.radar_mark_item_progress() FROM PUBLIC,yux_api,yux_worker,yux_runtime;
