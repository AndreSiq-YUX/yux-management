-- Commercial automation sequences: multichannel rules and conversion metadata.

ALTER TABLE public.crm_sequences
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('email', 'whatsapp', 'mixed')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  ADD COLUMN IF NOT EXISTS sector_template_key TEXT,
  ADD COLUMN IF NOT EXISTS conversion_goal TEXT,
  ADD COLUMN IF NOT EXISTS active_enrollment_count INTEGER NOT NULL DEFAULT 0 CHECK (active_enrollment_count >= 0),
  ADD COLUMN IF NOT EXISTS converted_enrollment_count INTEGER NOT NULL DEFAULT 0 CHECK (converted_enrollment_count >= 0);

ALTER TABLE public.crm_sequence_steps
  ADD COLUMN IF NOT EXISTS step_kind TEXT NOT NULL DEFAULT 'message' CHECK (step_kind IN ('message', 'delay', 'task', 'ai', 'webhook')),
  ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IS NULL OR channel IN ('email', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object');

CREATE INDEX IF NOT EXISTS idx_crm_sequences_channel_status ON public.crm_sequences(organization_id, channel, status);
CREATE INDEX IF NOT EXISTS idx_crm_sequences_sector ON public.crm_sequences(sector_template_key, status);

NOTIFY pgrst, 'reload schema';
