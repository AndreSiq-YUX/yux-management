BEGIN;

CREATE TABLE IF NOT EXISTS public.action_campaign_optimization_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.action_plans(id) ON DELETE RESTRICT,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  campaign_version_id UUID NOT NULL REFERENCES public.campaign_mission_versions(id) ON DELETE RESTRICT,
  checkpoint_key TEXT NOT NULL CHECK (BTRIM(checkpoint_key) <> ''),
  window_started_at TIMESTAMPTZ NOT NULL,
  metric_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metric_snapshot) = 'object'),
  decision TEXT NOT NULL CHECK (decision IN ('observe','continue','pause','decrease_budget','increase_budget','creative_draft')),
  rationale JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(rationale) = 'object'),
  proposed_action JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(proposed_action) = 'object'),
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL CHECK (status IN ('observed','action_proposed','pending_approval','executed','rejected','superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, checkpoint_key)
);

CREATE INDEX IF NOT EXISTS idx_action_campaign_optimization_due
  ON public.action_campaign_optimization_checkpoints(organization_id, mission_id, window_started_at DESC);

ALTER TABLE public.action_campaign_optimization_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_campaign_optimization_checkpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_campaign_optimization_checkpoints_tenant ON public.action_campaign_optimization_checkpoints;
CREATE POLICY action_campaign_optimization_checkpoints_tenant ON public.action_campaign_optimization_checkpoints
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

INSERT INTO public.action_packs (key, name, description)
VALUES ('campaign_optimization', 'Campaign Optimization', 'Avalia campanhas continuamente e propõe uma única ação limitada por checkpoint.')
ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,updated_at=NOW();

WITH pack AS (SELECT id FROM public.action_packs WHERE key='campaign_optimization')
INSERT INTO public.action_pack_versions (pack_id,semantic_version,schema_version,outcome_type,status,definition,content_hash,published_at)
SELECT pack.id,'1.0.0',1,'continuous_campaign_optimization','published_for_internal_pilot',$definition$
{
  "schemaVersion":1,
  "parameterSchema":{"type":"object","required":["campaignId","campaignVersionId","targetCplBrl","maximumCplBrl","maxBudgetAdjustmentPercent"],"properties":{"campaignId":{"type":"string","format":"uuid"},"campaignVersionId":{"type":"string","format":"uuid"},"checkpointFrequency":{"enum":["hourly","daily"]},"minimumImpressions":{"type":"integer"},"minimumClicks":{"type":"integer"},"minimumLeadsForScale":{"type":"integer"},"minimumCtr":{"type":"string","format":"decimal"},"targetCplBrl":{"type":"string","format":"decimal"},"maximumCplBrl":{"type":"string","format":"decimal"},"maxBudgetAdjustmentPercent":{"type":"string","format":"decimal","maximum":20}}},
  "readinessSpec":{"requiredModules":["campaigns","campaign_launch_agent","campaign_optimization_agent"],"requiredConnections":["ads_provider"],"requiredKnowledge":["brand.rules"],"correctionLinks":{"provider":"/integrations","contract":"/platform/contracts","knowledge":"/knowledge"}},
  "topologyTemplate":{"steps":[
    {"stepKey":"pack.readiness","capabilityKey":"system.readiness.check","capabilityVersion":1,"dependsOn":[],"approvalRequired":false,"protected":true,"defaultParameters":{"requiredModules":["campaigns","campaign_launch_agent","campaign_optimization_agent"],"requiredConnections":["ads_provider"]}},
    {"stepKey":"pack.collect_metrics","capabilityKey":"campaign.metrics.snapshot","capabilityVersion":1,"dependsOn":["pack.readiness"],"approvalRequired":false,"protected":true,"defaultParameters":{"campaignId":"runtime"}},
    {"stepKey":"pack.evaluate_guardrails","capabilityKey":"campaign.optimization.evaluate","capabilityVersion":1,"dependsOn":["pack.collect_metrics"],"approvalRequired":false,"protected":true,"defaultParameters":{"campaignId":"runtime"}},
    {"stepKey":"pack.record_checkpoint","capabilityKey":"system.evaluation.checkpoint","capabilityVersion":1,"dependsOn":["pack.evaluate_guardrails"],"approvalRequired":false,"protected":true,"defaultParameters":{"checkpointKey":"campaign_optimization","targetRevenueBrl":"0"}}
  ]},
  "protectedStepKeys":["pack.readiness","pack.collect_metrics","pack.evaluate_guardrails","pack.record_checkpoint"],
  "extensionPoints":[{"key":"bounded_optimization_action","afterStepKey":"pack.evaluate_guardrails","beforeStepKey":"pack.record_checkpoint","allowedCapabilities":[{"key":"campaign.provider.pause","versions":[1]},{"key":"campaign.budget.decrease_bounded","versions":[1]},{"key":"campaign.budget.increase","versions":[1]},{"key":"marketing.creative.optimization_draft","versions":[1]}],"maxAdditionalSteps":1}],
  "allowedCapabilities":[{"key":"system.readiness.check","versions":[1],"required":true},{"key":"campaign.metrics.snapshot","versions":[1],"required":true},{"key":"campaign.optimization.evaluate","versions":[1],"required":true},{"key":"system.evaluation.checkpoint","versions":[1],"required":true},{"key":"campaign.provider.pause","versions":[1],"required":false},{"key":"campaign.budget.decrease_bounded","versions":[1],"required":false},{"key":"campaign.budget.increase","versions":[1],"required":false},{"key":"marketing.creative.optimization_draft","versions":[1],"required":false}],
  "metricSpec":{"primary":["leads","qualified_leads","attributed_revenue_brl"],"leading":["impressions","clicks","ctr"],"economics":["spend_brl","cpl_brl"],"guardrails":["tracking_known","maximum_cpl_brl","max_budget_adjustment_percent"],"unknownPolicy":"pause_when_tracking_is_unknown_after_campaign_activation"},
  "economicsSpec":{"currency":"BRL","formulas":{"cpl":"spendBrl/leads","ctr":"clicks/impressions"},"zeroDenominator":"not_applicable","trackFromFirstRun":true},
  "policyDefaults":{"mode":"autonomous","ownershipMode":"exclusive","conflictPolicy":"mission_wins","maximumBudgetAdjustmentPercent":20,"budgetIncreaseApprovalRequired":true,"creativePublicationApprovalRequired":true,"deterministicCheckpointRequired":true,"capabilitiesDisabledByDefault":true},
  "artifactContract":{"consumes":[{"key":"campaign.launch","schemaVersion":1,"optional":false}],"produces":[{"key":"campaign.optimization_checkpoint","schemaVersion":1}]}
}
$definition$::JSONB,'e7cf436d66cd1d8b53848d372f99c6497fb4aa48a6dea0fabf80644ca233dcaf',NOW()
FROM pack ON CONFLICT (pack_id,semantic_version) DO NOTHING;

INSERT INTO public.platform_modules (key,name,base,internal_route,portal_route,required_permissions)
VALUES ('campaign_optimization_agent','Agente de Otimização de Campanhas',FALSE,'/missions','/portal/missoes',ARRAY['action_engine.read']::TEXT[])
ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,internal_route=EXCLUDED.internal_route,portal_route=EXCLUDED.portal_route,required_permissions=EXCLUDED.required_permissions,updated_at=NOW();

INSERT INTO public.action_capability_policies (organization_id,capability_key,capability_version,enabled,kill_switch,approval_override)
SELECT organization.id,capability.key,1,FALSE,FALSE,capability.approval
FROM public.organizations organization
CROSS JOIN (VALUES
  ('campaign.provider.pause','risk_based'),
  ('campaign.budget.decrease_bounded','risk_based'),
  ('campaign.budget.increase','always'),
  ('marketing.creative.optimization_draft','never')
) capability(key,approval)
ON CONFLICT (organization_id,capability_key,capability_version) DO NOTHING;

COMMIT;
