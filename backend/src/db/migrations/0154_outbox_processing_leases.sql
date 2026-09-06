-- Recoverable claims for the transactional outbox, its consumers and long-running knowledge work.

ALTER TABLE public.domain_events
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_stage TEXT NOT NULL DEFAULT 'dispatch',
  ADD COLUMN IF NOT EXISTS processor_version TEXT NOT NULL DEFAULT 'domain-event-dispatch:v1',
  ADD COLUMN IF NOT EXISTS failure_class TEXT CHECK (failure_class IN ('recoverable', 'configuration', 'terminal'));

ALTER TABLE public.domain_event_deliveries
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_stage TEXT NOT NULL DEFAULT 'consume',
  ADD COLUMN IF NOT EXISTS processor_version TEXT NOT NULL DEFAULT 'domain-event-consumer:v1',
  ADD COLUMN IF NOT EXISTS failure_class TEXT CHECK (failure_class IN ('recoverable', 'configuration', 'terminal'));

ALTER TABLE public.knowledge_intelligence_runs
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS processor_version TEXT NOT NULL DEFAULT 'knowledge-intelligence:v1',
  ADD COLUMN IF NOT EXISTS input_hash TEXT CHECK (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS failure_class TEXT CHECK (failure_class IN ('recoverable', 'configuration', 'terminal'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_intelligence_runs_input_hash_check'
      AND conrelid = 'public.knowledge_intelligence_runs'::regclass
  ) THEN
    ALTER TABLE public.knowledge_intelligence_runs
      ADD CONSTRAINT knowledge_intelligence_runs_input_hash_check
      CHECK (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_domain_events_recoverable_claim
  ON public.domain_events(dispatch_status, lease_until, available_at, created_at)
  WHERE dispatch_status IN ('pending', 'dispatching', 'failed');

CREATE INDEX IF NOT EXISTS idx_domain_event_deliveries_recoverable_claim
  ON public.domain_event_deliveries(status, lease_until, available_at, created_at)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_knowledge_intelligence_runs_recoverable_claim
  ON public.knowledge_intelligence_runs(status, lease_until, created_at)
  WHERE status IN ('queued', 'running', 'failed');
