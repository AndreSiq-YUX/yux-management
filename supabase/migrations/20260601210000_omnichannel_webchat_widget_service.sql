CREATE OR REPLACE FUNCTION public.resolve_webchat_widget_service(
  candidate_token_hash TEXT,
  request_origin TEXT
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  name TEXT,
  is_active BOOLEAN,
  allowed_origins TEXT[],
  branding JSONB,
  consent_text TEXT,
  initial_form JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    w.id,
    w.organization_id,
    w.name,
    w.is_active,
    w.allowed_origins,
    w.branding,
    w.consent_text,
    w.initial_form
  FROM private.webchat_widget_tokens wt
  JOIN public.webchat_widgets w ON w.id = wt.widget_id
  WHERE wt.public_token_hash = candidate_token_hash
    AND w.is_active
    AND private.is_allowed_widget_origin(w.id, request_origin)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_webchat_widget_service(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_webchat_widget_service(TEXT, TEXT) TO service_role;
