CREATE TABLE public.strategy_agent_prompt_versions (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  instruction TEXT CHECK (instruction IS NULL OR length(btrim(instruction)) BETWEEN 1 AND 4000),
  operation TEXT NOT NULL CHECK (operation IN ('publish', 'restore')),
  restored_from_version INTEGER,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  test_fingerprints TEXT[] NOT NULL,
  author_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, version)
);

ALTER TABLE public.strategy_agent_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_agent_prompt_versions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.strategy_agent_prompt_versions TO yux_api;
CREATE POLICY strategy_agent_prompt_versions_admin ON public.strategy_agent_prompt_versions
  USING (current_setting('app.current_role', true) = 'yux_admin')
  WITH CHECK (current_setting('app.current_role', true) = 'yux_admin');

ALTER TABLE public.yux_strategy_chat_sessions
  ADD COLUMN presales_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.proposal_templates
  ADD COLUMN presales_sellable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX one_sellable_presales_template_per_package
  ON public.proposal_templates (organization_id, package_id)
  WHERE presales_sellable AND is_active;

ALTER TABLE public.proposals
  ADD COLUMN strategy_recommendation_message_id UUID
    REFERENCES public.yux_strategy_chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN strategy_catalog_version TEXT CHECK (strategy_catalog_version ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX proposals_strategy_recommendation_once
  ON public.proposals (strategy_recommendation_message_id)
  WHERE strategy_recommendation_message_id IS NOT NULL;
