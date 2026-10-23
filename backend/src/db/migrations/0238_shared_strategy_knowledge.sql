-- Internal YUX doctrine is shared across accounts. Storage custody is not retrieval scope.
-- Legacy publications remain immutable and are promoted through the publication command.
ALTER TABLE public.yux_strategy_packs
  ADD CONSTRAINT strategy_internal_owner_global
  CHECK (scope <> 'internal' OR owner_organization_id IS NULL) NOT VALID;

CREATE OR REPLACE FUNCTION private.guard_shared_strategy_binding()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND NEW.status='active' AND EXISTS (
    SELECT 1 FROM public.yux_strategy_packs pack WHERE pack.id=NEW.pack_id AND pack.scope='internal'
  ) THEN
    RAISE EXCEPTION 'strategy_shared_binding_must_be_global' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER guard_shared_strategy_binding
  BEFORE INSERT OR UPDATE ON public.yux_strategy_pack_bindings
  FOR EACH ROW EXECUTE FUNCTION private.guard_shared_strategy_binding();

-- The canonical policy below retains company/contract isolation, runtime scope,
-- publication eligibility and external-contact visibility. Internal doctrine can
-- support client-user reasoning without exposing its raw content in query DTOs.

CREATE OR REPLACE FUNCTION private.retrieve_authorized_knowledge_v1(
  target_organization_id UUID,
  target_contract_id UUID,
  target_profile_key TEXT,
  target_audience TEXT,
  target_module_key TEXT,
  target_workflow_key TEXT,
  target_channel TEXT,
  target_query_text TEXT,
  target_match_limit INTEGER,
  target_query_embedding JSONB DEFAULT NULL,
  target_embedding_model TEXT DEFAULT NULL,
  target_namespace TEXT DEFAULT 'all'
)
RETURNS TABLE (
  namespace TEXT,
  id UUID,
  publication_id UUID,
  item_id UUID,
  document_id UUID,
  source_locator TEXT,
  content TEXT,
  source_content_hash TEXT,
  use_mode TEXT,
  lexical_score DOUBLE PRECISION,
  vector_score DOUBLE PRECISION,
  combined_score DOUBLE PRECISION,
  embedding_model TEXT,
  binding_fingerprint TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF target_organization_id IS NULL OR NOT private.rls_can_access_organization(target_organization_id) THEN
    RAISE EXCEPTION 'knowledge_retrieval_scope_forbidden' USING ERRCODE='42501';
  END IF;
  IF BTRIM(COALESCE(target_profile_key,''))='' OR BTRIM(COALESCE(target_module_key,''))=''
     OR target_query_text IS NULL OR target_match_limit NOT BETWEEN 1 AND 20
     OR target_audience NOT IN ('internal_operator','client_user','external_contact')
     OR target_namespace NOT IN ('all','strategy','company') THEN
    RAISE EXCEPTION 'invalid_knowledge_query_v1' USING ERRCODE='22023';
  END IF;
  IF target_contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts contract
    JOIN public.organizations organization ON organization.client_id=contract.client_id
    WHERE contract.id=target_contract_id AND organization.id=target_organization_id
  ) THEN
    RAISE EXCEPTION 'knowledge_retrieval_contract_scope_forbidden' USING ERRCODE='42501';
  END IF;
  IF COALESCE(current_setting('app.service_role',TRUE),'')='runtime' AND (
    NULLIF(current_setting('app.current_profile_key',TRUE),'') IS DISTINCT FROM target_profile_key
    OR NULLIF(current_setting('app.current_audience',TRUE),'') IS DISTINCT FROM target_audience
    OR NULLIF(current_setting('app.current_contract_id',TRUE),'')::UUID IS DISTINCT FROM target_contract_id
  ) THEN
    RAISE EXCEPTION 'knowledge_retrieval_runtime_scope_mismatch' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH search AS (
    SELECT websearch_to_tsquery('portuguese',target_query_text) AS terms
  ), strategy_eligible AS (
    SELECT
      'strategy'::TEXT AS namespace,
      card.id,
      release.id AS publication_id,
      card.pack_item_id AS item_id,
      NULL::UUID AS document_id,
      COALESCE(card.metadata->'structured'->'evidence'->0->>'locator',card.metadata->'structured'->'evidence'->0->>'section') AS source_locator,
      BTRIM(card.concept || E'\n' || COALESCE(card.problem_solved,'') || E'\n' ||
        array_to_string(card.decision_rules,E'\n') || E'\n' || array_to_string(card.recommended_actions,E'\n')) AS content,
      embedding.content_hash AS source_content_hash,
      CASE WHEN release.visibility='client_safe' THEN 'quotable' ELSE 'internal_reasoning' END::TEXT AS use_mode,
      ts_rank_cd(
        to_tsvector('portuguese',private.strategy_card_search_text(
          card.concept,card.category,card.problem_solved,card.decision_rules,card.recommended_actions,card.retrieval_tags)),
        search.terms
      )::DOUBLE PRECISION AS lexical_score,
      private.jsonb_cosine_similarity(embedding.embedding_values,target_query_embedding) AS vector_score,
      embedding.embedding_model,
      binding.fingerprint AS binding_fingerprint
    FROM public.yux_strategy_concept_cards card
    JOIN public.yux_strategy_pack_releases release ON release.id=card.pack_release_id
    JOIN public.yux_strategy_release_items release_item ON release_item.release_id=release.id AND release_item.item_id=card.pack_item_id
    JOIN public.yux_strategy_packs pack ON pack.id=release.pack_id AND pack.current_release_id=release.id AND pack.status='published'
    JOIN public.yux_strategy_pack_items item ON item.id=card.pack_item_id AND item.pack_id=pack.id AND item.status='approved'
    CROSS JOIN search
    JOIN LATERAL (
      SELECT encode(public.digest(string_agg(
        binding.id::TEXT || ':' || EXTRACT(EPOCH FROM binding.updated_at)::TEXT,
        ',' ORDER BY binding.priority,binding.id
      ),'sha256'),'hex') AS fingerprint
      FROM public.yux_strategy_pack_bindings binding
      WHERE binding.pack_id=pack.id AND binding.status='active'
        AND (binding.organization_id IS NULL OR binding.organization_id=target_organization_id)
        AND (binding.profile_key IS NULL OR binding.profile_key=target_profile_key)
        AND (binding.module_key IS NULL OR binding.module_key=target_module_key)
        AND (binding.workflow_key IS NULL OR binding.workflow_key=target_workflow_key)
        AND (binding.channel IS NULL OR binding.channel=target_channel)
      HAVING COUNT(*)>0
    ) binding ON TRUE
    LEFT JOIN LATERAL (
      SELECT candidate.embedding_values,candidate.embedding_model,candidate.content_hash
      FROM public.yux_strategy_card_embeddings candidate
      WHERE candidate.card_id=card.id
        AND (target_embedding_model IS NULL OR candidate.embedding_model=target_embedding_model)
      ORDER BY candidate.created_at DESC,candidate.id
      LIMIT 1
    ) embedding ON TRUE
    WHERE card.human_review_status='approved'
      AND (pack.owner_organization_id IS NULL OR pack.owner_organization_id=target_organization_id)
      AND (cardinality(release.allowed_agent_profile_keys)=0 OR target_profile_key=ANY(release.allowed_agent_profile_keys))
      AND NOT target_profile_key=ANY(release.blocked_agent_profile_keys)
      AND (cardinality(card.allowed_agent_profile_keys)=0 OR target_profile_key=ANY(card.allowed_agent_profile_keys))
      AND (target_audience IN ('internal_operator','client_user') OR release.visibility='client_safe')
      AND (
        target_query_embedding IS NOT NULL
        OR search.terms=''::tsquery
        OR to_tsvector('portuguese',private.strategy_card_search_text(
          card.concept,card.category,card.problem_solved,card.decision_rules,card.recommended_actions,card.retrieval_tags)) @@ search.terms
      )
  ), company_eligible AS (
    SELECT
      'company'::TEXT AS namespace,
      chunk.id,
      publication.id AS publication_id,
      chunk.id AS item_id,
      document.id AS document_id,
      chunk.source_locator,
      chunk.body AS content,
      chunk.content_hash AS source_content_hash,
      CASE WHEN target_audience='external_contact' THEN 'quotable' ELSE 'internal_reasoning' END::TEXT AS use_mode,
      ts_rank_cd(to_tsvector('portuguese',COALESCE(chunk.title,'') || ' ' || chunk.body),search.terms)::DOUBLE PRECISION AS lexical_score,
      private.jsonb_cosine_similarity(chunk.embedding,target_query_embedding) AS vector_score,
      chunk.embedding_model,
      encode(public.digest(publication.id::TEXT || ':' || publication.content_hash,'sha256'),'hex') AS binding_fingerprint
    FROM public.marketing_knowledge_chunks chunk
    JOIN public.marketing_knowledge_documents document ON document.id=chunk.document_id
      AND document.status='published' AND document.current_publication_id IS NOT NULL
    JOIN public.knowledge_sources source ON source.id=document.source_id
      AND source.organization_id=document.organization_id
      AND source.status='published' AND source.current_publication_id=document.current_publication_id
    JOIN public.knowledge_publications publication ON publication.id=document.current_publication_id
      AND publication.id=source.current_publication_id AND publication.organization_id=document.organization_id
      AND publication.entry_id=chunk.entry_id
    JOIN public.knowledge_publication_items publication_item ON publication_item.publication_id=publication.id AND publication_item.item_id=chunk.id
    CROSS JOIN search
    WHERE document.organization_id=target_organization_id
      AND (target_contract_id IS NULL OR document.contract_id=target_contract_id)
      AND chunk.organization_id=document.organization_id
      AND chunk.client_id=document.client_id AND chunk.contract_id=document.contract_id
      AND chunk.chunk_kind IN ('curated_fact','curated_summary') AND chunk.curation_status='approved'
      AND (cardinality(publication.allowed_agent_profile_keys)=0 OR target_profile_key=ANY(publication.allowed_agent_profile_keys))
      AND NOT target_profile_key=ANY(publication.blocked_agent_profile_keys)
      AND (
        target_audience IN ('internal_operator','client_user')
        OR publication.visibility IN ('external','both')
      )
      AND (target_embedding_model IS NULL OR chunk.embedding_model IS NULL OR chunk.embedding_model=target_embedding_model)
      AND (
        target_query_embedding IS NOT NULL
        OR search.terms=''::tsquery
        OR to_tsvector('portuguese',COALESCE(chunk.title,'') || ' ' || chunk.body) @@ search.terms
      )
  ), eligible AS (
    SELECT * FROM strategy_eligible WHERE target_namespace IN ('all','strategy')
    UNION ALL
    SELECT * FROM company_eligible WHERE target_namespace IN ('all','company')
  ), scored AS (
    SELECT eligible.*,
      CASE WHEN target_query_embedding IS NULL THEN eligible.lexical_score
           ELSE (0.35*eligible.lexical_score)+(0.65*COALESCE(eligible.vector_score,0)) END AS combined_score
    FROM eligible
    WHERE target_query_embedding IS NOT NULL OR eligible.lexical_score>0 OR BTRIM(target_query_text)=''
  )
  SELECT scored.namespace,scored.id,scored.publication_id,scored.item_id,scored.document_id,
         scored.source_locator,scored.content,scored.source_content_hash,scored.use_mode,
         scored.lexical_score,scored.vector_score,scored.combined_score,scored.embedding_model,
         scored.binding_fingerprint
  FROM scored
  ORDER BY scored.combined_score DESC,scored.lexical_score DESC,scored.id ASC
  LIMIT target_match_limit;
END
$$;

