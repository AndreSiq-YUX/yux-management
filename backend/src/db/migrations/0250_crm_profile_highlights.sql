ALTER TABLE public.crm_custom_field_definitions
  ADD COLUMN is_highlighted BOOLEAN NOT NULL DEFAULT FALSE;
