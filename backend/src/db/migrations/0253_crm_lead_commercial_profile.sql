ALTER TABLE public.leads
  ADD COLUMN website_url TEXT,
  ADD COLUMN address TEXT,
  ADD COLUMN cnpj TEXT,
  ADD COLUMN commercial_profile JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(commercial_profile) = 'object');
