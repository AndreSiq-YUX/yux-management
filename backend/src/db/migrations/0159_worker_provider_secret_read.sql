-- Provider dispatchers need the encrypted credential row, but only while the
-- worker is scoped to the owning organization. Mutation remains admin-only.

DROP POLICY IF EXISTS provider_integration_secrets_worker_read
  ON public.provider_integration_secrets;

CREATE POLICY provider_integration_secrets_worker_read
  ON public.provider_integration_secrets
  FOR SELECT
  TO yux_worker
  USING (
    current_setting('app.service_role', true) = 'worker'
    AND private.rls_can_access_organization(organization_id)
  );
