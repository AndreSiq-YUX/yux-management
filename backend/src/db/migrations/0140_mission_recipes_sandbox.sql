CREATE TABLE IF NOT EXISTS public.action_mission_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  sector TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  pack_selections JSONB NOT NULL CHECK (jsonb_typeof(pack_selections)='array'),
  default_goal JSONB NOT NULL CHECK (jsonb_typeof(default_goal)='object'),
  editable_keys TEXT[] NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (key,version)
);

CREATE TABLE IF NOT EXISTS public.action_sandbox_seed_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  recipe_version_id UUID NOT NULL REFERENCES public.action_mission_recipes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cleaned','review_required')),
  manifest_hash TEXT CHECK (manifest_hash IS NULL OR manifest_hash ~ '^[a-f0-9]{64}$'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cleaned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cleaned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_sandbox_one_active_recipe
  ON public.action_sandbox_seed_manifests(organization_id,recipe_version_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_action_sandbox_manifests_org_created
  ON public.action_sandbox_seed_manifests(organization_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.action_sandbox_seed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID NOT NULL REFERENCES public.action_sandbox_seed_manifests(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('crm_pipeline','crm_pipeline_stage','lead','interaction')),
  entity_id UUID NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (manifest_id,entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS idx_action_sandbox_items_manifest
  ON public.action_sandbox_seed_items(manifest_id,entity_type,created_at DESC);

ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS sandbox_seed_manifest_id UUID REFERENCES public.action_sandbox_seed_manifests(id) ON DELETE SET NULL;
ALTER TABLE public.crm_pipeline_stages ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.crm_pipeline_stages ADD COLUMN IF NOT EXISTS sandbox_seed_manifest_id UUID REFERENCES public.action_sandbox_seed_manifests(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sandbox_seed_manifest_id UUID REFERENCES public.action_sandbox_seed_manifests(id) ON DELETE SET NULL;
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS sandbox_seed_manifest_id UUID REFERENCES public.action_sandbox_seed_manifests(id) ON DELETE SET NULL;
ALTER TABLE public.action_mission_metrics ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_org_demo ON public.crm_pipelines(organization_id,is_demo) WHERE is_active=TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_org_demo ON public.leads(organization_id,is_demo);
CREATE INDEX IF NOT EXISTS idx_interactions_org_demo ON public.interactions(organization_id,is_demo);

ALTER TABLE public.action_mission_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_mission_recipes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_mission_recipes_read ON public.action_mission_recipes;
DROP POLICY IF EXISTS action_mission_recipes_write ON public.action_mission_recipes;
CREATE POLICY action_mission_recipes_read ON public.action_mission_recipes FOR SELECT USING (TRUE);
CREATE POLICY action_mission_recipes_write ON public.action_mission_recipes FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

DO $mission_sandbox_rls$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['action_sandbox_seed_manifests','action_sandbox_seed_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_read', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_write', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (private.rls_can_access_organization(organization_id))', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal())', table_name || '_write', table_name);
  END LOOP;
END;
$mission_sandbox_rls$;

INSERT INTO public.platform_modules (key,name,base,internal_route,portal_route,required_permissions)
VALUES ('mission_sandbox','Sandbox de Missões',FALSE,'/missions','/portal/missoes',ARRAY['action_engine.write']::TEXT[])
ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,required_permissions=EXCLUDED.required_permissions,updated_at=NOW();

INSERT INTO public.action_mission_recipes (
  key,version,title,sector,status,pack_selections,default_goal,editable_keys,content_hash,published_at
) VALUES (
  'funnel_nurture_real_estate',1,'Funil + nutrição para imobiliária','real_estate','published',
  '[{"key":"funnel_nurture","version":"1.0.0","contentHash":"d2f3f6fcd4a1778c8196737659d550f4886103ba78b6fb3db33a45a41675c97a"}]'::JSONB,
  '{"title":"Funil e nutrição para imobiliária","objective":"Criar um funil consultivo para compradores de imóveis e uma sequência educativa de três e-mails, respeitando consentimento e a base publicada.","mode":"shadow","allowedModules":["crm","automations","funnel_nurture_agent"],"maxTotalCostBrl":"500","maxHumanHours":"4","maxExternalContacts":0,"expectedValueBrl":"10000"}'::JSONB,
  ARRAY['title','objective','mode','maxTotalCostBrl','maxHumanHours','maxExternalContacts','expectedValueBrl'],
  'b338b51fa563ef8523d0942c2d3d71cd3b538bc88b1428409b596bb15c8fee35',NOW()
)
ON CONFLICT (key,version) DO NOTHING;
