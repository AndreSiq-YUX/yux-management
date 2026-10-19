-- Only the runtime may consume an approval; API/worker cannot mint a paid retry.
REVOKE UPDATE ON public.radar_analysis_retry_authorizations FROM yux_runtime;
REVOKE UPDATE(consumed_by_analysis_receipt_id,consumed_at) ON public.radar_analysis_retry_authorizations FROM yux_runtime;
CREATE FUNCTION private.consume_radar_analysis_retry(p_receipt UUID,p_owner UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_receipt public.radar_analysis_receipts%ROWTYPE;
 grant_row public.radar_analysis_retry_authorizations%ROWTYPE;
 prior public.radar_analysis_receipts%ROWTYPE;
 campaign public.radar_campaigns%ROWTYPE;
 policy public.radar_operational_limits%ROWTYPE;
 retry JSONB;expected_route JSONB;actual_route JSONB;actual_count INTEGER;
BEGIN
 SELECT * INTO current_receipt FROM public.radar_analysis_receipts WHERE id=p_receipt AND owner_token=p_owner AND status='reserved' AND lease_until>NOW() FOR UPDATE;
 IF NOT FOUND OR current_setting('app.service_role',TRUE) IS DISTINCT FROM 'runtime' OR NOT private.rls_can_access_organization(current_receipt.organization_id) THEN
  RAISE EXCEPTION 'radar_analysis_retry_scope_invalid';
 END IF;
 retry:=current_receipt.input_request->'retry_authorization';
 SELECT * INTO grant_row FROM public.radar_analysis_retry_authorizations WHERE id=(retry->>'authorization_id')::uuid AND organization_id=current_receipt.organization_id FOR UPDATE;
 IF NOT FOUND OR grant_row.action<>current_receipt.action OR grant_row.candidate_id::text IS DISTINCT FROM retry->>'candidate_id'
  OR grant_row.campaign_id::text IS DISTINCT FROM retry->>'campaign_id' OR grant_row.configuration_revision::text IS DISTINCT FROM retry->>'configuration_revision'
  OR grant_row.policy_hash IS DISTINCT FROM retry->>'policy_hash' OR grant_row.expires_at<=NOW() OR NOT grant_row.acknowledged_previous_charge
  OR NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=grant_row.approved_by AND role='yux_admin' AND is_active=TRUE)
  OR grant_row.consumed_by_analysis_receipt_id IS NOT NULL AND grant_row.consumed_by_analysis_receipt_id<>p_receipt THEN
  RAISE EXCEPTION 'radar_analysis_retry_authorization_invalid';
 END IF;
 SELECT * INTO prior FROM public.radar_analysis_receipts WHERE id=grant_row.previous_analysis_receipt_id AND organization_id=grant_row.organization_id FOR UPDATE;
 IF NOT FOUND OR prior.action<>grant_row.action OR prior.status IN('completed','rejected_before_provider') OR prior.status='reserved' AND prior.lease_until>NOW() THEN
  RAISE EXCEPTION 'radar_analysis_retry_not_required';
 END IF;
 SELECT * INTO campaign FROM public.radar_campaigns WHERE id=grant_row.campaign_id AND organization_id=grant_row.organization_id FOR SHARE;
 IF NOT FOUND OR campaign.configuration_revision<>grant_row.configuration_revision OR campaign.status='paused'
  OR campaign.operational_policy_version::text IS DISTINCT FROM grant_row.policy_snapshot->>'campaignOperationalVersion' THEN
  RAISE EXCEPTION 'radar_analysis_retry_policy_changed';
 END IF;
 SELECT * INTO policy FROM public.radar_operational_limits WHERE singleton=TRUE FOR SHARE;
 IF policy.version::text IS DISTINCT FROM grant_row.policy_snapshot->'operationalPolicy'->>'version'
  OR policy.limits IS DISTINCT FROM grant_row.policy_snapshot->'operationalPolicy'->'limits' THEN RAISE EXCEPTION 'radar_analysis_retry_policy_changed'; END IF;
 -- Verify the whole eligible model set, not just the route selected earlier by
 -- the API. A newly added higher-priority model must require a new approval.
 SELECT COUNT(*) INTO actual_count FROM public.model_routing_rules rule
 WHERE rule.agent_type IN(SELECT item->>'action' FROM jsonb_array_elements(grant_row.policy_snapshot->'routes') item)
  AND rule.status='active' AND rule.routing_tier='default' AND rule.agent_id IS NULL
  AND (rule.organization_id IS NULL OR rule.organization_id=grant_row.organization_id)
  AND (rule.client_id IS NULL OR rule.client_id::text=current_receipt.input_request->>'client_id')
  AND (rule.contract_id IS NULL OR rule.contract_id::text=current_receipt.input_request->>'contract_id');
 IF actual_count<>jsonb_array_length(grant_row.policy_snapshot->'routes') THEN RAISE EXCEPTION 'radar_analysis_retry_policy_changed'; END IF;
 FOR expected_route IN SELECT value FROM jsonb_array_elements(grant_row.policy_snapshot->'routes') LOOP
  SELECT jsonb_strip_nulls(jsonb_build_object('id',rule.id,'version',to_jsonb(rule)->'version','action',rule.agent_type,
   'organizationId',rule.organization_id,'clientId',rule.client_id,'contractId',rule.contract_id,'provider',rule.provider,'model',rule.model_name,
   'fallbackModel',to_jsonb(rule)->'fallback_model_name','fallbacks',COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',value->'provider','modelName',COALESCE(value->'modelName',value->'model_name'))) FROM jsonb_array_elements(COALESCE(rule.fallback_routes,'[]'::jsonb))), '[]'::jsonb),
   'maxInputTokens',to_jsonb(rule)->'max_input_tokens','maxOutputTokens',to_jsonb(rule)->'max_output_tokens','maxCostPerRun',to_jsonb(rule)->'max_cost_per_run','temperature',to_jsonb(rule)->'temperature'))
  INTO actual_route FROM public.model_routing_rules rule WHERE rule.id::text=expected_route->>'id' AND rule.status='active' FOR SHARE;
  IF actual_route IS DISTINCT FROM jsonb_strip_nulls(expected_route) THEN RAISE EXCEPTION 'radar_analysis_retry_policy_changed'; END IF;
 END LOOP;
 UPDATE public.radar_analysis_retry_authorizations SET consumed_by_analysis_receipt_id=p_receipt,consumed_at=COALESCE(consumed_at,NOW()) WHERE id=grant_row.id;
END $$;
REVOKE ALL ON FUNCTION private.consume_radar_analysis_retry(UUID,UUID) FROM PUBLIC,yux_api,yux_worker;
GRANT EXECUTE ON FUNCTION private.consume_radar_analysis_retry(UUID,UUID) TO yux_runtime;
