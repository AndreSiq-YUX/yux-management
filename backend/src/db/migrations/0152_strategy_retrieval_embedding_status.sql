BEGIN;

ALTER TABLE public.yux_strategy_retrieval_queries
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (embedding_status IN ('available', 'provided', 'unavailable'));

COMMIT;
