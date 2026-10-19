-- Claim and consume in one transaction with campaign -> receipt lock order,
-- matching administrative authorization. No external effect happens here.
CREATE FUNCTION private.claim_radar_retry_receipt(p_org UUID,p_action TEXT,p_request TEXT,p_hash TEXT,p_owner UUID,p_input JSONB)
RETURNS TABLE(receipt JSONB,claimed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result public.radar_analysis_receipts%ROWTYPE;
BEGIN
 IF current_setting('app.service_role',TRUE) IS DISTINCT FROM 'runtime' OR NOT private.rls_can_access_organization(p_org) THEN RAISE EXCEPTION 'radar_analysis_retry_scope_invalid'; END IF;
 PERFORM id FROM public.radar_campaigns WHERE id=(p_input->'retry_authorization'->>'campaign_id')::uuid AND organization_id=p_org FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'radar_analysis_retry_scope_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('radar-receipt:'||p_org::text||':'||p_action||':'||p_request));
 SELECT * INTO result FROM public.radar_analysis_receipts WHERE organization_id=p_org AND action=p_action AND request_id=p_request FOR UPDATE;
 IF FOUND AND (result.input_hash<>p_hash OR result.status<>'rejected_before_provider') THEN
  RETURN QUERY SELECT to_jsonb(result),FALSE;RETURN;
 END IF;
 IF result.id IS NULL THEN
  INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status,input_request,lease_until)
   VALUES(p_org,p_action,p_request,p_hash,p_owner,'reserved',p_input,NOW()+INTERVAL '6 minutes') RETURNING * INTO result;
 ELSE
  UPDATE public.radar_analysis_receipts SET status='reserved',owner_token=p_owner,input_request=COALESCE(input_request,p_input),lease_until=NOW()+INTERVAL '6 minutes',updated_at=NOW() WHERE id=result.id RETURNING * INTO result;
 END IF;
 PERFORM private.consume_radar_analysis_retry(result.id,p_owner);
 RETURN QUERY SELECT to_jsonb(result),TRUE;
END $$;
REVOKE ALL ON FUNCTION private.claim_radar_retry_receipt(UUID,TEXT,TEXT,TEXT,UUID,JSONB) FROM PUBLIC,yux_api,yux_worker;
GRANT EXECUTE ON FUNCTION private.claim_radar_retry_receipt(UUID,TEXT,TEXT,TEXT,UUID,JSONB) TO yux_runtime;
