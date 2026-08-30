INSERT INTO public.platform_modules (key,name,base,internal_route,portal_route,required_permissions)
VALUES (
  'funnel_nurture_agent',
  'Agente de Funil + Nutrição',
  FALSE,
  '/missions',
  '/portal/missoes',
  ARRAY['action_engine.read']::TEXT[]
)
ON CONFLICT (key) DO UPDATE SET
  name=EXCLUDED.name,
  internal_route=EXCLUDED.internal_route,
  portal_route=EXCLUDED.portal_route,
  required_permissions=EXCLUDED.required_permissions,
  updated_at=NOW();

-- The contract flag is deliberately not enabled for existing contracts. A
-- rollout is an explicit commercial/operational decision. Publication remains
-- independently controlled by the four capability policies seeded in 0138.
