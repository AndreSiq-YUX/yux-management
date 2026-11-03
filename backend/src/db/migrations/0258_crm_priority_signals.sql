CREATE TABLE public.crm_priority_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  crm_instance_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('buyer_reply','quote_requested','meeting_booked','meeting_completed','purchase_window','not_interested','task_completed','stage_changed')),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','call','meeting','crm')),
  actor TEXT NOT NULL CHECK (actor IN ('buyer','operator','system')),
  occurred_at TIMESTAMPTZ NOT NULL,
  target_date DATE,
  created_by UUID REFERENCES public.users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id),
  revoke_reason TEXT,
  UNIQUE (lead_id,source_key),
  FOREIGN KEY (crm_instance_id,organization_id) REFERENCES public.crm_instances(id,organization_id) ON DELETE CASCADE,
  CHECK ((kind='purchase_window')=(target_date IS NOT NULL))
);
CREATE INDEX crm_priority_signals_history ON public.crm_priority_signals (lead_id, occurred_at DESC, id);

CREATE TABLE public.crm_priority_signal_requests (
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  request_id UUID NOT NULL,
  payload_hash TEXT NOT NULL,
  result JSONB NOT NULL,
  PRIMARY KEY (lead_id,request_id)
);

CREATE FUNCTION private.guard_crm_priority_signal_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.leads l JOIN public.crm_pipelines p ON p.id=l.pipeline_id AND p.organization_id=l.organization_id
    WHERE l.id=NEW.lead_id AND l.organization_id=NEW.organization_id
      AND COALESCE(l.crm_instance_id,p.crm_instance_id)=NEW.crm_instance_id
      AND (l.crm_instance_id IS NULL OR p.crm_instance_id IS NULL OR l.crm_instance_id=p.crm_instance_id)
  ) THEN RAISE EXCEPTION 'Invalid priority signal lead scope'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_priority_signal_scope BEFORE INSERT OR UPDATE ON public.crm_priority_signals
FOR EACH ROW EXECUTE FUNCTION private.guard_crm_priority_signal_scope();

DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['crm_priority_signals','crm_priority_signal_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',target);
    EXECUTE format('REVOKE ALL ON public.%I FROM yux_api,yux_worker',target);
    EXECUTE format('CREATE POLICY priority_signal_scope ON public.%I TO yux_api,yux_worker USING (private.rls_can_access_organization(organization_id)) WITH CHECK (private.rls_can_access_organization(organization_id))',target);
  END LOOP;
END $$;
GRANT SELECT,INSERT ON public.crm_priority_signals TO yux_api,yux_worker;
GRANT UPDATE (revoked_at,revoked_by,revoke_reason) ON public.crm_priority_signals TO yux_api;
GRANT SELECT,INSERT ON public.crm_priority_signal_requests TO yux_api;
