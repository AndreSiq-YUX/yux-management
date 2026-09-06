-- Evidence-backed strategic curation checkpoints and human review metadata.

ALTER TABLE public.yux_strategy_ingestion_jobs
  ADD COLUMN IF NOT EXISTS extraction_hash TEXT,
  ADD COLUMN IF NOT EXISTS curation_input_hash TEXT,
  ADD COLUMN IF NOT EXISTS curation_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS curation_output JSONB,
  ADD COLUMN IF NOT EXISTS curation_provider TEXT,
  ADD COLUMN IF NOT EXISTS curation_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_input_hash TEXT CHECK (embedding_input_hash IS NULL OR embedding_input_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS embedding_output JSONB,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER CHECK (embedding_dimensions IS NULL OR embedding_dimensions > 0),
  ADD COLUMN IF NOT EXISTS embedding_tokens INTEGER CHECK (embedding_tokens IS NULL OR embedding_tokens >= 0);

ALTER TABLE public.yux_strategy_pack_items
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.yux_strategy_source_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS yux_strategy_pack_item_curated_hash_uq
  ON public.yux_strategy_pack_items(pack_id,content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.yux_strategy_curation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id UUID NOT NULL REFERENCES public.yux_strategy_ingestion_jobs(id) ON DELETE CASCADE,
  batch_index INTEGER NOT NULL CHECK (batch_index >= 0),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  output JSONB,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  prompt_hash TEXT,
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ingestion_id,batch_index)
);

DROP TRIGGER IF EXISTS update_yux_strategy_curation_batches_updated_at ON public.yux_strategy_curation_batches;
CREATE TRIGGER update_yux_strategy_curation_batches_updated_at
  BEFORE UPDATE ON public.yux_strategy_curation_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.yux_strategy_curation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_curation_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY strategy_curation_batches_internal ON public.yux_strategy_curation_batches FOR ALL
  USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

GRANT SELECT,INSERT,UPDATE ON public.yux_strategy_curation_batches TO yux_worker,yux_api;
GRANT SELECT,INSERT,UPDATE ON public.yux_strategy_pack_items TO yux_worker,yux_api;
