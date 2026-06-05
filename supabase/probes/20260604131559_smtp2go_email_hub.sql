DO $$
BEGIN
  IF to_regclass('public.email_provider_connections') IS NULL THEN
    RAISE EXCEPTION 'email_provider_connections missing';
  END IF;

  IF to_regclass('public.smtp2go_subaccounts') IS NULL THEN
    RAISE EXCEPTION 'smtp2go_subaccounts missing';
  END IF;

  IF to_regclass('public.email_send_requests') IS NULL THEN
    RAISE EXCEPTION 'email_send_requests missing';
  END IF;

  IF to_regclass('public.email_suppression_entries') IS NULL THEN
    RAISE EXCEPTION 'email_suppression_entries missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.email_send_requests', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select email_send_requests';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.email_send_events', 'INSERT') THEN
    RAISE EXCEPTION 'service_role cannot insert email_send_events';
  END IF;
END $$;
