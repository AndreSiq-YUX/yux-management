-- Persist the existing in-app alert switches with their project.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS notification_rules JSONB NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(notification_rules) = 'object');
