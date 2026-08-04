-- Evidence-backed knowledge curation, semantic retrieval and website-assisted onboarding.

ALTER TABLE public.marketing_knowledge_chunks
  ADD COLUMN IF NOT EXISTS chunk_kind TEXT NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS source_locator TEXT,
  ADD COLUMN IF NOT EXISTS evidence_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS curation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER,
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_knowledge_chunks_kind_check') THEN
    ALTER TABLE public.marketing_knowledge_chunks
      ADD CONSTRAINT marketing_knowledge_chunks_kind_check
      CHECK (chunk_kind IN ('raw','curated_fact','curated_summary'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_knowledge_chunks_curation_check') THEN
    ALTER TABLE public.marketing_knowledge_chunks
      ADD CONSTRAINT marketing_knowledge_chunks_curation_check
      CHECK (curation_status IN ('pending','approved','rejected','not_required'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_knowledge_chunks_quality_check') THEN
    ALTER TABLE public.marketing_knowledge_chunks
      ADD CONSTRAINT marketing_knowledge_chunks_quality_check
      CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.knowledge_intelligence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.marketing_knowledge_documents(id) ON DELETE CASCADE,
  run_kind TEXT NOT NULL CHECK (run_kind IN ('document_curation','website_onboarding')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready_for_review','degraded','failed','applied','cancelled')),
  stage TEXT NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued','discovering','extracting','cleaning','curating','embedding','ready_for_review','applying','completed','failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  provider TEXT,
  model TEXT,
  input_hash TEXT,
  output_hash TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metrics) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  error_message TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_intelligence_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.knowledge_intelligence_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  suggestion_kind TEXT NOT NULL CHECK (suggestion_kind IN ('profile','brand','product')),
  field_path TEXT NOT NULL CHECK (BTRIM(field_path) <> ''),
  current_value JSONB,
  suggested_value JSONB NOT NULL,
  evidence_excerpt TEXT NOT NULL CHECK (BTRIM(evidence_excerpt) <> ''),
  source_url TEXT NOT NULL CHECK (BTRIM(source_url) <> ''),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','applied','rejected')),
  applied_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, field_path, source_url)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_intelligence_runs_org_status
  ON public.knowledge_intelligence_runs(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_intelligence_runs_document
  ON public.knowledge_intelligence_runs(document_id, created_at DESC)
  WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_intelligence_suggestions_run_status
  ON public.company_intelligence_suggestions(run_id, status, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_knowledge_chunks_curated_document
  ON public.marketing_knowledge_chunks(document_id, chunk_kind, curation_status, chunk_index);

DROP TRIGGER IF EXISTS update_knowledge_intelligence_runs_updated_at ON public.knowledge_intelligence_runs;
CREATE TRIGGER update_knowledge_intelligence_runs_updated_at
  BEFORE UPDATE ON public.knowledge_intelligence_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_intelligence_suggestions_updated_at ON public.company_intelligence_suggestions;
CREATE TRIGGER update_company_intelligence_suggestions_updated_at
  BEFORE UPDATE ON public.company_intelligence_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
