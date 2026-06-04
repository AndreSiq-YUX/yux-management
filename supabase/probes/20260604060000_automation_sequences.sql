DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_sequences'
      AND column_name = 'channel'
  ) THEN
    RAISE EXCEPTION 'crm_sequences.channel missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_sequence_steps'
      AND column_name = 'step_kind'
  ) THEN
    RAISE EXCEPTION 'crm_sequence_steps.step_kind missing';
  END IF;
END $$;
