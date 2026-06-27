-- Growth Workspace foundation for Campanha 360, onboarding and smart segments.

CREATE TABLE IF NOT EXISTS public.growth_campaign_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  objective TEXT NOT NULL CHECK (objective IN (
    'lead_generation',
    'whatsapp_capture',
    'offer_promotion',
    'reactivation',
    'appointment_booking',
    'service_launch',
    'remarketing'
  )),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN (
    'draft',
    'planning',
    'waiting_assets',
    'waiting_approval',
    'ready',
    'active',
    'paused',
    'completed',
    'cancelled'
  )),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source_blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_campaign_plan_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.growth_campaign_plans(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL CHECK (step_key IN (
    'segment',
    'landing_page',
    'form',
    'creative',
    'ad',
    'organic_post',
    'whatsapp_or_email_followup',
    'automation',
    'approval',
    'report'
  )),
  label TEXT NOT NULL CHECK (BTRIM(label) <> ''),
  description TEXT,
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started',
    'blocked',
    'in_progress',
    'linked',
    'completed',
    'skipped'
  )),
  linked_entity_type TEXT,
  linked_entity_id UUID,
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  depends_on TEXT[] NOT NULL DEFAULT '{}'::text[],
  blocked_reason TEXT,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, step_key)
);

CREATE TABLE IF NOT EXISTS public.growth_smart_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  estimated_size INTEGER NOT NULL DEFAULT 0 CHECK (estimated_size >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.growth_onboarding_checklists(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  label TEXT NOT NULL CHECK (BTRIM(label) <> ''),
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  skipped_reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (checklist_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_growth_campaign_plans_org ON public.growth_campaign_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_growth_campaign_plans_contract ON public.growth_campaign_plans(contract_id);
CREATE INDEX IF NOT EXISTS idx_growth_campaign_plan_steps_plan ON public.growth_campaign_plan_steps(plan_id);
CREATE INDEX IF NOT EXISTS idx_growth_smart_segments_org ON public.growth_smart_segments(organization_id);
CREATE INDEX IF NOT EXISTS idx_growth_smart_segments_contract ON public.growth_smart_segments(contract_id);
CREATE INDEX IF NOT EXISTS idx_growth_onboarding_checklists_org ON public.growth_onboarding_checklists(organization_id);
CREATE INDEX IF NOT EXISTS idx_growth_onboarding_checklists_contract ON public.growth_onboarding_checklists(contract_id);
CREATE INDEX IF NOT EXISTS idx_growth_onboarding_steps_checklist ON public.growth_onboarding_steps(checklist_id);

ALTER TABLE public.growth_campaign_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_campaign_plan_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_smart_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_onboarding_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Growth users can manage campaign plans" ON public.growth_campaign_plans;
CREATE POLICY "Growth users can manage campaign plans" ON public.growth_campaign_plans
  FOR ALL USING (
    private.can_manage_campaign_organization(organization_id)
    OR (contract_id IS NOT NULL AND private.can_read_campaign_contract(contract_id))
  )
  WITH CHECK (
    private.can_manage_campaign_organization(organization_id)
    OR (contract_id IS NOT NULL AND private.can_read_campaign_contract(contract_id))
  );

DROP POLICY IF EXISTS "Growth users can manage campaign plan steps" ON public.growth_campaign_plan_steps;
CREATE POLICY "Growth users can manage campaign plan steps" ON public.growth_campaign_plan_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.growth_campaign_plans p
      WHERE p.id = plan_id
        AND (
          private.can_manage_campaign_organization(p.organization_id)
          OR (p.contract_id IS NOT NULL AND private.can_read_campaign_contract(p.contract_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.growth_campaign_plans p
      WHERE p.id = plan_id
        AND (
          private.can_manage_campaign_organization(p.organization_id)
          OR (p.contract_id IS NOT NULL AND private.can_read_campaign_contract(p.contract_id))
        )
    )
  );

DROP POLICY IF EXISTS "Growth users can manage smart segments" ON public.growth_smart_segments;
CREATE POLICY "Growth users can manage smart segments" ON public.growth_smart_segments
  FOR ALL USING (
    private.can_manage_campaign_organization(organization_id)
    OR (contract_id IS NOT NULL AND private.can_read_campaign_contract(contract_id))
  )
  WITH CHECK (
    private.can_manage_campaign_organization(organization_id)
    OR (contract_id IS NOT NULL AND private.can_read_campaign_contract(contract_id))
  );

DROP POLICY IF EXISTS "Growth users can manage onboarding checklists" ON public.growth_onboarding_checklists;
CREATE POLICY "Growth users can manage onboarding checklists" ON public.growth_onboarding_checklists
  FOR ALL USING (
    private.can_manage_campaign_organization(organization_id)
    OR (contract_id IS NOT NULL AND private.can_read_campaign_contract(contract_id))
  )
  WITH CHECK (
    private.can_manage_campaign_organization(organization_id)
    OR (contract_id IS NOT NULL AND private.can_read_campaign_contract(contract_id))
  );

DROP POLICY IF EXISTS "Growth users can manage onboarding steps" ON public.growth_onboarding_steps;
CREATE POLICY "Growth users can manage onboarding steps" ON public.growth_onboarding_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.growth_onboarding_checklists c
      WHERE c.id = checklist_id
        AND (
          private.can_manage_campaign_organization(c.organization_id)
          OR (c.contract_id IS NOT NULL AND private.can_read_campaign_contract(c.contract_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.growth_onboarding_checklists c
      WHERE c.id = checklist_id
        AND (
          private.can_manage_campaign_organization(c.organization_id)
          OR (c.contract_id IS NOT NULL AND private.can_read_campaign_contract(c.contract_id))
        )
    )
  );
