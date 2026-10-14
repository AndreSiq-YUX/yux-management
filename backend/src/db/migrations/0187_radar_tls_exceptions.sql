-- No provider/model is enabled, and no TLS exception is granted by this migration.
ALTER TABLE public.radar_candidate_research_runs ADD CONSTRAINT radar_research_tls_scope_unique
  UNIQUE (id,organization_id,candidate_id,configuration_revision);
CREATE TABLE public.radar_site_tls_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.radar_candidate_records(id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  configuration_revision INTEGER NOT NULL CHECK (configuration_revision>0),
  hostname TEXT NOT NULL CHECK (hostname=LOWER(hostname) AND hostname ~ '^[a-z0-9.-]{1,253}$'),
  fingerprint256 TEXT NOT NULL CHECK (fingerprint256 ~ '^([A-F0-9]{2}:){31}[A-F0-9]{2}$'),
  certificate_valid_to TIMESTAMPTZ NOT NULL,
  approved_by UUID NOT NULL REFERENCES public.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '1 hour',
  revoked_at TIMESTAMPTZ,revoked_by UUID REFERENCES public.users(id),
  FOREIGN KEY(run_id,organization_id,candidate_id,configuration_revision)
    REFERENCES public.radar_candidate_research_runs(id,organization_id,candidate_id,configuration_revision) ON DELETE CASCADE,
  CHECK(expires_at>approved_at AND expires_at<=approved_at+INTERVAL '1 hour'),
  CHECK((revoked_at IS NULL)=(revoked_by IS NULL))
);
CREATE INDEX radar_tls_scope_idx ON public.radar_site_tls_exceptions(organization_id,run_id,hostname,expires_at);
CREATE INDEX radar_tls_candidate_idx ON public.radar_site_tls_exceptions(candidate_id);
CREATE INDEX radar_tls_author_idx ON public.radar_site_tls_exceptions(approved_by);
ALTER TABLE public.radar_site_tls_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_site_tls_exceptions FORCE ROW LEVEL SECURITY;
-- Override the schema's default broad service grants: audit rows are immutable except revocation.
REVOKE ALL ON public.radar_site_tls_exceptions FROM PUBLIC,yux_api,yux_worker;
GRANT SELECT,INSERT ON public.radar_site_tls_exceptions TO yux_api,yux_worker;
GRANT UPDATE(revoked_at,revoked_by) ON public.radar_site_tls_exceptions TO yux_api,yux_worker;
CREATE POLICY yux_service_tenant_access ON public.radar_site_tls_exceptions FOR ALL TO yux_api,yux_worker
  USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY yux_tenant_scope ON public.radar_site_tls_exceptions AS RESTRICTIVE FOR ALL
  USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
