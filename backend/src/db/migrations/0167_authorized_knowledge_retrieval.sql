-- One eligibility and ranking policy for published strategy and company knowledge.

CREATE TABLE IF NOT EXISTS public.yux_strategy_release_items (
  release_id UUID NOT NULL REFERENCES public.yux_strategy_pack_releases(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES public.yux_strategy_pack_items(id) ON DELETE RESTRICT,
  PRIMARY KEY(release_id,item_id)
);

CREATE TABLE IF NOT EXISTS public.knowledge_publication_items (
  publication_id UUID NOT NULL REFERENCES public.knowledge_publications(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES public.marketing_knowledge_chunks(id) ON DELETE RESTRICT,
  PRIMARY KEY(publication_id,item_id)
);

INSERT INTO public.yux_strategy_release_items(release_id,item_id)
SELECT release.id,item.id
FROM public.yux_strategy_pack_releases release
CROSS JOIN LATERAL unnest(release.approved_item_ids) item(id)
ON CONFLICT DO NOTHING;

INSERT INTO public.knowledge_publication_items(publication_id,item_id)
SELECT publication.id,item.id
FROM public.knowledge_publications publication
CROSS JOIN LATERAL unnest(publication.approved_item_ids) item(id)
ON CONFLICT DO NOTHING;

CREATE TRIGGER protect_strategy_release_items_immutable
  BEFORE UPDATE OR DELETE ON public.yux_strategy_release_items
  FOR EACH ROW EXECUTE FUNCTION private.prevent_strategy_release_mutation();
CREATE TRIGGER protect_knowledge_publication_items_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_publication_items
  FOR EACH ROW EXECUTE FUNCTION private.prevent_immutable_omnichannel_event_mutation();

ALTER TABLE public.yux_strategy_release_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_release_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_publication_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_publication_items FORCE ROW LEVEL SECURITY;

CREATE POLICY strategy_release_items_read ON public.yux_strategy_release_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.yux_strategy_pack_releases release
    JOIN public.yux_strategy_packs pack ON pack.id=release.pack_id
    WHERE release.id=release_id
      AND (pack.owner_organization_id IS NULL OR private.rls_can_access_organization(pack.owner_organization_id))
  )
);
CREATE POLICY strategy_release_items_write ON public.yux_strategy_release_items FOR INSERT
  WITH CHECK (private.rls_is_internal());

CREATE POLICY knowledge_publication_items_read ON public.knowledge_publication_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.knowledge_publications publication
    WHERE publication.id=publication_id AND private.rls_can_access_organization(publication.organization_id)
  )
);
CREATE POLICY knowledge_publication_items_write ON public.knowledge_publication_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.knowledge_publications publication
    WHERE publication.id=publication_id AND private.rls_can_access_organization(publication.organization_id)
  )
  AND (
    private.rls_is_internal()
    OR (
      COALESCE(current_setting('app.service_role',TRUE),'')='api'
      AND COALESCE(current_setting('app.current_role',TRUE),'')='client_admin'
    )
  )
);

GRANT SELECT,INSERT ON public.yux_strategy_release_items,public.knowledge_publication_items TO yux_api,yux_worker;
GRANT SELECT ON public.yux_strategy_release_items,public.knowledge_publication_items TO yux_runtime;

CREATE OR REPLACE FUNCTION private.record_strategy_release_items(target_release_id UUID,target_item_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  release_pack_id UUID;
  release_owner_id UUID;
  approved_ids UUID[];
BEGIN
  SELECT release.pack_id,pack.owner_organization_id,release.approved_item_ids
    INTO release_pack_id,release_owner_id,approved_ids
  FROM public.yux_strategy_pack_releases release
  JOIN public.yux_strategy_packs pack ON pack.id=release.pack_id
  WHERE release.id=target_release_id;
  IF release_pack_id IS NULL
     OR (release_owner_id IS NOT NULL AND NOT private.rls_can_access_organization(release_owner_id))
     OR NOT (approved_ids @> target_item_ids AND target_item_ids @> approved_ids)
     OR EXISTS (
       SELECT 1 FROM unnest(target_item_ids) requested(id)
       LEFT JOIN public.yux_strategy_pack_items item
         ON item.id=requested.id AND item.pack_id=release_pack_id AND item.status='approved'
       WHERE item.id IS NULL
     ) THEN
    RAISE EXCEPTION 'invalid_strategy_release_items' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.yux_strategy_release_items(release_id,item_id)
  SELECT target_release_id,requested.id FROM unnest(target_item_ids) requested(id)
  ON CONFLICT DO NOTHING;
END
$$;

CREATE OR REPLACE FUNCTION private.record_knowledge_publication_items(target_publication_id UUID,target_item_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  publication_org_id UUID;
  publication_entry_id UUID;
  approved_ids UUID[];
BEGIN
  SELECT publication.organization_id,publication.entry_id,publication.approved_item_ids
    INTO publication_org_id,publication_entry_id,approved_ids
  FROM public.knowledge_publications publication WHERE publication.id=target_publication_id;
  IF publication_org_id IS NULL
     OR NOT private.rls_can_access_organization(publication_org_id)
     OR NOT (approved_ids @> target_item_ids AND target_item_ids @> approved_ids)
     OR EXISTS (
       SELECT 1 FROM unnest(target_item_ids) requested(id)
       LEFT JOIN public.marketing_knowledge_chunks chunk ON chunk.id=requested.id
         AND chunk.organization_id=publication_org_id AND chunk.entry_id=publication_entry_id
         AND chunk.chunk_kind IN ('curated_fact','curated_summary') AND chunk.curation_status='approved'
       WHERE chunk.id IS NULL
     ) THEN
    RAISE EXCEPTION 'invalid_knowledge_publication_items' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.knowledge_publication_items(publication_id,item_id)
  SELECT target_publication_id,requested.id FROM unnest(target_item_ids) requested(id)
  ON CONFLICT DO NOTHING;
END
$$;

REVOKE ALL ON FUNCTION private.record_strategy_release_items(UUID,UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.record_knowledge_publication_items(UUID,UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.record_strategy_release_items(UUID,UUID[]),private.record_knowledge_publication_items(UUID,UUID[])
  TO yux_api,yux_worker;

CREATE OR REPLACE FUNCTION private.strategy_card_search_text(
  concept TEXT,
  category TEXT,
  problem_solved TEXT,
  decision_rules TEXT[],
  recommended_actions TEXT[],
  retrieval_tags TEXT[]
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path=''
AS $$
  SELECT COALESCE(concept,'') || ' ' || COALESCE(category,'') || ' ' || COALESCE(problem_solved,'') || ' ' ||
         array_to_string(COALESCE(decision_rules,'{}'),' ') || ' ' ||
         array_to_string(COALESCE(recommended_actions,'{}'),' ') || ' ' ||
         array_to_string(COALESCE(retrieval_tags,'{}'),' ')
$$;
REVOKE ALL ON FUNCTION private.strategy_card_search_text(TEXT,TEXT,TEXT,TEXT[],TEXT[],TEXT[]) FROM PUBLIC;

CREATE INDEX IF NOT EXISTS yux_strategy_cards_published_fts_idx
  ON public.yux_strategy_concept_cards USING GIN (
    to_tsvector('portuguese',private.strategy_card_search_text(
      concept,category,problem_solved,decision_rules,recommended_actions,retrieval_tags))
  )
  WHERE pack_release_id IS NOT NULL AND human_review_status='approved';

CREATE INDEX IF NOT EXISTS marketing_knowledge_curated_fts_idx
  ON public.marketing_knowledge_chunks USING GIN (
    to_tsvector('portuguese',COALESCE(title,'') || ' ' || body)
  )
  WHERE chunk_kind IN ('curated_fact','curated_summary') AND curation_status='approved';

CREATE INDEX IF NOT EXISTS marketing_knowledge_published_scope_idx
  ON public.marketing_knowledge_documents(organization_id,contract_id,current_publication_id,id)
  WHERE status='published' AND current_publication_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS strategy_pack_bindings_retrieval_idx
  ON public.yux_strategy_pack_bindings(pack_id,organization_id,profile_key,module_key,workflow_key,channel,id)
  WHERE status='active';

CREATE OR REPLACE FUNCTION private.jsonb_cosine_similarity(left_vector JSONB,right_vector JSONB)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=''
AS $$
DECLARE
  result DOUBLE PRECISION;
BEGIN
  IF jsonb_typeof(left_vector)<>'array' OR jsonb_typeof(right_vector)<>'array'
     OR jsonb_array_length(left_vector)=0
     OR jsonb_array_length(left_vector)<>jsonb_array_length(right_vector) THEN
    RETURN NULL;
  END IF;
  SELECT SUM(left_item.value::DOUBLE PRECISION * right_item.value::DOUBLE PRECISION)
         / NULLIF(
             SQRT(SUM(POWER(left_item.value::DOUBLE PRECISION,2)))
             * SQRT(SUM(POWER(right_item.value::DOUBLE PRECISION,2))),
             0
           )
    INTO result
    FROM jsonb_array_elements_text(left_vector) WITH ORDINALITY left_item(value,position)
    JOIN jsonb_array_elements_text(right_vector) WITH ORDINALITY right_item(value,position)
      USING(position);
  RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END
$$;

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
      SELECT encode(digest(string_agg(
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
      AND (target_audience='internal_operator' OR release.visibility='client_safe')
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
      encode(digest(publication.id::TEXT || ':' || publication.content_hash,'sha256'),'hex') AS binding_fingerprint
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
  ), eligible AS (
    SELECT * FROM strategy_eligible WHERE target_namespace IN ('all','strategy')
    UNION ALL
    SELECT * FROM company_eligible WHERE target_namespace IN ('all','company')
  ), scored AS (
    SELECT eligible.*,
      CASE WHEN target_query_embedding IS NULL THEN eligible.lexical_score
           ELSE (0.35*eligible.lexical_score)+(0.65*COALESCE(eligible.vector_score,0)) END AS combined_score
    FROM eligible
    WHERE target_query_embedding IS NOT NULL
       OR eligible.lexical_score>0
       OR LOWER(eligible.content) LIKE '%' || LOWER(target_query_text) || '%'
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

REVOKE ALL ON FUNCTION private.jsonb_cosine_similarity(JSONB,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.retrieve_authorized_knowledge_v1(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.retrieve_authorized_knowledge_v1(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT)
  TO yux_api,yux_worker,yux_runtime;

-- Compatibility surface: it now applies the same publication policy and only
-- translates the known legacy result shape.
CREATE OR REPLACE FUNCTION public.match_marketing_knowledge(
  target_contract_id UUID,
  search_query TEXT,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (chunk_id UUID,document_id UUID,title TEXT,body TEXT,rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT candidate.id,candidate.document_id,document.title,candidate.content,candidate.combined_score::REAL
  FROM public.contracts contract
  JOIN public.organizations organization ON organization.client_id=contract.client_id
  CROSS JOIN LATERAL private.retrieve_authorized_knowledge_v1(
    organization.id,contract.id,
    COALESCE(NULLIF(current_setting('app.current_profile_key',TRUE),''),'marketing_strategist'),
    COALESCE(NULLIF(current_setting('app.current_audience',TRUE),''),'client_user'),
    'marketing_studio',NULL,NULL,search_query,match_count,NULL,NULL,'company'
  ) candidate
  JOIN public.marketing_knowledge_documents document ON document.id=candidate.document_id
  WHERE contract.id=target_contract_id AND candidate.namespace='company'
    AND private.rls_can_access_organization(organization.id)
  ORDER BY candidate.combined_score DESC,candidate.id ASC;
$$;

REVOKE ALL ON FUNCTION public.match_marketing_knowledge(UUID,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_marketing_knowledge(UUID,TEXT,INTEGER) TO yux_api,yux_worker,yux_runtime;
