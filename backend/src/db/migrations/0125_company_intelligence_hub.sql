-- Canonical organization profile and governance metadata for the shared knowledge base.

CREATE TABLE IF NOT EXISTS public.organization_company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL DEFAULT '',
  trade_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  website_url TEXT,
  industry TEXT NOT NULL DEFAULT '',
  positioning TEXT NOT NULL DEFAULT '',
  differentiators TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  phones TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  address JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(address) = 'object'),
  business_hours JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(business_hours) = 'object'),
  service_regions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  social_links JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(social_links) = 'object'),
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id)
);

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS blocked_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS byte_size BIGINT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_sources_visibility_check'
  ) THEN
    ALTER TABLE public.knowledge_sources
      ADD CONSTRAINT knowledge_sources_visibility_check
      CHECK (visibility IN ('internal', 'external', 'both'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_organization_company_profiles_organization
  ON public.organization_company_profiles(organization_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_org_checksum
  ON public.knowledge_sources(organization_id, checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL AND status <> 'archived';

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_org_published_fts
  ON public.knowledge_entries
  USING GIN (to_tsvector('portuguese', COALESCE(title, '') || ' ' || COALESCE(body, '')))
  WHERE status IN ('approved', 'published');

DROP TRIGGER IF EXISTS update_organization_company_profiles_updated_at
  ON public.organization_company_profiles;
CREATE TRIGGER update_organization_company_profiles_updated_at
  BEFORE UPDATE ON public.organization_company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
