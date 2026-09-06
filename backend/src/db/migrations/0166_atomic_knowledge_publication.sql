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
