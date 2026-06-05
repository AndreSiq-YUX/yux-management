DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'automation_flows'
      AND column_name = 'builder_mode'
  ) THEN
    RAISE EXCEPTION 'automation_flows.builder_mode missing';
  END IF;

  IF to_regclass('public.automation_flow_versions') IS NULL THEN
    RAISE EXCEPTION 'automation_flow_versions missing';
  END IF;

  IF to_regclass('public.automation_simulation_runs') IS NULL THEN
    RAISE EXCEPTION 'automation_simulation_runs missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.automation_flow_versions', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select automation_flow_versions';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.automation_simulation_runs', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot insert automation_simulation_runs';
  END IF;
END $$;
