-- Marketing Studio Phase 7: WordPress controlled publishing.

CREATE TABLE public.publishing_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'wordpress' CHECK (provider IN ('wordpress')),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'needs_setup'
    CHECK (status IN ('needs_setup','connected','stale','needs_reauth','failed','disabled')),
  site_url TEXT NOT NULL CHECK (BTRIM(site_url) <> ''),
  username TEXT,
  auth_type TEXT NOT NULL DEFAULT 'application_password'
    CHECK (auth_type IN ('application_password','token_reference')),
  token_reference TEXT,
  provider_account_id TEXT,
  last_verified_at TIMESTAMPTZ,
  protected_error TEXT,
  public_config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(public_config) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, provider, name)
);

CREATE TABLE public.publishing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.publishing_connections(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  calendar_item_id UUID REFERENCES public.editorial_calendar_items(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create_draft','update_draft','publish')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  provider_post_id TEXT,
  published_url TEXT,
  idempotency_key TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_payload) = 'object'),
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(response_payload) = 'object'),
  protected_error TEXT,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, idempotency_key)
);

CREATE INDEX idx_publishing_connections_contract_status ON public.publishing_connections(contract_id, provider, status);
CREATE INDEX idx_publishing_runs_contract_status ON public.publishing_runs(contract_id, status, created_at DESC);
CREATE INDEX idx_publishing_runs_content_action ON public.publishing_runs(content_item_id, action, status);

CREATE TRIGGER update_publishing_connections_updated_at BEFORE UPDATE ON public.publishing_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_publishing_runs_updated_at BEFORE UPDATE ON public.publishing_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.publishing_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing users read publishing connections" ON public.publishing_connections
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));

CREATE POLICY "Marketing configurators manage publishing connections" ON public.publishing_connections
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing users read publishing runs" ON public.publishing_runs
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));

CREATE POLICY "Marketing writers create publishing runs" ON public.publishing_runs
  FOR INSERT TO authenticated WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));

CREATE POLICY "Marketing supervisors update publishing runs" ON public.publishing_runs
  FOR UPDATE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

REVOKE ALL ON public.publishing_connections FROM anon;
REVOKE ALL ON public.publishing_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_connections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_runs TO authenticated, service_role;

UPDATE public.marketing_agent_templates
SET default_tools = ARRAY['create_task','create_wordpress_draft','publish_wordpress']::TEXT[]
WHERE agent_type = 'controlled_publisher';

NOTIFY pgrst, 'reload schema';
