-- Configuration and receipts only. Agent execution stays capability-gated.
ALTER TABLE public.model_routing_rules ADD COLUMN research_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(research_config)='object');
ALTER TABLE public.radar_analysis_receipts DROP CONSTRAINT radar_analysis_receipts_action_check;
ALTER TABLE public.radar_analysis_receipts ADD CONSTRAINT radar_analysis_receipts_action_check
 CHECK(action IN('radar_presence_resolution','radar_business_qualification','radar_discovery_extraction','radar_initial_triage','radar_next_action','radar_quality_gate','radar_deep_research'));
CREATE FUNCTION private.enforce_research_provider() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.kind='research' AND (NEW.provider<>'perplexity' OR NEW.protocol<>'perplexity-agent-v1'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.fallback_routes) item WHERE item->>'provider' IS DISTINCT FROM 'perplexity'))
  OR NEW.kind IS DISTINCT FROM 'research' AND (NEW.provider='perplexity' OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.fallback_routes) item WHERE item->>'provider'='perplexity'))
 THEN RAISE EXCEPTION 'llm_route_capability_incompatible'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_research_provider() FROM PUBLIC,yux_api,yux_worker,yux_runtime;
CREATE TRIGGER enforce_research_provider BEFORE INSERT OR UPDATE ON public.model_routing_rules FOR EACH ROW EXECUTE FUNCTION private.enforce_research_provider();
