-- Landing Pages module: assets, versions, forms, events, change requests, and approvals.

CREATE OR REPLACE FUNCTION private.can_read_landing_page_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'landing_pages'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_landing_page_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_landing_page_contract(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_landing_page_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_landing_page_contract(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_landing_page_organization(UUID) TO authenticated;

CREATE TABLE public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  initial_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  slug TEXT NOT NULL CHECK (BTRIM(slug) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'active', 'paused', 'archived')),
  preview_url TEXT,
  published_url TEXT,
  thumbnail_url TEXT,
  primary_cta_type TEXT NOT NULL DEFAULT 'form' CHECK (primary_cta_type IN ('form', 'whatsapp', 'phone', 'external_url')),
  primary_cta_value TEXT NOT NULL CHECK (BTRIM(primary_cta_value) <> ''),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  pending_approvals INTEGER NOT NULL DEFAULT 0 CHECK (pending_approvals >= 0),
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, slug)
);

CREATE TABLE public.landing_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  preview_url TEXT,
  content_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_snapshot) = 'object'),
  internal_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (landing_page_id, version_number)
);

CREATE TABLE public.landing_page_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  submit_label TEXT NOT NULL DEFAULT 'Enviar',
  success_message TEXT NOT NULL DEFAULT 'Recebemos seus dados.',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.landing_page_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.landing_page_forms(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (BTRIM(field_name) <> ''),
  crm_field_key TEXT NOT NULL CHECK (BTRIM(crm_field_key) <> ''),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, field_name)
);

CREATE TABLE public.landing_page_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'lead', 'cta_click', 'form_submit', 'approval')),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.landing_page_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
  message TEXT NOT NULL CHECK (BTRIM(message) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.landing_page_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.landing_page_versions(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_page_approval_decision CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  )
);

CREATE INDEX idx_landing_pages_organization_status ON public.landing_pages(organization_id, status);
CREATE INDEX idx_landing_pages_client_status ON public.landing_pages(client_id, status);
CREATE INDEX idx_landing_pages_contract_status ON public.landing_pages(contract_id, status);
CREATE INDEX idx_landing_pages_campaign_id ON public.landing_pages(campaign_id);
CREATE INDEX idx_landing_pages_pipeline_id ON public.landing_pages(pipeline_id);
CREATE INDEX idx_landing_page_versions_page ON public.landing_page_versions(landing_page_id, version_number DESC);
CREATE INDEX idx_landing_page_forms_page ON public.landing_page_forms(landing_page_id);
CREATE INDEX idx_landing_page_field_mappings_form ON public.landing_page_field_mappings(form_id);
CREATE INDEX idx_landing_page_events_page_occurred ON public.landing_page_events(landing_page_id, occurred_at DESC);
CREATE INDEX idx_landing_page_change_requests_page ON public.landing_page_change_requests(landing_page_id, status);
CREATE INDEX idx_landing_page_approvals_page ON public.landing_page_approvals(landing_page_id, status);

CREATE TRIGGER update_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_landing_page_versions_updated_at
  BEFORE UPDATE ON public.landing_page_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_landing_page_forms_updated_at
  BEFORE UPDATE ON public.landing_page_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_landing_page_field_mappings_updated_at
  BEFORE UPDATE ON public.landing_page_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_landing_page_change_requests_updated_at
  BEFORE UPDATE ON public.landing_page_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_landing_page_approvals_updated_at
  BEFORE UPDATE ON public.landing_page_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage landing pages" ON public.landing_pages
  FOR ALL USING (private.can_manage_landing_page_organization(organization_id))
  WITH CHECK (private.can_manage_landing_page_organization(organization_id));
CREATE POLICY "Portal users read landing pages" ON public.landing_pages
  FOR SELECT USING (private.can_read_landing_page_contract(contract_id));

CREATE POLICY "Internal users manage landing page versions" ON public.landing_page_versions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)));
CREATE POLICY "Portal users read public landing page versions" ON public.landing_page_versions
  FOR SELECT USING (
    internal_only = FALSE
    AND EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_read_landing_page_contract(lp.contract_id))
  );

CREATE POLICY "Internal users manage landing page forms" ON public.landing_page_forms
  FOR ALL USING (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)));
CREATE POLICY "Portal users read landing page forms" ON public.landing_page_forms
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_read_landing_page_contract(lp.contract_id)));

CREATE POLICY "Internal users manage landing page mappings" ON public.landing_page_field_mappings
  FOR ALL USING (EXISTS (SELECT 1 FROM public.landing_page_forms f JOIN public.landing_pages lp ON lp.id = f.landing_page_id WHERE f.id = form_id AND private.can_manage_landing_page_organization(lp.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.landing_page_forms f JOIN public.landing_pages lp ON lp.id = f.landing_page_id WHERE f.id = form_id AND private.can_manage_landing_page_organization(lp.organization_id)));
CREATE POLICY "Portal users read landing page mappings" ON public.landing_page_field_mappings
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.landing_page_forms f JOIN public.landing_pages lp ON lp.id = f.landing_page_id WHERE f.id = form_id AND private.can_read_landing_page_contract(lp.contract_id)));

CREATE POLICY "Internal users manage landing page events" ON public.landing_page_events
  FOR ALL USING (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)));
CREATE POLICY "Portal users create landing page events" ON public.landing_page_events
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_read_landing_page_contract(lp.contract_id)));

CREATE POLICY "Internal users manage landing page change requests" ON public.landing_page_change_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)));
CREATE POLICY "Portal users create landing page change requests" ON public.landing_page_change_requests
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_read_landing_page_contract(lp.contract_id)));

CREATE POLICY "Internal users manage landing page approvals" ON public.landing_page_approvals
  FOR ALL USING (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_manage_landing_page_organization(lp.organization_id)));
CREATE POLICY "Portal users create landing page approvals" ON public.landing_page_approvals
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.landing_pages lp WHERE lp.id = landing_page_id AND private.can_read_landing_page_contract(lp.contract_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_forms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_field_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_change_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_approvals TO authenticated;

NOTIFY pgrst, 'reload schema';
