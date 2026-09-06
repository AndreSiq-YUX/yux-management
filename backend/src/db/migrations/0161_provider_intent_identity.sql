-- One immutable identity per approved provider intention. Provider mutation
-- rows remain attempt/evidence records and link to the Action Engine ledger
-- whenever they originate from an action run.

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS provider_intent_id UUID,
  ADD COLUMN IF NOT EXISTS provider_payload_hash TEXT
    CHECK (provider_payload_hash IS NULL OR provider_payload_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_target_type_check;
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_target_type_check
  CHECK (target_type IN ('deliverable','document','creative','campaign_provider_mutation'));

CREATE OR REPLACE FUNCTION private.validate_approval_request_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.target_type = 'deliverable' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.project_deliverables deliverable
       WHERE deliverable.id = NEW.target_id
         AND deliverable.project_id = NEW.project_id
         AND deliverable.is_client_visible
    ) THEN
      RAISE EXCEPTION 'Approval target must be a visible deliverable from the same project';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.target_type = 'campaign_provider_mutation' THEN
    IF NEW.provider_intent_id IS NULL OR NEW.provider_payload_hash IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.campaigns campaign
      JOIN public.projects project ON project.id = NEW.project_id
       WHERE campaign.id = NEW.target_id
         AND campaign.client_id = project.client_id
    ) THEN
      RAISE EXCEPTION 'Provider mutation approval must identify an intent, payload and campaign from the same client project';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Approval target type % is not available yet', NEW.target_type;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_approval_request_target() FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_provider_intent
  ON public.approval_requests(provider_intent_id)
  WHERE provider_intent_id IS NOT NULL;

ALTER TABLE public.action_external_effects
  ADD COLUMN IF NOT EXISTS intent_id UUID,
  ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES public.action_approvals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approval_subject_hash TEXT;

UPDATE public.action_external_effects
   SET intent_id = run_id
 WHERE intent_id IS NULL;

ALTER TABLE public.action_external_effects
  ALTER COLUMN intent_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_external_effects_intent
  ON public.action_external_effects(organization_id, intent_id);

ALTER TABLE public.ad_provider_mutation_runs
  ADD COLUMN IF NOT EXISTS intent_id UUID,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS approval_id UUID,
  ADD COLUMN IF NOT EXISTS approval_source TEXT,
  ADD COLUMN IF NOT EXISTS external_effect_id UUID REFERENCES public.action_external_effects(id) ON DELETE RESTRICT;

UPDATE public.ad_provider_mutation_runs
   SET intent_id = COALESCE(action_run_id, id),
       payload_hash = COALESCE(request_hash, encode(digest(request_payload::text, 'sha256'), 'hex')),
       approval_source = COALESCE(approval_source, CASE WHEN action_run_id IS NULL THEN 'legacy' ELSE 'action' END)
 WHERE intent_id IS NULL OR payload_hash IS NULL OR approval_source IS NULL;

UPDATE public.ad_provider_mutation_runs mutation
   SET external_effect_id = effect.id,
       approval_id = COALESCE(mutation.approval_id, effect.approval_id),
       approval_source = 'action'
  FROM public.action_external_effects effect
 WHERE mutation.external_effect_id IS NULL
   AND mutation.action_run_id = effect.run_id
   AND mutation.organization_id = effect.organization_id;

ALTER TABLE public.ad_provider_mutation_runs
  ALTER COLUMN intent_id SET NOT NULL,
  ALTER COLUMN payload_hash SET NOT NULL,
  ALTER COLUMN approval_source SET NOT NULL;

ALTER TABLE public.ad_provider_mutation_runs
  ADD CONSTRAINT ad_provider_mutation_runs_payload_hash_check
    CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT ad_provider_mutation_runs_approval_source_check
    CHECK (approval_source IN ('action','workspace','operator_confirmation','legacy'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_provider_mutation_runs_intent_effect
  ON public.ad_provider_mutation_runs(organization_id, intent_id, action);
