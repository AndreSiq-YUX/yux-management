// Organization is always the caller's $1 bind parameter. An account-specific
// email setting supersedes the legacy channel row, including its revocation.
// Central platform credentials alone never make an account connection active.
export const ACTIVE_MISSION_CHANNELS_SQL = `
  SELECT channel FROM public.channel_connections
  WHERE organization_id = $1 AND is_active = TRUE
    AND (channel <> 'email' OR NOT EXISTS (
      SELECT 1 FROM public.email_provider_connections own_email
      WHERE own_email.organization_id = $1 AND own_email.provider = 'smtp2go'
    ))
  UNION
  SELECT 'email' AS channel FROM public.email_provider_connections
  WHERE organization_id = $1 AND provider = 'smtp2go' AND status = 'connected'
`
