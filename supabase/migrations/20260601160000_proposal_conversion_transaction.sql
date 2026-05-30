-- Idempotent proposal approval conversion into operational delivery records.

CREATE OR REPLACE FUNCTION private.convert_approved_proposal(target_proposal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_proposal public.proposals%ROWTYPE;
  target_version public.proposal_versions%ROWTYPE;
  target_lead public.leads%ROWTYPE;
  target_client_id UUID;
  target_contract_id UUID;
  target_project_id UUID;
  target_package_id UUID;
  target_blueprint_id UUID;
  target_modules JSONB;
  target_phases JSONB;
  target_phase JSONB;
  target_task JSONB;
  target_phase_id UUID;
  target_attempt INTEGER;
BEGIN
  SELECT * INTO target_proposal
  FROM public.proposals
  WHERE id = target_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  IF target_proposal.contract_id IS NOT NULL AND target_proposal.project_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'clientId', target_proposal.converted_client_id,
      'contractId', target_proposal.contract_id,
      'projectId', target_proposal.project_id,
      'duplicate', true
    );
  END IF;

  IF target_proposal.status <> 'approved' OR target_proposal.current_version_id IS NULL THEN
    RAISE EXCEPTION 'Proposal is not approved';
  END IF;

  SELECT * INTO target_version
  FROM public.proposal_versions
  WHERE id = target_proposal.current_version_id
    AND proposal_id = target_proposal.id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved proposal version not found';
  END IF;

  SELECT * INTO target_lead FROM public.leads WHERE id = target_proposal.lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal lead not found';
  END IF;

  target_package_id := (target_version.snapshot->>'package_id')::UUID;
  target_blueprint_id := NULLIF(target_version.snapshot->>'blueprint_id', '')::UUID;
  target_modules := COALESCE(target_version.snapshot->'selected_module_keys', '[]'::jsonb);

  target_client_id := COALESCE(target_proposal.client_id, target_lead.converted_to_client_id);
  IF target_client_id IS NULL THEN
    INSERT INTO public.clients (
      company_name, contact_name, email, phone, sector, size, lead_source, status, notes, assigned_to
    )
    VALUES (
      COALESCE(NULLIF(target_lead.company, ''), target_lead.name),
      target_lead.name,
      target_lead.email,
      target_lead.phone,
      'Nao informado',
      'small',
      target_lead.source,
      'active',
      'Cliente criado automaticamente pela aprovacao da proposta ' || target_proposal.id,
      target_lead.assigned_to
    )
    RETURNING id INTO target_client_id;
  END IF;

  UPDATE public.leads
  SET converted_to_client_id = target_client_id,
      client_id = COALESCE(client_id, target_client_id),
      stage = 'WON',
      updated_at = NOW()
  WHERE id = target_lead.id;

  INSERT INTO public.contracts (
    client_id, package_id, name, status, starts_at, value, billing_cycle, notes, proposal_id, proposal_version_id
  )
  VALUES (
    target_client_id,
    target_package_id,
    'Contrato - ' || target_proposal.title,
    'active',
    CURRENT_DATE,
    (target_version.snapshot->>'final_value')::DECIMAL,
    COALESCE(target_version.snapshot->>'billing_cycle', 'monthly'),
    'Contrato criado automaticamente a partir da proposta aprovada.',
    target_proposal.id,
    target_version.id
  )
  RETURNING id INTO target_contract_id;

  IF jsonb_array_length(target_modules) > 0 THEN
    INSERT INTO public.contract_modules (contract_id, module_key, enabled)
    SELECT target_contract_id, module_key, true
    FROM jsonb_array_elements_text(target_modules) AS module_key;
  ELSE
    INSERT INTO public.contract_modules (contract_id, module_key, enabled)
    SELECT target_contract_id, module_key, true
    FROM public.package_modules
    WHERE package_id = target_package_id;
  END IF;

  INSERT INTO public.projects (
    name, description, client_id, status, priority, type, start_date, expected_end_date,
    budget, currency, notes, proposal_id, proposal_version_id
  )
  VALUES (
    target_proposal.title,
    target_version.snapshot->>'scope',
    target_client_id,
    'PLANNING',
    'MEDIUM',
    'OTHER',
    CURRENT_DATE,
    CURRENT_DATE + 30,
    (target_version.snapshot->>'final_value')::DECIMAL,
    'BRL',
    'Projeto criado automaticamente pela aprovacao comercial.',
    target_proposal.id,
    target_version.id
  )
  RETURNING id INTO target_project_id;

  IF target_blueprint_id IS NOT NULL THEN
    SELECT phases INTO target_phases
    FROM public.blueprint_project_presets
    WHERE blueprint_id = target_blueprint_id;
  END IF;

  IF target_phases IS NULL OR jsonb_array_length(target_phases) = 0 THEN
    SELECT phases INTO target_phases
    FROM public.package_project_presets
    WHERE package_id = target_package_id;
  END IF;

  FOR target_phase IN SELECT * FROM jsonb_array_elements(COALESCE(target_phases, '[]'::jsonb))
  LOOP
    INSERT INTO public.project_phases (project_id, name, description, order_index)
    VALUES (
      target_project_id,
      target_phase->>'name',
      target_phase->>'description',
      COALESCE((target_phase->>'orderIndex')::INTEGER, 0)
    )
    RETURNING id INTO target_phase_id;

    FOR target_task IN SELECT * FROM jsonb_array_elements(COALESCE(target_phase->'tasks', '[]'::jsonb))
    LOOP
      INSERT INTO public.project_tasks (project_id, phase_id, title, description, priority, order_index)
      VALUES (
        target_project_id,
        target_phase_id,
        target_task->>'title',
        target_task->>'description',
        COALESCE(target_task->>'priority', 'medium'),
        COALESCE((target_task->>'orderIndex')::INTEGER, 0)
      );
    END LOOP;
  END LOOP;

  UPDATE public.proposals
  SET status = 'converted',
      client_id = target_client_id,
      converted_client_id = target_client_id,
      contract_id = target_contract_id,
      project_id = target_project_id,
      updated_at = NOW()
  WHERE id = target_proposal.id;

  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO target_attempt
  FROM public.proposal_conversion_runs
  WHERE proposal_id = target_proposal.id;

  INSERT INTO public.proposal_conversion_runs (
    proposal_id, attempt_number, status, client_id, contract_id, project_id, completed_at
  )
  VALUES (
    target_proposal.id, target_attempt, 'completed', target_client_id, target_contract_id, target_project_id, NOW()
  );

  INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
  VALUES (
    target_proposal.organization_id,
    target_lead.id,
    'note',
    'Proposta aprovada e convertida',
    'Cliente, contrato e projeto criados automaticamente.',
    NOW()
  );

  RETURN jsonb_build_object(
    'clientId', target_client_id,
    'contractId', target_contract_id,
    'projectId', target_project_id,
    'duplicate', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_approved_proposal_service(target_proposal_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.convert_approved_proposal(target_proposal_id);
$$;

REVOKE ALL ON FUNCTION private.convert_approved_proposal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.convert_approved_proposal(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.convert_approved_proposal_service(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_approved_proposal_service(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.convert_approved_proposal_service(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.convert_approved_proposal(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_approved_proposal_service(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
