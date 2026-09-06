ALTER TABLE public.content_versions
  ADD CONSTRAINT content_versions_id_item_unique UNIQUE (id, content_item_id);

ALTER TABLE public.content_reviews
  ADD COLUMN IF NOT EXISTS content_version_id UUID;

UPDATE public.content_reviews review
SET content_version_id = (
  SELECT id
  FROM public.content_versions
  WHERE content_item_id = review.content_item_id
  ORDER BY version_number DESC
  LIMIT 1
)
WHERE review.content_version_id IS NULL;

ALTER TABLE public.content_reviews
  ADD CONSTRAINT content_reviews_version_item_fk
  FOREIGN KEY (content_version_id, content_item_id)
  REFERENCES public.content_versions(id, content_item_id)
  ON DELETE RESTRICT;

ALTER TABLE public.publishing_runs
  ADD COLUMN IF NOT EXISTS approved_content_version_id UUID;

ALTER TABLE public.marketing_workflow_runs
  ADD COLUMN IF NOT EXISTS journey_idempotency_key TEXT;

ALTER TABLE public.publishing_runs
  ADD CONSTRAINT publishing_runs_approved_version_item_fk
  FOREIGN KEY (approved_content_version_id, content_item_id)
  REFERENCES public.content_versions(id, content_item_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_content_reviews_version
  ON public.content_reviews(content_version_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_publishing_runs_approved_version
  ON public.publishing_runs(approved_content_version_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_workflow_runs_journey_intent
  ON public.marketing_workflow_runs(organization_id, contract_id, journey_idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_reviews_one_pending_version
  ON public.content_reviews(content_item_id, content_version_id)
  WHERE status = 'pending' AND content_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.guard_approved_content_version()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.content_reviews
    WHERE content_version_id = OLD.id AND status = 'approved'
  ) OR EXISTS (
    SELECT 1 FROM public.publishing_runs
    WHERE approved_content_version_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'approved_content_version_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approved_content_version_immutable ON public.content_versions;
CREATE TRIGGER approved_content_version_immutable
  BEFORE UPDATE OR DELETE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_approved_content_version();

CREATE OR REPLACE FUNCTION private.guard_publishing_run_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
     OR NEW.content_item_id IS DISTINCT FROM OLD.content_item_id
     OR NEW.approved_content_version_id IS DISTINCT FROM OLD.approved_content_version_id
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_payload IS DISTINCT FROM OLD.request_payload THEN
    RAISE EXCEPTION 'publishing_run_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS publishing_run_identity_immutable ON public.publishing_runs;
CREATE TRIGGER publishing_run_identity_immutable
  BEFORE UPDATE ON public.publishing_runs
  FOR EACH ROW EXECUTE FUNCTION private.guard_publishing_run_identity();
