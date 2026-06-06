DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'vector extension missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'marketing_brand_profiles',
        'marketing_products_services',
        'marketing_knowledge_documents',
        'marketing_knowledge_chunks'
      )
      AND rowsecurity = FALSE
  ) THEN
    RAISE EXCEPTION 'marketing knowledge tables without RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_knowledge_chunks'
      AND column_name = 'embedding'
  ) THEN
    RAISE EXCEPTION 'marketing knowledge embedding column missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'match_marketing_knowledge'
  ) THEN
    RAISE EXCEPTION 'match_marketing_knowledge rpc missing';
  END IF;
END $$;
