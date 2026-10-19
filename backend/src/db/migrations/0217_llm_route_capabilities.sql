-- Capability classification only. No provider, model or paid route is enabled.
CREATE TABLE public.llm_use_case_definitions(
 key TEXT PRIMARY KEY CHECK(key~'^[a-z][a-z0-9_]{0,199}$'),
 kind TEXT NOT NULL CHECK(kind IN('chat','embedding','decision','research')),
 title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',group_name TEXT NOT NULL DEFAULT 'Funções registradas',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.llm_use_case_definitions(key,kind,title)
 SELECT key,'chat',key FROM unnest(ARRAY['global_llm','action_engine_strategist','mission_supervisor','campaign_launch_specialist','funnel_nurture_specialist','automation_lead_classification','automation_message_generation','automation_proposal_generation','strategy_curator','knowledge_curator','radar_business_qualification','radar_presence_resolution','radar_discovery_extraction','growth_strategist','crm_controller','ai_sdr_comercial_1','ai_closer','support_assistant','customer_growth_comercial_2','revenue_recovery','offer_conversion','marketing_strategist','referral_growth','metrics_cash_mroi','proposal_delivery']) AS key;
INSERT INTO public.llm_use_case_definitions(key,kind,title) VALUES
 ('knowledge_embeddings','embedding','Embeddings'),('global_embeddings','embedding','Reserva de embeddings'),
 ('radar_decision_default','decision','Radar — decisão geral'),('radar_initial_triage','decision','Radar — triagem inicial'),
 ('radar_next_action','decision','Radar — próximo passo'),('radar_quality_gate','decision','Radar — qualidade'),
 ('radar_deep_research','research','Radar — investigação futura');
INSERT INTO public.llm_use_case_definitions(key,kind,title)
 SELECT profile_key,'chat',COALESCE(name,profile_key) FROM public.yux_strategy_agent_profiles
 WHERE profile_key~'^[a-z][a-z0-9_]{0,199}$' ON CONFLICT(key) DO NOTHING;
INSERT INTO public.llm_use_case_definitions(key,kind,title)
 SELECT DISTINCT ON(agent_type) agent_type,'chat',COALESCE(name,agent_type) FROM public.marketing_agents
 WHERE agent_type~'^[a-z][a-z0-9_]{0,199}$' ORDER BY agent_type,id ON CONFLICT(key) DO NOTHING;
ALTER TABLE public.model_routing_rules
 ADD COLUMN kind TEXT CHECK(kind IN('chat','embedding','decision','research')),
 ADD COLUMN protocol TEXT,ADD COLUMN adapter_version TEXT,
 ADD COLUMN decision_config JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(decision_config)='object'),
 ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991);
UPDATE public.model_routing_rules route SET kind=definition.kind,
 protocol=CASE definition.kind WHEN 'decision' THEN 'openrouter-decisions-alpha-v1' WHEN 'research' THEN 'perplexity-agent-v1' ELSE 'openai-compatible-v1' END,
 adapter_version=CASE definition.kind WHEN 'decision' THEN 'openrouter-decisions-alpha-v1' ELSE 'v1' END
 FROM public.llm_use_case_definitions definition WHERE route.agent_type=definition.key;
UPDATE public.model_routing_rules route SET kind='chat',protocol='openai-compatible-v1',adapter_version='v1'
 WHERE route.agent_type IS NULL AND EXISTS(SELECT 1 FROM public.marketing_agents agent WHERE agent.id=route.agent_id);
-- Unknown saved names stay NULL/pending. Never classify them by a suffix or activate them as chat.
ALTER TABLE public.llm_use_case_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_use_case_definitions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.llm_use_case_definitions FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,INSERT,UPDATE ON public.llm_use_case_definitions TO yux_api;
GRANT SELECT ON public.llm_use_case_definitions TO yux_worker,yux_runtime;
CREATE POLICY llm_definition_admin ON public.llm_use_case_definitions FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY llm_definition_worker ON public.llm_use_case_definitions FOR SELECT TO yux_worker USING(current_setting('app.service_role',true)='worker');
CREATE POLICY llm_definition_runtime ON public.llm_use_case_definitions FOR SELECT TO yux_runtime USING(current_setting('app.service_role',true)='runtime');
-- Existing trusted writers may omit new metadata for a registered case. This
-- classifies by registry/real profile, never by a guessed name or saved route.
CREATE FUNCTION private.classify_llm_route_capability() RETURNS TRIGGER
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE expected TEXT; expected_protocol TEXT;
BEGIN
 SELECT kind INTO expected FROM public.llm_use_case_definitions WHERE key=NEW.agent_type;
 IF expected IS NULL AND (EXISTS(SELECT 1 FROM public.yux_strategy_agent_profiles WHERE profile_key=NEW.agent_type)
  OR EXISTS(SELECT 1 FROM public.marketing_agents WHERE agent_type=NEW.agent_type OR id=NEW.agent_id)) THEN expected:='chat'; END IF;
 IF expected IS NOT NULL THEN
  expected_protocol:=CASE expected WHEN 'decision' THEN 'openrouter-decisions-alpha-v1' WHEN 'research' THEN 'perplexity-agent-v1' ELSE 'openai-compatible-v1' END;
  IF NEW.kind IS NOT NULL AND NEW.kind<>expected OR NEW.protocol IS NOT NULL AND NEW.protocol<>expected_protocol
    OR expected='decision' AND NEW.provider<>'openrouter' THEN RAISE EXCEPTION 'llm_route_capability_incompatible'; END IF;
  NEW.kind:=expected; NEW.protocol:=expected_protocol;
  NEW.adapter_version:=CASE expected WHEN 'decision' THEN 'openrouter-decisions-alpha-v1' ELSE 'v1' END;
 ELSIF NEW.kind IS NOT NULL THEN RAISE EXCEPTION 'llm_use_case_unknown'; END IF;
 IF TG_OP='UPDATE' THEN NEW.version:=OLD.version+1; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.classify_llm_route_capability() FROM PUBLIC,yux_api,yux_worker,yux_runtime;
CREATE TRIGGER classify_llm_route_capability BEFORE INSERT OR UPDATE ON public.model_routing_rules
 FOR EACH ROW EXECUTE FUNCTION private.classify_llm_route_capability();
