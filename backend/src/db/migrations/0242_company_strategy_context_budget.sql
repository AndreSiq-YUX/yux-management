-- Reserve the full index and space for other selected strategies before truncating narrative sections.
CREATE OR REPLACE FUNCTION private.get_company_strategy_context_v1(
  target_organization_id uuid,target_contract_id uuid,target_profile_key text,target_audience text,
  target_query text,target_strategy_ids uuid[],target_max_chars integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  candidate record; projected jsonb; compact jsonb; source_content text; selected jsonb='[]'; strategy_index jsonb='[]';
  sections jsonb; section jsonb; clipped jsonb; budget integer; total integer=0; indexed integer=0;
  omitted_sections integer=0; truncated_sections integer=0; incomplete boolean=false; terms tsquery;
BEGIN
  IF target_organization_id IS NULL OR NOT private.rls_can_access_organization(target_organization_id) THEN
    RAISE EXCEPTION 'company_strategy_context_scope_forbidden' USING ERRCODE='42501';
  END IF;
  IF target_audience NOT IN ('internal_operator','client_user','external_contact') OR target_profile_key IS NULL OR btrim(target_profile_key)=''
    OR target_query IS NULL OR length(target_query)>10000 OR target_max_chars NOT BETWEEN 512 AND 100000 OR COALESCE(cardinality(target_strategy_ids),0)>100 THEN
    RAISE EXCEPTION 'invalid_company_strategy_context' USING ERRCODE='22023';
  END IF;
  IF target_contract_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contracts contract JOIN public.organizations org ON org.client_id=contract.client_id WHERE contract.id=target_contract_id AND org.id=target_organization_id) THEN
    RAISE EXCEPTION 'company_strategy_contract_scope_forbidden' USING ERRCODE='42501';
  END IF;
  IF current_setting('app.service_role',true)='runtime' AND (
    NOT target_organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[])
    OR NULLIF(current_setting('app.current_contract_id',true),'')::uuid IS DISTINCT FROM target_contract_id
    OR current_setting('app.current_profile_key',true) IS DISTINCT FROM target_profile_key
    OR current_setting('app.current_audience',true) IS DISTINCT FROM target_audience
  ) THEN RAISE EXCEPTION 'company_strategy_runtime_scope_mismatch' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(target_strategy_ids) requested(id) WHERE NOT EXISTS(SELECT 1 FROM public.company_strategies strategy WHERE strategy.id=requested.id AND strategy.organization_id=target_organization_id)) THEN
    RAISE EXCEPTION 'company_strategy_selection_scope_forbidden' USING ERRCODE='42501';
  END IF;
  terms=websearch_to_tsquery('portuguese',target_query);
  FOR candidate IN
    SELECT strategy.id,strategy.is_primary,revision.id AS revision_id,revision.revision_number,revision.content,
      count(*) OVER() AS total_candidates,ts_rank_cd(to_tsvector('portuguese',revision.content::text),terms) AS relevance
    FROM public.company_strategies strategy JOIN public.company_strategy_revisions revision
      ON revision.organization_id=strategy.organization_id AND revision.strategy_id=strategy.id AND revision.id=strategy.published_revision_id
    WHERE strategy.organization_id=target_organization_id AND strategy.archived_at IS NULL
      AND EXISTS(SELECT 1 FROM public.company_strategy_publications publication WHERE publication.strategy_id=strategy.id AND publication.revision_id=revision.id AND publication.organization_id=strategy.organization_id)
      AND (COALESCE(cardinality(target_strategy_ids),0)=0 OR strategy.id=ANY(target_strategy_ids))
    ORDER BY strategy.is_primary DESC,relevance DESC,strategy.updated_at DESC,strategy.id
  LOOP
    projected=private.company_strategy_projection_v1(candidate.content,target_audience);
    IF target_audience='external_contact' AND jsonb_array_length(projected->'sections')=0 THEN CONTINUE; END IF;
    total=total+1;
    clipped=jsonb_build_object('strategyId',candidate.id,'revisionId',candidate.revision_id,'title',left(projected->>'title',120),'isPrimary',candidate.is_primary);
    IF length((strategy_index || jsonb_build_array(clipped))::text)<least(1500,target_max_chars/4) THEN strategy_index=strategy_index || jsonb_build_array(clipped); indexed=indexed+1; END IF;
    IF jsonb_array_length(selected)>=3 THEN CONTINUE; END IF;
    budget=target_max_chars-least(1500,target_max_chars/4)-length((SELECT COALESCE(jsonb_agg(value-'sourceContent'),'[]'::jsonb) FROM jsonb_array_elements(selected))::text)-600-greatest(0,least(3,candidate.total_candidates)::integer-jsonb_array_length(selected)-1)*500;
    compact=jsonb_build_object('strategyId',candidate.id,'revisionId',candidate.revision_id,'revisionNumber',candidate.revision_number,'title',projected->>'title','isPrimary',candidate.is_primary);
    IF target_audience<>'external_contact' THEN compact=compact || jsonb_build_object('objective',left(projected->>'objective',500),'summary',left(projected->>'summary',700)); END IF;
    sections='[]';
    FOR section IN SELECT value FROM jsonb_array_elements(projected->'sections') WHERE value->>'kind'='constraints' LOOP sections=sections || jsonb_build_array(section); END LOOP;
    compact=compact || jsonb_build_object('sections',sections);
    IF length(compact::text)>budget THEN incomplete=true; CONTINUE; END IF;
    FOR section IN SELECT value FROM jsonb_array_elements(projected->'sections') WHERE value->>'kind'<>'constraints' LOOP
      IF length((compact || jsonb_build_object('sections',sections || jsonb_build_array(section)))::text)<=budget THEN sections=sections || jsonb_build_array(section);
      ELSE
        clipped=section || jsonb_build_object('body',left(section->>'body',greatest(0,budget-length(compact::text)-length((section-'body')::text)-150)));
        IF length(clipped->>'body')>=80 AND length((compact || jsonb_build_object('sections',sections || jsonb_build_array(clipped)))::text)<=budget THEN sections=sections || jsonb_build_array(clipped); truncated_sections=truncated_sections+1;
        ELSE omitted_sections=omitted_sections+1; END IF;
      END IF;
      compact=compact || jsonb_build_object('sections',sections);
    END LOOP;
    source_content=projected::text;
    selected=selected || jsonb_build_array(compact || jsonb_build_object('sourceContent',source_content));
  END LOOP;
  IF COALESCE(cardinality(target_strategy_ids),0)>0 AND total>jsonb_array_length(selected) THEN incomplete=true; END IF;
  RETURN jsonb_build_object('index',strategy_index,'selected',selected,'coverage',jsonb_build_object('total',total,'selected',jsonb_array_length(selected),'indexed',indexed,'omittedStrategies',total-jsonb_array_length(selected),'omittedSections',omitted_sections,'truncatedSections',truncated_sections,'incomplete',incomplete),
    'contextHash',encode(public.digest(selected::text || strategy_index::text,'sha256'),'hex'));
END;
$$;
REVOKE ALL ON FUNCTION private.get_company_strategy_context_v1(uuid,uuid,text,text,text,uuid[],integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_company_strategy_context_v1(uuid,uuid,text,text,text,uuid[],integer) TO yux_api,yux_worker,yux_runtime;
