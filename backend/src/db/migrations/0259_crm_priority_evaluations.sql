CREATE TABLE public.crm_priority_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL, organization_id UUID NOT NULL, version_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  baseline_cursor UUID, baseline_completed_at TIMESTAMPTZ,
  UNIQUE (id,crm_instance_id,organization_id),
  UNIQUE (id,crm_instance_id,organization_id,version_id),
  FOREIGN KEY (crm_instance_id,organization_id,version_id)
    REFERENCES public.crm_priority_versions(crm_instance_id,organization_id,id) ON DELETE CASCADE
);
ALTER TABLE public.crm_priority_configs ADD COLUMN active_activation_id UUID,
  ADD FOREIGN KEY (active_activation_id,crm_instance_id,organization_id,active_version_id)
    REFERENCES public.crm_priority_activations(id,crm_instance_id,organization_id,version_id),
  ADD CHECK ((active_activation_id IS NULL)=(active_version_id IS NULL));
CREATE INDEX crm_priority_active_activation ON public.crm_priority_configs(active_activation_id) WHERE active_activation_id IS NOT NULL;
ALTER TABLE public.crm_priority_preview_runs ADD COLUMN publishable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE public.crm_priority_commands (
  crm_instance_id UUID NOT NULL, organization_id UUID NOT NULL, request_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.users(id), payload_hash TEXT NOT NULL, result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (crm_instance_id,request_id),
  FOREIGN KEY (crm_instance_id,organization_id)
    REFERENCES public.crm_priority_configs(crm_instance_id,organization_id) ON DELETE CASCADE
);

CREATE TABLE public.crm_priority_work (
  lead_id UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL, organization_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (crm_instance_id,organization_id)
    REFERENCES public.crm_priority_configs(crm_instance_id,organization_id) ON DELETE CASCADE
);
CREATE INDEX crm_priority_work_order ON public.crm_priority_work(crm_instance_id,requested_at,lead_id);

CREATE TABLE public.crm_priority_evaluations (
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL, organization_id UUID NOT NULL, activation_id UUID NOT NULL,
  result JSONB NOT NULL CHECK(jsonb_typeof(result)='object'),
  calculated_at TIMESTAMPTZ NOT NULL, next_evaluation_at TIMESTAMPTZ,
  PRIMARY KEY (lead_id,activation_id),
  FOREIGN KEY (activation_id,crm_instance_id,organization_id)
    REFERENCES public.crm_priority_activations(id,crm_instance_id,organization_id) ON DELETE CASCADE
);
CREATE INDEX crm_priority_due ON public.crm_priority_evaluations(activation_id,next_evaluation_at,lead_id) WHERE next_evaluation_at IS NOT NULL;
CREATE INDEX crm_priority_evaluations_activation ON public.crm_priority_evaluations(activation_id);

CREATE TABLE public.crm_priority_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL, organization_id UUID NOT NULL, activation_id UUID NOT NULL,
  cause TEXT NOT NULL CHECK(cause IN ('baseline','change','time')),
  occurred_at TIMESTAMPTZ NOT NULL,
  before_summary JSONB, after_summary JSONB NOT NULL,
  FOREIGN KEY (activation_id,crm_instance_id,organization_id)
    REFERENCES public.crm_priority_activations(id,crm_instance_id,organization_id) ON DELETE CASCADE
);
CREATE INDEX crm_priority_transition_history ON public.crm_priority_transitions(lead_id,occurred_at DESC,id DESC);
CREATE INDEX crm_priority_transition_activation ON public.crm_priority_transitions(activation_id);
CREATE INDEX crm_priority_baseline ON public.crm_priority_activations(created_at,id) WHERE baseline_completed_at IS NULL;

DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['crm_priority_activations','crm_priority_commands','crm_priority_work','crm_priority_evaluations','crm_priority_transitions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',target);
    EXECUTE format('REVOKE ALL ON public.%I FROM yux_api,yux_worker',target);
    EXECUTE format('CREATE POLICY priority_scope ON public.%I TO yux_api,yux_worker USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',target);
  END LOOP;
END $$;

GRANT SELECT(crm_instance_id,organization_id,active_activation_id) ON public.crm_priority_configs TO yux_worker;
GRANT SELECT ON public.crm_priority_versions TO yux_worker;
CREATE POLICY priority_worker_read ON public.crm_priority_configs FOR SELECT TO yux_worker USING(private.rls_can_access_organization(organization_id));
CREATE POLICY priority_worker_versions ON public.crm_priority_versions FOR SELECT TO yux_worker USING(private.rls_can_access_organization(organization_id));
GRANT UPDATE(active_version_id,active_activation_id) ON public.crm_priority_configs TO yux_api;
GRANT INSERT(publishable) ON public.crm_priority_preview_runs TO yux_api;
GRANT INSERT ON public.crm_priority_versions TO yux_api;
GRANT SELECT,INSERT ON public.crm_priority_activations,public.crm_priority_commands TO yux_api;
GRANT SELECT ON public.crm_priority_evaluations,public.crm_priority_transitions TO yux_api;
GRANT SELECT,INSERT,UPDATE ON public.crm_priority_work TO yux_api,yux_worker;
GRANT DELETE ON public.crm_priority_work TO yux_worker;
GRANT SELECT ON public.crm_priority_activations TO yux_worker;
GRANT UPDATE(baseline_cursor,baseline_completed_at,refreshed_at) ON public.crm_priority_activations TO yux_worker,yux_api;
GRANT SELECT,INSERT,UPDATE ON public.crm_priority_evaluations TO yux_worker;
GRANT INSERT ON public.crm_priority_transitions TO yux_worker;

-- All profile mutation paths share these invalidation hooks, including Radar and restored leads.
CREATE FUNCTION private.mark_crm_priority_dirty(target_lead UUID) RETURNS void
LANGUAGE sql SET search_path='' AS $$
  INSERT INTO public.crm_priority_work(lead_id,organization_id,crm_instance_id)
  SELECT l.id,l.organization_id,c.crm_instance_id
  FROM public.leads l JOIN public.crm_pipelines p ON p.id=l.pipeline_id AND p.organization_id=l.organization_id
  JOIN public.crm_priority_configs c ON c.crm_instance_id=COALESCE(l.crm_instance_id,p.crm_instance_id)
    AND c.organization_id=l.organization_id
  WHERE l.id=target_lead AND (l.crm_instance_id IS NULL OR p.crm_instance_id IS NULL OR l.crm_instance_id=p.crm_instance_id)
  ON CONFLICT(lead_id) DO UPDATE SET requested_at=clock_timestamp(),
    organization_id=EXCLUDED.organization_id,crm_instance_id=EXCLUDED.crm_instance_id;
$$;
REVOKE ALL ON FUNCTION private.mark_crm_priority_dirty(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.mark_crm_priority_dirty(UUID) TO yux_api,yux_worker;

CREATE FUNCTION private.crm_priority_lead_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM private.mark_crm_priority_dirty(NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER crm_priority_lead_changed
AFTER INSERT OR UPDATE OF company,source,value,stage_id,city,state,status,record_type_id,deleted_at,pipeline_id,crm_instance_id
ON public.leads FOR EACH ROW EXECUTE FUNCTION private.crm_priority_lead_changed();

CREATE FUNCTION private.crm_priority_fact_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM private.mark_crm_priority_dirty(COALESCE(NEW.lead_id,OLD.lead_id));
  RETURN NULL;
END $$;
CREATE TRIGGER crm_priority_custom_value_changed AFTER INSERT OR UPDATE OR DELETE
ON public.lead_custom_field_values FOR EACH ROW EXECUTE FUNCTION private.crm_priority_fact_changed();
CREATE TRIGGER crm_priority_signal_changed AFTER INSERT OR UPDATE OF revoked_at
ON public.crm_priority_signals FOR EACH ROW EXECUTE FUNCTION private.crm_priority_fact_changed();

CREATE FUNCTION private.crm_priority_catalog_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  UPDATE public.crm_priority_activations a
  SET baseline_cursor=NULL,baseline_completed_at=NULL,refreshed_at=clock_timestamp()
  FROM public.crm_priority_configs c
  WHERE c.crm_instance_id=NEW.crm_instance_id AND a.id=c.active_activation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_priority_catalog_changed AFTER INSERT OR UPDATE OF is_active
ON public.crm_custom_field_definitions FOR EACH ROW EXECUTE FUNCTION private.crm_priority_catalog_changed();

CREATE INDEX radar_priority_converted_lead ON public.radar_opportunities(organization_id,converted_lead_id)
WHERE converted_lead_id IS NOT NULL;

CREATE FUNCTION private.crm_priority_radar_opt_out_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE opportunity UUID;
BEGIN
  IF TG_TABLE_NAME='radar_opportunities' THEN
    opportunity := NEW.id;
  ELSE
    opportunity := NEW.opportunity_id;
  END IF;
  PERFORM private.mark_crm_priority_dirty(link.lead_id) FROM (
    SELECT o.converted_lead_id AS lead_id FROM public.radar_opportunities o
    WHERE o.id=opportunity AND o.organization_id=NEW.organization_id
    UNION
    SELECT c.crm_lead_id FROM public.radar_candidate_records c
    WHERE c.imported_opportunity_id=opportunity AND c.organization_id=NEW.organization_id
  ) link WHERE link.lead_id IS NOT NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_priority_radar_opt_out_changed AFTER INSERT OR UPDATE OF opt_out
ON public.radar_compliance_logs FOR EACH ROW EXECUTE FUNCTION private.crm_priority_radar_opt_out_changed();
CREATE TRIGGER crm_priority_radar_opt_out_status AFTER UPDATE OF status
ON public.radar_opportunities FOR EACH ROW
WHEN ((OLD.status='opted_out') IS DISTINCT FROM (NEW.status='opted_out'))
EXECUTE FUNCTION private.crm_priority_radar_opt_out_changed();
