DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_conversation_links', 'lead_ai_insights', 'lead_ai_field_suggestions',
    'lead_response_suggestions', 'lead_sla_events', 'lead_handoff_locks',
    'crm_quick_replies', 'crm_message_templates'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE EXCEPTION 'table missing: %', target_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = target_table
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not enabled: %', target_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'ai_summary'
  ) THEN
    RAISE EXCEPTION 'leads.ai_summary missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'last_conversation_at'
  ) THEN
    RAISE EXCEPTION 'leads.last_conversation_at missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'lead_id'
  ) THEN
    RAISE EXCEPTION 'conversations.lead_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_conversation_links'
      AND policyname = 'lead_conversation_links_select_accessible'
  ) THEN
    RAISE EXCEPTION 'lead_conversation_links select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_message_templates'
      AND policyname = 'crm_message_templates_manageable'
  ) THEN
    RAISE EXCEPTION 'crm_message_templates manageable policy missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.lead_ai_insights', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select lead_ai_insights';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.lead_response_suggestions', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot insert lead_response_suggestions';
  END IF;
END $$;
