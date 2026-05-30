UPDATE public.platform_modules
SET portal_route = '/portal/proposals',
    updated_at = NOW()
WHERE key = 'proposals';

UPDATE public.contract_modules
SET enabled = true,
    updated_at = NOW()
WHERE contract_id = '660e8400-e29b-41d4-a716-446655440001'
  AND module_key = 'proposals';

NOTIFY pgrst, 'reload schema';
