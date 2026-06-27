-- Probe Growth Workspace foundation with insert/select/update/delete.

DO $$
DECLARE
  v_org_id UUID;
  v_contract_id UUID;
  v_plan_id UUID;
  v_segment_id UUID;
  v_checklist_id UUID;
BEGIN
  SELECT id INTO v_org_id
  FROM public.organizations
  ORDER BY created_at
  LIMIT 1;

  SELECT id INTO v_contract_id
  FROM public.contracts
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organization found; skipping growth workspace probe.';
    RETURN;
  END IF;

  INSERT INTO public.growth_campaign_plans (
    organization_id,
    contract_id,
    name,
    objective,
    status
  ) VALUES (
    v_org_id,
    v_contract_id,
    'Probe Campanha 360',
    'lead_generation',
    'planning'
  )
  RETURNING id INTO v_plan_id;

  INSERT INTO public.growth_campaign_plan_steps (
    plan_id,
    step_key,
    label,
    module_key,
    status,
    sort_order
  ) VALUES (
    v_plan_id,
    'segment',
    'Publico e segmento',
    'crm',
    'not_started',
    1
  );

  UPDATE public.growth_campaign_plan_steps
  SET status = 'completed',
      completed_at = NOW()
  WHERE plan_id = v_plan_id
    AND step_key = 'segment';

  INSERT INTO public.growth_smart_segments (
    organization_id,
    contract_id,
    name,
    description,
    filters,
    estimated_size,
    status
  ) VALUES (
    v_org_id,
    v_contract_id,
    'Probe segmento inteligente',
    'Segmento criado pelo probe',
    '{"source":"meta","stage":"open"}'::jsonb,
    42,
    'draft'
  )
  RETURNING id INTO v_segment_id;

  INSERT INTO public.growth_onboarding_checklists (
    organization_id,
    contract_id,
    status
  ) VALUES (
    v_org_id,
    v_contract_id,
    'active'
  )
  RETURNING id INTO v_checklist_id;

  INSERT INTO public.growth_onboarding_steps (
    checklist_id,
    step_key,
    label,
    module_key,
    status,
    estimated_minutes,
    sort_order
  ) VALUES (
    v_checklist_id,
    'campaign_plan',
    'Criar plano de campanha',
    'campaigns',
    'not_started',
    20,
    1
  );

  PERFORM 1 FROM public.growth_campaign_plans WHERE id = v_plan_id;
  PERFORM 1 FROM public.growth_smart_segments WHERE id = v_segment_id;
  PERFORM 1 FROM public.growth_onboarding_checklists WHERE id = v_checklist_id;

  DELETE FROM public.growth_onboarding_checklists WHERE id = v_checklist_id;
  DELETE FROM public.growth_smart_segments WHERE id = v_segment_id;
  DELETE FROM public.growth_campaign_plans WHERE id = v_plan_id;

  RAISE NOTICE 'Growth workspace foundation probe completed.';
END $$;
