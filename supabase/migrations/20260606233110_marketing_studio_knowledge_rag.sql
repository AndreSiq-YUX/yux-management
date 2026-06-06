-- Marketing Studio knowledge, brand voice, structured offers, and simple RAG.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.marketing_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  tone_of_voice TEXT NOT NULL DEFAULT '',
  persona TEXT NOT NULL DEFAULT '',
  brand_voice_summary TEXT NOT NULL DEFAULT '',
  vocabulary_do TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  vocabulary_dont TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  forbidden_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  priority_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  visual_guidelines TEXT,
  compliance_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE public.marketing_products_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  category TEXT,
  description TEXT NOT NULL DEFAULT '',
  value_proposition TEXT,
  target_audience TEXT,
  proof_points TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  objections TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  cta TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  document_type TEXT NOT NULL DEFAULT 'brand' CHECK (document_type IN ('brand','product','service','faq','case','campaign','policy','other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','indexing','indexed','published','archived')),
  storage_path TEXT,
  source_url TEXT,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.marketing_knowledge_documents(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.knowledge_entries(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  title TEXT,
  body TEXT NOT NULL CHECK (BTRIM(body) <> ''),
  token_count INTEGER NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  embedding_model TEXT,
  embedding extensions.vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX idx_marketing_brand_profiles_contract ON public.marketing_brand_profiles(contract_id, status);
CREATE INDEX idx_marketing_products_services_contract_status ON public.marketing_products_services(contract_id, status);
CREATE INDEX idx_marketing_knowledge_documents_contract_status ON public.marketing_knowledge_documents(contract_id, status);
CREATE INDEX idx_marketing_knowledge_chunks_contract_document ON public.marketing_knowledge_chunks(contract_id, document_id, chunk_index);
CREATE INDEX idx_marketing_knowledge_chunks_body_fts ON public.marketing_knowledge_chunks USING GIN (to_tsvector('portuguese', body));
CREATE INDEX idx_marketing_knowledge_chunks_embedding ON public.marketing_knowledge_chunks USING ivfflat (embedding extensions.vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE TRIGGER update_marketing_brand_profiles_updated_at BEFORE UPDATE ON public.marketing_brand_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_products_services_updated_at BEFORE UPDATE ON public.marketing_products_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_knowledge_documents_updated_at BEFORE UPDATE ON public.marketing_knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_knowledge_chunks_updated_at BEFORE UPDATE ON public.marketing_knowledge_chunks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_products_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing users read brand profiles" ON public.marketing_brand_profiles
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage brand profiles" ON public.marketing_brand_profiles
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing users read products services" ON public.marketing_products_services
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage products services" ON public.marketing_products_services
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing users read knowledge documents" ON public.marketing_knowledge_documents
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage knowledge documents" ON public.marketing_knowledge_documents
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing users read knowledge chunks" ON public.marketing_knowledge_chunks
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage knowledge chunks" ON public.marketing_knowledge_chunks
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

REVOKE ALL ON public.marketing_brand_profiles FROM anon;
REVOKE ALL ON public.marketing_products_services FROM anon;
REVOKE ALL ON public.marketing_knowledge_documents FROM anon;
REVOKE ALL ON public.marketing_knowledge_chunks FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_brand_profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_products_services TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_knowledge_documents TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_knowledge_chunks TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_marketing_knowledge(
  target_contract_id UUID,
  search_query TEXT,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  title TEXT,
  body TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.id AS chunk_id,
    c.document_id,
    COALESCE(c.title, d.title) AS title,
    c.body,
    ts_rank_cd(to_tsvector('portuguese', c.body), plainto_tsquery('portuguese', search_query)) AS rank
  FROM public.marketing_knowledge_chunks c
  LEFT JOIN public.marketing_knowledge_documents d ON d.id = c.document_id
  WHERE c.contract_id = target_contract_id
    AND private.can_access_marketing_studio_organization(c.organization_id, 'read')
    AND (
      BTRIM(COALESCE(search_query, '')) = ''
      OR to_tsvector('portuguese', c.body) @@ plainto_tsquery('portuguese', search_query)
      OR c.body ILIKE '%' || search_query || '%'
      OR COALESCE(c.title, d.title, '') ILIKE '%' || search_query || '%'
    )
  ORDER BY rank DESC, c.updated_at DESC
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

REVOKE ALL ON FUNCTION public.match_marketing_knowledge(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_marketing_knowledge(UUID, TEXT, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
