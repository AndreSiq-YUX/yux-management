-- Configurable, deterministic and append-only lead scoring.

CREATE TABLE IF NOT EXISTS public.lead_scoring_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  fit_weight INTEGER NOT NULL DEFAULT 40 CHECK (fit_weight BETWEEN 0 AND 100),
  intent_weight INTEGER NOT NULL DEFAULT 60 CHECK (intent_weight BETWEEN 0 AND 100),
  thresholds JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(thresholds) = 'array'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fit_weight + intent_weight = 100)
);

CREATE TABLE IF NOT EXISTS public.lead_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.lead_scoring_models(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  dimension TEXT NOT NULL CHECK (dimension IN ('fit', 'intent')),
  event_type TEXT NOT NULL CHECK (BTRIM(event_type) <> ''),
  field_path TEXT,
  operator TEXT CHECK (operator IS NULL OR operator IN ('equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists')),
  comparison_value JSONB,
  points INTEGER NOT NULL CHECK (points BETWEEN -100 AND 100 AND points <> 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.lead_scoring_rules(id) ON DELETE SET NULL,
  event_key TEXT NOT NULL CHECK (BTRIM(event_key) <> ''),
  event_type TEXT NOT NULL CHECK (BTRIM(event_type) <> ''),
  dimension TEXT NOT NULL CHECK (dimension IN ('fit', 'intent')),
  points INTEGER NOT NULL CHECK (points BETWEEN -100 AND 100 AND points <> 0),
  previous_score INTEGER NOT NULL CHECK (previous_score BETWEEN 0 AND 100),
  resulting_score INTEGER NOT NULL CHECK (resulting_score BETWEEN 0 AND 100),
  context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, event_key)
);

-- If a database already contains more than one active model, retain only the
-- most recently updated one before enforcing the invariant.
WITH ranked_active_models AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY crm_instance_id
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS rank_number
  FROM public.lead_scoring_models
  WHERE is_active = TRUE
)
UPDATE public.lead_scoring_models model
SET is_active = FALSE,
    updated_at = NOW()
FROM ranked_active_models ranked
WHERE model.id = ranked.id
  AND ranked.rank_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_scoring_one_active_model
  ON public.lead_scoring_models(crm_instance_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lead_scoring_rules_model_active
  ON public.lead_scoring_rules(model_id, is_active, event_type, created_at, id);

CREATE INDEX IF NOT EXISTS idx_lead_score_events_lead_occurred
  ON public.lead_score_events(lead_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_lead_score_events_instance_type_occurred
  ON public.lead_score_events(crm_instance_id, event_type, occurred_at DESC, id DESC);

-- New active CRM instances start with a neutral 40/60 model. Rules remain
-- empty until the client configures them.
INSERT INTO public.lead_scoring_models (crm_instance_id, name, fit_weight, intent_weight)
SELECT instance.id, 'Modelo padrão', 40, 60
FROM public.crm_instances instance
WHERE instance.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.lead_scoring_models existing
    WHERE existing.crm_instance_id = instance.id
  );

ALTER TABLE public.lead_scoring_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scoring_models FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_scoring_models_select_access ON public.lead_scoring_models;
DROP POLICY IF EXISTS lead_scoring_models_insert_access ON public.lead_scoring_models;
DROP POLICY IF EXISTS lead_scoring_models_update_access ON public.lead_scoring_models;
CREATE POLICY lead_scoring_models_select_access ON public.lead_scoring_models
  FOR SELECT USING (private.can_access_crm_instance(crm_instance_id));
CREATE POLICY lead_scoring_models_insert_access ON public.lead_scoring_models
  FOR INSERT WITH CHECK (private.can_access_crm_instance(crm_instance_id));
CREATE POLICY lead_scoring_models_update_access ON public.lead_scoring_models
  FOR UPDATE USING (private.can_access_crm_instance(crm_instance_id))
  WITH CHECK (private.can_access_crm_instance(crm_instance_id));

ALTER TABLE public.lead_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scoring_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_scoring_rules_select_access ON public.lead_scoring_rules;
DROP POLICY IF EXISTS lead_scoring_rules_insert_access ON public.lead_scoring_rules;
DROP POLICY IF EXISTS lead_scoring_rules_update_access ON public.lead_scoring_rules;
CREATE POLICY lead_scoring_rules_select_access ON public.lead_scoring_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.lead_scoring_models model
      WHERE model.id = lead_scoring_rules.model_id
        AND private.can_access_crm_instance(model.crm_instance_id)
    )
  );
CREATE POLICY lead_scoring_rules_insert_access ON public.lead_scoring_rules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lead_scoring_models model
      WHERE model.id = lead_scoring_rules.model_id
        AND private.can_access_crm_instance(model.crm_instance_id)
    )
  );
CREATE POLICY lead_scoring_rules_update_access ON public.lead_scoring_rules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.lead_scoring_models model
      WHERE model.id = lead_scoring_rules.model_id
        AND private.can_access_crm_instance(model.crm_instance_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lead_scoring_models model
      WHERE model.id = lead_scoring_rules.model_id
        AND private.can_access_crm_instance(model.crm_instance_id)
    )
  );

ALTER TABLE public.lead_score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_score_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_score_events_select_access ON public.lead_score_events;
DROP POLICY IF EXISTS lead_score_events_insert_access ON public.lead_score_events;
CREATE POLICY lead_score_events_select_access ON public.lead_score_events
  FOR SELECT USING (private.can_access_crm_instance(crm_instance_id));
CREATE POLICY lead_score_events_insert_access ON public.lead_score_events
  FOR INSERT WITH CHECK (private.can_access_crm_instance(crm_instance_id));

REVOKE ALL ON public.lead_scoring_models FROM PUBLIC;
REVOKE ALL ON public.lead_scoring_rules FROM PUBLIC;
REVOKE ALL ON public.lead_score_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.lead_scoring_models TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.lead_scoring_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.lead_score_events TO authenticated, service_role;
