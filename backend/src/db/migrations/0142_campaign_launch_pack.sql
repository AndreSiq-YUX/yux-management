INSERT INTO public.action_packs (key, name, description)
VALUES ('campaign_launch', 'Campaign Launch', 'Cria e monitora campanhas pagas governadas, sempre pausadas antes da aprovação de ativação.')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

WITH pack AS (SELECT id FROM public.action_packs WHERE key = 'campaign_launch')
INSERT INTO public.action_pack_versions (
  pack_id, semantic_version, schema_version, outcome_type, status, definition, content_hash, published_at
)
SELECT pack.id, '1.0.0', 1, 'paid_campaign_launch', 'published', $definition$
{
  "schemaVersion": 1,
  "parameterSchema": {
    "type": "object",
    "required": ["icp", "offer", "platform", "providerConnectionId", "dailyBudgetBrl", "totalBudgetBrl"],
    "properties": {
      "icp": {"type": "string"},
      "offer": {"type": "string"},
      "platform": {"enum": ["meta", "google"]},
      "providerConnectionId": {"type": "string", "format": "uuid"},
      "dailyBudgetBrl": {"type": "string", "format": "decimal"},
      "totalBudgetBrl": {"type": "string", "format": "decimal"},
      "targetLeads": {"type": "integer"},
      "maximumCplBrl": {"type": "string", "format": "decimal"},
      "observationDays": {"type": "integer"}
    }
  },
  "readinessSpec": {
    "requiredModules": ["campaigns", "landing_pages", "campaign_launch_agent"],
    "requiredConnections": ["ads_provider"],
    "requiredKnowledge": ["company.icp", "company.offer", "brand.rules"],
    "correctionLinks": {"provider": "/integrations", "contract": "/platform/contracts", "knowledge": "/knowledge"}
  },
  "topologyTemplate": {"steps": [
    {"stepKey":"pack.readiness","capabilityKey":"system.readiness.check","capabilityVersion":1,"dependsOn":[],"approvalRequired":false,"protected":true,"defaultParameters":{"requiredModules":["campaigns","landing_pages","campaign_launch_agent"],"requiredConnections":["ads_provider"]}},
    {"stepKey":"pack.inspect","capabilityKey":"campaign.state.inspect","capabilityVersion":1,"dependsOn":["pack.readiness"],"approvalRequired":false,"protected":true,"defaultParameters":{}},
    {"stepKey":"pack.draft_landing_page","capabilityKey":"landing_page.create_draft","capabilityVersion":1,"dependsOn":["pack.inspect"],"approvalRequired":false,"protected":true,"defaultParameters":{"artifactRef":"resolvedParameters.campaignLaunchArtifacts.acquisition.landingPage"}},
    {"stepKey":"pack.draft_lead_form","capabilityKey":"lead_form.configure_draft","capabilityVersion":1,"dependsOn":["pack.draft_landing_page"],"approvalRequired":false,"protected":true,"defaultParameters":{"artifactRef":"resolvedParameters.campaignLaunchArtifacts.acquisition.leadForm","landingPageId":"binding:pack.draft_landing_page.entityId"}},
    {"stepKey":"pack.validate_tracking","capabilityKey":"campaign.tracking.validate","capabilityVersion":1,"dependsOn":["pack.draft_lead_form"],"approvalRequired":false,"protected":true,"defaultParameters":{"artifactRef":"resolvedParameters.campaignLaunchArtifacts.acquisition.trackingPlan"}},
    {"stepKey":"pack.draft_campaign","capabilityKey":"campaign.create_draft","capabilityVersion":1,"dependsOn":["pack.validate_tracking"],"approvalRequired":false,"protected":true,"defaultParameters":{"artifactRef":"resolvedParameters.campaignLaunchArtifacts"}},
    {"stepKey":"pack.draft_creative","capabilityKey":"marketing.creative.generate_draft","capabilityVersion":1,"dependsOn":["pack.draft_campaign"],"approvalRequired":false,"protected":true,"defaultParameters":{"campaignVersionId":"binding:pack.draft_campaign.versionId","position":0,"artifactRef":"resolvedParameters.campaignLaunchArtifacts.creativeSet.creatives.0"}},
    {"stepKey":"pack.attach_creative","capabilityKey":"campaign.creative.attach_draft","capabilityVersion":1,"dependsOn":["pack.draft_creative"],"approvalRequired":false,"protected":true,"defaultParameters":{"campaignVersionId":"binding:pack.draft_campaign.versionId","creativeVersionId":"binding:pack.draft_creative.versionId","expectedContentHash":"binding:pack.draft_creative.contentHash"}},
    {"stepKey":"pack.attach_landing_page","capabilityKey":"campaign.acquisition.attach_draft","capabilityVersion":1,"dependsOn":["pack.attach_creative"],"approvalRequired":false,"protected":true,"defaultParameters":{"campaignVersionId":"binding:pack.draft_campaign.versionId","assetKind":"landing_page","sourceEntityId":"binding:pack.draft_landing_page.entityId","payload":{"versionId":"binding:pack.draft_landing_page.versionId","contentHash":"binding:pack.draft_landing_page.contentHash"}}},
    {"stepKey":"pack.attach_lead_form","capabilityKey":"campaign.acquisition.attach_draft","capabilityVersion":1,"dependsOn":["pack.attach_landing_page"],"approvalRequired":false,"protected":true,"defaultParameters":{"campaignVersionId":"binding:pack.draft_campaign.versionId","assetKind":"lead_form","sourceEntityId":"binding:pack.draft_lead_form.entityId","payload":{"contentHash":"binding:pack.draft_lead_form.contentHash"}}},
    {"stepKey":"pack.create_provider_paused","capabilityKey":"campaign.provider.create_paused","capabilityVersion":1,"dependsOn":["pack.attach_lead_form"],"approvalRequired":true,"protected":true,"defaultParameters":{"versionId":"binding:pack.draft_campaign.versionId","expectedContentHash":"binding:pack.draft_campaign.contentHash","approvedSubjectHash":"binding:pack.draft_campaign.contentHash","maxTotalBudgetBrl":"runtime"}},
    {"stepKey":"pack.approve_launch","capabilityKey":"system.approval.await","capabilityVersion":1,"dependsOn":["pack.create_provider_paused"],"approvalRequired":true,"protected":true,"defaultParameters":{"approvalType":"external_effect","subject":{"artifactSet":"campaign_launch","providerState":"paused"}}},
    {"stepKey":"pack.activate","capabilityKey":"campaign.provider.activate","capabilityVersion":1,"dependsOn":["pack.approve_launch"],"approvalRequired":true,"protected":true,"defaultParameters":{"versionId":"binding:pack.draft_campaign.versionId","expectedContentHash":"binding:pack.draft_campaign.contentHash","approvedSubjectHash":"binding:pack.draft_campaign.contentHash"}},
    {"stepKey":"pack.wait_observation","capabilityKey":"system.signal.wait","capabilityVersion":1,"dependsOn":["pack.activate"],"approvalRequired":false,"protected":true,"defaultParameters":{"durationHours":24}},
    {"stepKey":"pack.collect_metrics_and_costs","capabilityKey":"campaign.metrics.snapshot","capabilityVersion":1,"dependsOn":["pack.wait_observation"],"approvalRequired":false,"protected":true,"defaultParameters":{"campaignId":"binding:pack.draft_campaign.entityId"}},
    {"stepKey":"pack.evaluate","capabilityKey":"system.evaluation.checkpoint","capabilityVersion":1,"dependsOn":["pack.collect_metrics_and_costs"],"approvalRequired":false,"protected":true,"defaultParameters":{"checkpointKey":"campaign_launch_24h","targetRevenueBrl":"0"}}
  ]},
  "protectedStepKeys": ["pack.readiness","pack.inspect","pack.draft_landing_page","pack.draft_lead_form","pack.validate_tracking","pack.draft_campaign","pack.draft_creative","pack.attach_creative","pack.attach_landing_page","pack.attach_lead_form","pack.create_provider_paused","pack.approve_launch","pack.activate","pack.wait_observation","pack.collect_metrics_and_costs","pack.evaluate"],
  "extensionPoints": [{"key":"funnel_binding","afterStepKey":"pack.inspect","beforeStepKey":"pack.draft_landing_page","allowedCapabilities":[{"key":"crm.pipeline.inspect","versions":[1]}],"maxAdditionalSteps":1}],
  "allowedCapabilities": [
    {"key":"system.readiness.check","versions":[1],"required":true},
    {"key":"campaign.state.inspect","versions":[1],"required":true},
    {"key":"landing_page.create_draft","versions":[1],"required":true},
    {"key":"lead_form.configure_draft","versions":[1],"required":true},
    {"key":"campaign.tracking.validate","versions":[1],"required":true},
    {"key":"campaign.create_draft","versions":[1],"required":true},
    {"key":"marketing.creative.generate_draft","versions":[1],"required":true},
    {"key":"campaign.creative.attach_draft","versions":[1],"required":true},
    {"key":"campaign.acquisition.attach_draft","versions":[1],"required":true},
    {"key":"campaign.provider.create_paused","versions":[1],"required":true},
    {"key":"system.approval.await","versions":[1],"required":true},
    {"key":"campaign.provider.activate","versions":[1],"required":true},
    {"key":"system.signal.wait","versions":[1],"required":true},
    {"key":"campaign.metrics.snapshot","versions":[1],"required":true},
    {"key":"system.evaluation.checkpoint","versions":[1],"required":true},
    {"key":"crm.pipeline.inspect","versions":[1],"required":false},
    {"key":"campaign.provider.pause","versions":[1],"required":false}
  ],
  "metricSpec": {
    "primary": [
      {"key":"leads","unit":"count"},
      {"key":"qualified_leads","unit":"count"},
      {"key":"attributed_revenue_brl","unit":"BRL","attributionPolicy":{"version":1,"model":"last_touch","windowDays":30,"eligibleEventTypes":["campaign_click","landing_page_submit","lead_created","invoice_paid"],"identityResolution":"exact_campaign_utm_or_declared_lead_binding","currency":"BRL","lateEvents":"reopen_evaluation"},"attributionPolicyHash":"8d728ee563795fd2cae396e52397ee902454308c4f641c2f4d4061870497f5fa"}
    ],
    "leading": ["impressions","clicks","ctr","landing_conversion_rate"],
    "economics": ["spend_brl","total_execution_cost_brl","cpl_brl","mroi"],
    "guardrails": ["total_budget_brl","daily_budget_brl","consent_blocks","tracking_failure","complaint_rate"],
    "unknownPolicy": "revenue_and_mroi_unknown_when_identity_or_tracking_unresolved"
  },
  "economicsSpec": {
    "currency":"BRL",
    "formulas":{"totalCost":"spendBrl+sum(actual_cost_entries_brl)","cpl":"totalCost/leads","mroi":"(attributedRevenueBrl-totalCost)/totalCost","valueCostRatio":"attributedRevenueBrl/totalCost","valuePerHumanHour":"attributedRevenueBrl/humanHours"},
    "zeroDenominator":"not_applicable",
    "trackFromFirstRun":true
  },
  "policyDefaults": {
    "mode":"assisted","ownershipMode":"exclusive","conflictPolicy":"mission_wins","providerCreatePaused":true,
    "activationApprovalRequired":true,"budgetChangeApprovalRequired":true,"activationContractFlag":"campaign_launch_agent",
    "activationCapabilitiesDisabledByDefault":true
  }
}
$definition$::jsonb, '12bca835d568aa49e0a2fb1b4f652d45382adc3c2ce86c7aceac1c4bd305de2d', NOW()
FROM pack
ON CONFLICT (pack_id, semantic_version) DO NOTHING;

INSERT INTO public.action_capability_policies (
  organization_id, capability_key, capability_version, enabled, kill_switch, approval_override
)
SELECT organization.id, capability.key, 1, FALSE, FALSE, 'always'
FROM public.organizations organization
CROSS JOIN (VALUES
  ('campaign.provider.create_paused'),
  ('campaign.provider.activate')
) capability(key)
ON CONFLICT (organization_id, capability_key, capability_version) DO NOTHING;

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES (
  'campaign_launch_agent',
  'Agente de Lançamento de Campanhas',
  FALSE,
  '/missions',
  '/portal/missoes',
  ARRAY['action_engine.read']::TEXT[]
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route,
  required_permissions = EXCLUDED.required_permissions,
  updated_at = NOW();

-- O pack fica publicado, mas o contrato e as mutações no provedor exigem
-- rollout operacional explícito por organização.
