ALTER TABLE public.radar_campaigns
  ADD COLUMN search_configuration JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(search_configuration) = 'object'),
  ADD COLUMN configuration_revision INTEGER NOT NULL DEFAULT 1 CHECK (configuration_revision > 0);

-- Preserve the previously deployed campaign's criteria as editable campaign data.
-- No sector preset is used for newly created campaigns.
UPDATE public.radar_campaigns
SET target_cnaes = CASE WHEN cardinality(target_cnaes) = 0 THEN ARRAY['5620101'] ELSE target_cnaes END,
    search_configuration = jsonb_build_object(
      'activityScope', 'main_or_secondary',
      'qualification', jsonb_build_object(
        'includeAnyTerms', jsonb_build_array('cozinha industrial','alimentação coletiva','refeições corporativas',
          'refeições industriais','fornecimento de refeições para empresas','fornecimento de refeições a empresas'),
        'includeAllTerms', '[]'::jsonb, 'excludeTerms', '[]'::jsonb,
        'requireCnaeMatch', true, 'missingWebsite', 'review',
        'productTerms', to_jsonb(product_focus), 'productMatch', 'any'))
WHERE campaign_type = 'regional_b2b';

ALTER TABLE public.radar_campaigns DROP CONSTRAINT radar_campaigns_location_check;
ALTER TABLE public.radar_campaigns ADD CONSTRAINT radar_campaigns_location_check CHECK (
  (campaign_type = 'regional_b2b' AND target_city IS NULL AND target_state IS NULL
    AND cardinality(target_states) BETWEEN 1 AND 27
    AND target_states <@ ARRAY['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
      'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']::TEXT[])
  OR (campaign_type <> 'regional_b2b' AND target_city IS NOT NULL AND target_state IS NOT NULL
    AND BTRIM(target_city) <> '' AND BTRIM(target_state) <> '')
);

ALTER TABLE public.radar_regional_discovery_cursors
  DROP CONSTRAINT radar_regional_discovery_cursors_state_check,
  ADD COLUMN scope_key TEXT,
  ADD COLUMN city TEXT;
UPDATE public.radar_regional_discovery_cursors SET scope_key = 'v1:' || state || ':all';
ALTER TABLE public.radar_regional_discovery_cursors
  ALTER COLUMN scope_key SET NOT NULL,
  DROP CONSTRAINT radar_regional_discovery_cursors_pkey,
  ADD PRIMARY KEY (campaign_id, scope_key, provider),
  ADD CONSTRAINT radar_regional_discovery_cursors_state_check CHECK (
    state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
      'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'));

ALTER TABLE public.radar_b2b_reviews RENAME COLUMN kitchen_status TO target_status;
ALTER TABLE public.radar_b2b_reviews ADD COLUMN configuration_revision INTEGER NOT NULL DEFAULT 1;
CREATE INDEX radar_b2b_reviews_campaign_revision_idx
  ON public.radar_b2b_reviews (organization_id, campaign_id, configuration_revision);
