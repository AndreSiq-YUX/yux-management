DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'yux_strategy_doctrines',
        'yux_strategy_skills',
        'yux_strategy_skill_sections',
        'yux_strategy_agent_profiles',
        'yux_strategy_agent_profile_skills',
        'yux_strategy_agent_bindings',
        'yux_strategy_profile_tool_policies',
        'yux_strategy_profile_action_policies',
        'yux_commercial_stage_definitions',
        'yux_contact_stage_events',
        'ai_assistant_routing_rules',
        'yux_strategy_source_documents',
        'yux_strategy_source_pages',
        'yux_strategy_source_chunks',
        'yux_strategy_source_assets',
        'yux_strategy_concept_cards',
        'yux_strategy_card_embeddings',
        'yux_strategy_chunk_embeddings',
        'yux_strategy_asset_embeddings',
        'yux_strategy_retrieval_queries',
        'yux_metrics_cash_snapshots',
        'yux_metrics_funnel_stage_snapshots',
        'yux_metrics_channel_snapshots',
        'yux_metrics_recovery_opportunities',
        'yux_objection_categories',
        'yux_objection_events',
        'yux_objection_playbook_items',
        'yux_offer_improvement_suggestions',
        'yux_strategy_agent_handoffs',
        'yux_strategy_agent_recommendations',
        'yux_strategy_outcome_events',
        'yux_strategy_learning_signals'
      )
      AND rowsecurity = FALSE
  ) THEN
    RAISE EXCEPTION 'strategy engine tables without RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_assistants'
      AND column_name IN ('assistant_role', 'strategy_profile_id', 'routing_priority', 'routing_metadata')
    GROUP BY table_name
    HAVING COUNT(*) = 4
  ) THEN
    RAISE EXCEPTION 'ai_assistants strategy routing columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name IN (
        'conversation_current_role',
        'conversation_current_strategy_profile_id',
        'conversation_stage',
        'last_handoff_id',
        'role_locked_until'
      )
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN
    RAISE EXCEPTION 'conversation strategy ownership columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name IN (
        'commercial_stage',
        'lead_temperature',
        'source_channel',
        'last_meaningful_touch_at',
        'last_human_touch_at',
        'last_ai_touch_at',
        'next_best_action',
        'main_objection',
        'fit_status',
        'handoff_status',
        'customer_lifecycle_stage'
      )
    GROUP BY table_name
    HAVING COUNT(*) = 11
  ) THEN
    RAISE EXCEPTION 'lead commercial strategy columns missing';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.yux_strategy_agent_profiles
    WHERE profile_key IN (
      'growth_strategist',
      'crm_controller',
      'ai_sdr_comercial_1',
      'ai_closer',
      'support_assistant',
      'customer_growth_comercial_2',
      'revenue_recovery',
      'offer_conversion',
      'marketing_strategist',
      'referral_growth',
      'metrics_cash_mroi',
      'proposal_delivery'
    )
  ) <> 12 THEN
    RAISE EXCEPTION 'strategy profiles seed incomplete';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.yux_commercial_stage_definitions
    WHERE stage_key IN (
      'anonymous',
      'follower',
      'lead_cold',
      'lead_warm',
      'raised_hand',
      'qualified_opportunity',
      'almost_customer',
      'non_customer',
      'first_purchase_customer',
      'recurring_customer',
      'ex_customer',
      'referral',
      'bad_fit'
    )
  ) <> 13 THEN
    RAISE EXCEPTION 'commercial stage seed incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.yux_strategy_agent_bindings b
    JOIN public.yux_strategy_agent_profiles p ON p.id = b.profile_id
    WHERE b.binding_type = 'marketing_agent_type'
      AND b.marketing_agent_type = 'content_radar'
      AND p.profile_key = 'marketing_strategist'
      AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION 'content_radar strategy binding missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.yux_strategy_profile_action_policies ap
    JOIN public.yux_strategy_agent_profiles p ON p.id = ap.profile_id
    WHERE p.profile_key = 'ai_sdr_comercial_1'
      AND ap.action_key = 'activate_campaign'
      AND ap.policy = 'deny'
  ) THEN
    RAISE EXCEPTION 'SDR forbidden action policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.yux_strategy_profile_action_policies ap
    JOIN public.yux_strategy_agent_profiles p ON p.id = ap.profile_id
    WHERE p.profile_key = 'support_assistant'
      AND ap.action_key = 'send_sales_pressure_message'
      AND ap.policy = 'deny'
  ) THEN
    RAISE EXCEPTION 'support forbidden action policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.yux_strategy_profile_action_policies ap
    JOIN public.yux_strategy_agent_profiles p ON p.id = ap.profile_id
    WHERE p.profile_key = 'marketing_strategist'
      AND ap.action_key = 'publish_without_approval'
      AND ap.policy = 'deny'
  ) THEN
    RAISE EXCEPTION 'marketing strategist forbidden action policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.yux_strategy_doctrines
    WHERE doctrine_key = 'yux_growth_doctrine_core'
      AND visibility = 'internal_only'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'core internal strategy doctrine missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_source_documents'
      AND column_name IN (
        'source_scope',
        'visibility',
        'document_type',
        'source_title',
        'source_hash',
        'human_review_status'
      )
    GROUP BY table_name
    HAVING COUNT(*) = 6
  ) THEN
    RAISE EXCEPTION 'strategy source document columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_source_pages'
      AND column_name IN ('page_number', 'ocr_text', 'clean_text', 'image_storage_path')
    GROUP BY table_name
    HAVING COUNT(*) = 4
  ) THEN
    RAISE EXCEPTION 'strategy source page columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_source_chunks'
      AND column_name IN (
        'section_key',
        'chunk_text',
        'allowed_agent_profile_keys',
        'stage_tags',
        'retrieval_tags',
        'human_review_status'
      )
    GROUP BY table_name
    HAVING COUNT(*) = 6
  ) THEN
    RAISE EXCEPTION 'strategy source chunk columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_source_assets'
      AND column_name IN ('asset_type', 'storage_path', 'allowed_agent_profile_keys', 'stage_tags', 'retrieval_tags')
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN
    RAISE EXCEPTION 'strategy source asset columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_concept_cards'
      AND column_name IN (
        'concept',
        'category',
        'problem_solved',
        'trigger_signals',
        'diagnosis_questions',
        'decision_rules',
        'anti_patterns',
        'recommended_actions',
        'allowed_agent_profile_keys',
        'stage_tags',
        'retrieval_tags',
        'yux_modules',
        'requires_human_review',
        'human_review_status'
      )
    GROUP BY table_name
    HAVING COUNT(*) = 14
  ) THEN
    RAISE EXCEPTION 'strategy concept card columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_card_embeddings'
      AND column_name IN ('embedding_model', 'embedding_dimensions', 'embedding', 'embedding_values', 'content_hash')
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN
    RAISE EXCEPTION 'strategy card embedding columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_retrieval_queries'
      AND column_name IN (
        'profile_key',
        'query',
        'intent',
        'stage',
        'include_images',
        'portal_safe',
        'result_card_ids',
        'result_chunk_ids',
        'result_asset_ids',
        'context_chars'
      )
    GROUP BY table_name
    HAVING COUNT(*) = 10
  ) THEN
    RAISE EXCEPTION 'strategy retrieval query columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_yux_card_embeddings_vector'
  ) THEN
    RAISE EXCEPTION 'strategy card vector index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'yux_strategy_doctrines'
      AND policyname = 'Internal users manage strategy doctrines'
  ) THEN
    RAISE EXCEPTION 'strategy doctrine internal RLS policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_assistant_routing_rules'
      AND policyname = 'Omnichannel configurators manage assistant routing rules'
  ) THEN
    RAISE EXCEPTION 'assistant routing manage RLS policy missing';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.yux_objection_categories
    WHERE category_key IN (
      'price',
      'timing',
      'trust',
      'authority',
      'urgency',
      'product_fit',
      'competitor',
      'implementation_effort',
      'unclear_value',
      'no_response'
    )
  ) <> 10 THEN
    RAISE EXCEPTION 'objection category seed incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_metrics_cash_snapshots'
      AND column_name IN ('cac', 'ltv', 'roas', 'mroi', 'cash_priority')
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN
    RAISE EXCEPTION 'metrics cash snapshot columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_agent_recommendations'
      AND column_name IN ('objective', 'audience', 'stage', 'action', 'channel', 'owner', 'metric', 'next_step', 'supporting_cards')
    GROUP BY table_name
    HAVING COUNT(*) = 9
  ) THEN
    RAISE EXCEPTION 'strategy recommendation columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yux_strategy_outcome_events'
      AND column_name IN ('event_type', 'recommendation_id', 'handoff_id', 'lead_id', 'conversation_id', 'outcome_score')
    GROUP BY table_name
    HAVING COUNT(*) = 6
  ) THEN
    RAISE EXCEPTION 'strategy outcome event columns missing';
  END IF;
END $$;
