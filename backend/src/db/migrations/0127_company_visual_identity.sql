-- Structured visual identity shared by onboarding, marketing and AI agents.

ALTER TABLE public.marketing_brand_profiles
  ADD COLUMN IF NOT EXISTS visual_identity JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_brand_profiles_visual_identity_object_check'
  ) THEN
    ALTER TABLE public.marketing_brand_profiles
      ADD CONSTRAINT marketing_brand_profiles_visual_identity_object_check
      CHECK (jsonb_typeof(visual_identity) = 'object');
  END IF;
END;
$$;

COMMENT ON COLUMN public.marketing_brand_profiles.visual_identity IS
  'Logo, palette, typography, imagery style and graphic patterns used by marketing and AI agents.';
