-- Auditable, replay-safe reconciliation of historical operational state.

CREATE TABLE IF NOT EXISTS public.state_reconciliation_manifests (
  manifest_hash TEXT PRIMARY KEY CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  generated_at TIMESTAMPTZ NOT NULL,
  cutoff_at TIMESTAMPTZ NOT NULL,
  database_fingerprint TEXT NOT NULL CHECK (database_fingerprint ~ '^[a-f0-9]{64}$'),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  status TEXT NOT NULL DEFAULT 'applying' CHECK (status IN ('applying','applied','partially_applied')),
  applied_by TEXT NOT NULL CHECK (BTRIM(applied_by) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK ((status='applied' AND completed_at IS NOT NULL) OR (status<>'applied' AND completed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS public.state_reconciliation_items (
  manifest_hash TEXT NOT NULL REFERENCES public.state_reconciliation_manifests(manifest_hash) ON DELETE RESTRICT,
  item_id TEXT NOT NULL CHECK (BTRIM(item_id) <> ''),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'strategy_ingestion','knowledge_run','agent_execution_run','mission_conversation',
    'mission','external_effect','queue_job'
  )),
  entity_id TEXT NOT NULL CHECK (BTRIM(entity_id) <> ''),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (BTRIM(reason) <> ''),
  current_state JSONB NOT NULL CHECK (jsonb_typeof(current_state) = 'object'),
  proposed_action TEXT NOT NULL CHECK (BTRIM(proposed_action) <> ''),
  expected_version TEXT NOT NULL CHECK (BTRIM(expected_version) <> ''),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  external_effect_risk TEXT NOT NULL CHECK (external_effect_risk IN ('none','possible','unknown')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','manual_review','skipped','failed')),
  result JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  PRIMARY KEY (manifest_hash,item_id),
  UNIQUE (manifest_hash,entity_type,entity_id),
  CHECK ((status='pending' AND applied_at IS NULL) OR (status<>'pending' AND applied_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_state_reconciliation_items_status
  ON public.state_reconciliation_items(status,created_at);
CREATE INDEX IF NOT EXISTS idx_state_reconciliation_items_entity
  ON public.state_reconciliation_items(entity_type,entity_id,created_at DESC);

CREATE OR REPLACE FUNCTION private.guard_state_reconciliation_manifest_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'state_reconciliation_history_append_only';
  END IF;
  IF NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash
     OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
     OR NEW.cutoff_at IS DISTINCT FROM OLD.cutoff_at
     OR NEW.database_fingerprint IS DISTINCT FROM OLD.database_fingerprint
     OR NEW.item_count IS DISTINCT FROM OLD.item_count
     OR NEW.applied_by IS DISTINCT FROM OLD.applied_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'state_reconciliation_manifest_immutable';
  END IF;
  IF (OLD.status='applied' AND NEW.status<>'applied')
     OR (OLD.status='partially_applied' AND NEW.status='applying')
     OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
    RAISE EXCEPTION 'state_reconciliation_manifest_transition_invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION private.guard_state_reconciliation_item_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'state_reconciliation_history_append_only';
  END IF;
  IF NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.current_state IS DISTINCT FROM OLD.current_state
     OR NEW.proposed_action IS DISTINCT FROM OLD.proposed_action
     OR NEW.expected_version IS DISTINCT FROM OLD.expected_version
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.external_effect_risk IS DISTINCT FROM OLD.external_effect_risk
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'state_reconciliation_item_identity_immutable';
  END IF;
  IF OLD.status<>'pending' AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.result IS DISTINCT FROM OLD.result
       OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
     ) THEN
    RAISE EXCEPTION 'state_reconciliation_item_result_immutable';
  END IF;
  IF OLD.status='pending' AND NEW.status='pending'
     AND (NEW.result IS DISTINCT FROM OLD.result OR NEW.applied_at IS DISTINCT FROM OLD.applied_at) THEN
    RAISE EXCEPTION 'state_reconciliation_item_transition_invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS state_reconciliation_manifests_history
  ON public.state_reconciliation_manifests;
CREATE TRIGGER state_reconciliation_manifests_history
  BEFORE UPDATE OR DELETE ON public.state_reconciliation_manifests
  FOR EACH ROW EXECUTE FUNCTION private.guard_state_reconciliation_manifest_history();

DROP TRIGGER IF EXISTS state_reconciliation_items_history
  ON public.state_reconciliation_items;
CREATE TRIGGER state_reconciliation_items_history
  BEFORE UPDATE OR DELETE ON public.state_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION private.guard_state_reconciliation_item_history();

ALTER TABLE public.state_reconciliation_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_reconciliation_manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.state_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_reconciliation_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS state_reconciliation_manifests_internal
  ON public.state_reconciliation_manifests;
CREATE POLICY state_reconciliation_manifests_internal
  ON public.state_reconciliation_manifests FOR ALL
  USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

DROP POLICY IF EXISTS state_reconciliation_items_internal
  ON public.state_reconciliation_items;
CREATE POLICY state_reconciliation_items_internal
  ON public.state_reconciliation_items FOR ALL
  USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

GRANT SELECT,INSERT,UPDATE ON public.state_reconciliation_manifests TO yux_api,yux_worker;
GRANT SELECT,INSERT,UPDATE ON public.state_reconciliation_items TO yux_api,yux_worker;
REVOKE DELETE ON public.state_reconciliation_manifests FROM yux_api,yux_worker;
REVOKE DELETE ON public.state_reconciliation_items FROM yux_api,yux_worker;
