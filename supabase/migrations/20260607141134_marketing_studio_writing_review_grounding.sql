-- YUX Marketing Studio Phase 6: provider-neutral writing, review, quality
-- gates and grounding control. Live LLM/Jina execution stays outside this
-- migration; these tables store the operational contracts and logs.

CREATE TABLE public.marketing_content_generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  writer_agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  reviewer_agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  source_idea_id UUID REFERENCES public.marketing_ideas(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  content_version_id UUID REFERENCES public.content_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','writing','reviewing','grounding','waiting_approval','succeeded','failed','cancelled')),
  content_type TEXT NOT NULL DEFAULT 'social_post'
    CHECK (content_type IN ('social_post','blog_article','newsletter','email','ad_copy','video_script','carousel_text','creative_brief')),
  channel TEXT NOT NULL CHECK (BTRIM(channel) <> ''),
  brief_snapshot TEXT NOT NULL DEFAULT '',
  context_summary TEXT NOT NULL DEFAULT '',
  prompt_snapshot TEXT,
  output_title TEXT,
  output_body TEXT,
  output_cta TEXT,
  variation_count INTEGER NOT NULL DEFAULT 0 CHECK (variation_count >= 0),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  requires_grounding BOOLEAN NOT NULL DEFAULT FALSE,
  grounding_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (grounding_status IN ('not_required','required','running','succeeded','failed','blocked')),
  checklist JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(checklist) = 'object'),
  error_message TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_content_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  generation_run_id UUID REFERENCES public.marketing_content_generation_runs(id) ON DELETE SET NULL,
  reviewer_agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  grounding_tool_run_id UUID REFERENCES public.marketing_tool_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','passed','needs_changes','rejected','failed')),
  quality_score INTEGER NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  checklist JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(checklist) = 'object'),
  risk_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  grounding_required BOOLEAN NOT NULL DEFAULT FALSE,
  grounding_summary TEXT,
  comments TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketing_generation_runs_contract_status
  ON public.marketing_content_generation_runs(contract_id, status, created_at DESC);
CREATE INDEX idx_marketing_generation_runs_content
  ON public.marketing_content_generation_runs(content_item_id, created_at DESC);
CREATE INDEX idx_marketing_generation_runs_idea
  ON public.marketing_content_generation_runs(source_idea_id, created_at DESC);
CREATE INDEX idx_marketing_quality_checks_contract_status
  ON public.marketing_content_quality_checks(contract_id, status, created_at DESC);
CREATE INDEX idx_marketing_quality_checks_content
  ON public.marketing_content_quality_checks(content_item_id, created_at DESC);

CREATE TRIGGER update_marketing_content_generation_runs_updated_at
  BEFORE UPDATE ON public.marketing_content_generation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_content_quality_checks_updated_at
  BEFORE UPDATE ON public.marketing_content_quality_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_content_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content_quality_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing users read content generation runs" ON public.marketing_content_generation_runs
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers create content generation runs" ON public.marketing_content_generation_runs
  FOR INSERT TO authenticated WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));
CREATE POLICY "Marketing supervisors update content generation runs" ON public.marketing_content_generation_runs
  FOR UPDATE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));
CREATE POLICY "Marketing supervisors delete content generation runs" ON public.marketing_content_generation_runs
  FOR DELETE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

CREATE POLICY "Marketing users read content quality checks" ON public.marketing_content_quality_checks
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers create content quality checks" ON public.marketing_content_quality_checks
  FOR INSERT TO authenticated WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));
CREATE POLICY "Marketing supervisors update content quality checks" ON public.marketing_content_quality_checks
  FOR UPDATE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));
CREATE POLICY "Marketing supervisors delete content quality checks" ON public.marketing_content_quality_checks
  FOR DELETE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

REVOKE ALL ON public.marketing_content_generation_runs FROM anon;
REVOKE ALL ON public.marketing_content_quality_checks FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_content_generation_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_content_quality_checks TO authenticated, service_role;

UPDATE public.marketing_agent_global_prompts
SET default_quality_gates = default_quality_gates || jsonb_build_object(
      'minimumQualityScore', 75,
      'requireCta', true,
      'blockForbiddenTopics', true,
      'groundingWhenFactual', true
    ),
    updated_at = NOW()
WHERE agent_type IN ('multichannel_writer', 'brand_quality_reviewer');

NOTIFY pgrst, 'reload schema';
