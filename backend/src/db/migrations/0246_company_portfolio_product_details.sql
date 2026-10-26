-- Preserve existing product guidance while adding relevant portfolio retrieval.
CREATE OR REPLACE FUNCTION private.get_company_portfolio_context_v1(
 target_organization_id uuid,target_contract_id uuid,target_profile_key text,target_audience text,target_query text,
 target_represented_business_ids uuid[],target_offset integer,target_limit integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;items jsonb;brands jsonb;total integer;terms tsquery;
BEGIN
 IF target_organization_id IS NULL OR NOT private.rls_can_access_organization(target_organization_id) THEN RAISE EXCEPTION 'company_portfolio_scope_forbidden' USING ERRCODE='42501';END IF;
 IF target_audience NOT IN ('internal_operator','client_user','external_contact') OR target_profile_key IS NULL OR btrim(target_profile_key)='' OR target_query IS NULL OR length(target_query)>10000 OR target_offset NOT BETWEEN 0 AND 100000 OR target_limit NOT BETWEEN 1 AND 100 OR COALESCE(cardinality(target_represented_business_ids),0)>100 THEN RAISE EXCEPTION 'invalid_company_portfolio_context' USING ERRCODE='22023';END IF;
 IF target_contract_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contracts contract JOIN public.organizations org ON org.client_id=contract.client_id WHERE org.id=target_organization_id AND contract.id=target_contract_id) THEN RAISE EXCEPTION 'company_portfolio_contract_scope_forbidden' USING ERRCODE='42501';END IF;
 IF current_setting('app.service_role',true)='runtime' AND (
  NOT target_organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[])
  OR NULLIF(current_setting('app.current_contract_id',true),'')::uuid IS DISTINCT FROM target_contract_id
  OR current_setting('app.current_profile_key',true) IS DISTINCT FROM target_profile_key
  OR current_setting('app.current_audience',true) IS DISTINCT FROM target_audience
 ) THEN RAISE EXCEPTION 'company_portfolio_runtime_scope_mismatch' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM unnest(target_represented_business_ids) requested(id) WHERE NOT EXISTS(SELECT 1 FROM public.company_represented_businesses WHERE organization_id=target_organization_id AND id=requested.id)) THEN RAISE EXCEPTION 'company_portfolio_selection_scope_forbidden' USING ERRCODE='42501';END IF;
 terms=websearch_to_tsquery('portuguese',target_query);
 WITH eligible AS (
  SELECT product.*,brand.name AS brand_name,brand.authorized_lines,brand.service_regions AS brand_regions,
   ts_rank_cd(to_tsvector('portuguese',concat_ws(' ',product.name,product.category,product.description,product.metadata->>'sku',brand.name)),terms) AS relevance
  FROM public.marketing_products_services product LEFT JOIN public.company_represented_businesses brand ON brand.id=product.represented_business_id AND brand.organization_id=product.organization_id
  WHERE product.organization_id=target_organization_id AND product.status='active'
   AND (target_contract_id IS NULL OR product.contract_id=target_contract_id)
   AND (product.represented_business_id IS NULL OR brand.status='active')
   AND (COALESCE(cardinality(target_represented_business_ids),0)=0 OR product.represented_business_id=ANY(target_represented_business_ids))
 ), ranked AS (SELECT * FROM eligible ORDER BY relevance DESC,name,id OFFSET target_offset LIMIT target_limit)
 SELECT (SELECT count(*) FROM eligible),COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'id',ranked.id,'contractId',ranked.contract_id,'representedBusinessId',ranked.represented_business_id,'representedBusinessName',ranked.brand_name,
  'name',ranked.name,'category',ranked.category,'description',left(ranked.description,800),'valueProposition',left(ranked.value_proposition,500),
  'targetAudience',left(ranked.target_audience,500),'proofPoints',to_jsonb(ranked.proof_points),'objections',to_jsonb(ranked.objections),'cta',left(ranked.cta,500),'sku',ranked.metadata->>'sku','packaging',left(ranked.metadata->>'packaging',300),
  'storageConditions',left(ranked.metadata->>'storageConditions',500),'serviceRegions',ranked.metadata->'serviceRegions','brandServiceRegions',to_jsonb(ranked.brand_regions),
  'authorizedLines',to_jsonb(ranked.authorized_lines),'commercialAvailability',CASE WHEN ranked.metadata->>'commercialAvailability'='confirmed' THEN 'confirmed' ELSE 'unconfirmed' END,
  'sourceUrl',ranked.metadata->>'sourceUrl','originStatus','business_record_not_market_evidence','updatedAt',ranked.updated_at
 )) ORDER BY ranked.relevance DESC,ranked.name,ranked.id),'[]'::jsonb) INTO total,items FROM ranked;
 SELECT COALESCE(jsonb_agg(projected ORDER BY name,id),'[]'::jsonb) INTO brands FROM (
  SELECT id,name,jsonb_build_object('id',id,'name',name,'relationshipType',relationship_type,'description',left(description,500),'authorizedLines',authorized_lines,'serviceRegions',service_regions)
   || CASE WHEN target_audience='external_contact' THEN '{}'::jsonb ELSE jsonb_build_object('commercialConditions',left(commercial_conditions,1000)) END AS projected
  FROM public.company_represented_businesses WHERE organization_id=target_organization_id AND status='active'
   AND (COALESCE(cardinality(target_represented_business_ids),0)=0 OR id=ANY(target_represented_business_ids)) ORDER BY name,id LIMIT 20
 ) visible;
 RETURN jsonb_build_object('items',items,'total',total,'representedBusinesses',brands,'offset',target_offset,'limit',target_limit,'coverage',jsonb_build_object('selected',jsonb_array_length(items),'hasMore',target_offset+jsonb_array_length(items)<total),'authority','company_portfolio','deliveryAuthorization','not_granted');
END;
$$;
REVOKE ALL ON FUNCTION private.get_company_portfolio_context_v1(uuid,uuid,text,text,text,uuid[],integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_company_portfolio_context_v1(uuid,uuid,text,text,text,uuid[],integer,integer) TO yux_api,yux_worker,yux_runtime;
