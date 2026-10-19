-- Store the independent verification used for an association, not only its conclusion.
ALTER TABLE public.radar_business_observations
 ADD COLUMN verification JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(verification)='object'),
 ADD COLUMN external_identity JSONB CHECK(external_identity IS NULL OR jsonb_typeof(external_identity)='object');
