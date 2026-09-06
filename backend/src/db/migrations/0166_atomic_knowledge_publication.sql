-- Atomic governance snapshots for company and strategy publications.

ALTER TABLE public.yux_strategy_packs
  ADD COLUMN IF NOT EXISTS allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS governance_version INTEGER NOT NULL DEFAULT 1 CHECK (governance_version > 0);

UPDATE public.yux_strategy_packs
SET allowed_agent_profile_keys=target_profile_keys
WHERE cardinality(allowed_agent_profile_keys)=0 AND cardinality(target_profile_keys)>0;

UPDATE public.yux_strategy_packs SET governance_version=GREATEST(version,1);

ALTER TABLE public.yux_strategy_pack_releases
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal_only',
  ADD COLUMN IF NOT EXISTS allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_item_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retrieval_mode TEXT NOT NULL DEFAULT 'semantic'
    CHECK (retrieval_mode IN ('semantic','lexical'));

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS governance_version INTEGER NOT NULL DEFAULT 1 CHECK (governance_version > 0);

ALTER TABLE public.knowledge_publications
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal','external','both')),
  ADD COLUMN IF NOT EXISTS allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_item_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS yux_strategy_releases_approved_items_idx
  ON public.yux_strategy_pack_releases USING GIN(approved_item_ids);
CREATE INDEX IF NOT EXISTS knowledge_publications_approved_items_idx
  ON public.knowledge_publications USING GIN(approved_item_ids);

-- Client administrators publish through the scoped API. Keep outbox writes
-- unavailable to runtime/worker contexts and bind the event organization to
-- the request tenant even if a repository call is reached unexpectedly.
DROP POLICY IF EXISTS domain_events_backend_write ON public.domain_events;
CREATE POLICY domain_events_backend_write ON public.domain_events
  FOR INSERT WITH CHECK (
    private.rls_is_internal()
    OR (
      COALESCE(current_setting('app.service_role',TRUE),'')='api'
      AND COALESCE(current_setting('app.current_role',TRUE),'')='client_admin'
      AND private.rls_can_access_organization(organization_id)
    )
  );
