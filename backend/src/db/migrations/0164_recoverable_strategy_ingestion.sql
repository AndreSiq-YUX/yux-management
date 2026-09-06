-- Durable, file-backed strategy pack ingestion.

ALTER TABLE public.yux_strategy_ingestion_jobs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS byte_size BIGINT CHECK (byte_size IS NULL OR byte_size > 0),
  ADD COLUMN IF NOT EXISTS sha256 TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS failure_class TEXT CHECK (failure_class IS NULL OR failure_class IN ('recoverable','configuration','terminal')),
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upload_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upload_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE public.yux_strategy_ingestion_jobs ingestion
SET organization_id=COALESCE(
  pack.owner_organization_id,
  (SELECT id FROM public.organizations WHERE is_internal_growth_workspace=true ORDER BY created_at LIMIT 1)
)
FROM public.yux_strategy_packs pack
WHERE pack.id=ingestion.pack_id AND ingestion.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_yux_strategy_ingestion_recovery
  ON public.yux_strategy_ingestion_jobs(status,lease_until,created_at);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_ingestion_org_hash
  ON public.yux_strategy_ingestion_jobs(organization_id,sha256)
  WHERE sha256 IS NOT NULL;

ALTER TABLE public.yux_strategy_ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_ingestion_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS strategy_ingestion_internal ON public.yux_strategy_ingestion_jobs;
CREATE POLICY strategy_ingestion_internal ON public.yux_strategy_ingestion_jobs FOR ALL
  USING (private.rls_is_internal())
  WITH CHECK (private.rls_is_internal());

GRANT SELECT,INSERT,UPDATE ON public.yux_strategy_ingestion_jobs TO yux_api,yux_worker;
GRANT SELECT,INSERT,UPDATE ON public.yux_strategy_source_documents TO yux_api,yux_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.yux_strategy_source_chunks TO yux_worker;
