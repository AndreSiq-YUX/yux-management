-- Only the new explicit extraction action is added. No provider/model/route is
-- created or enabled, and no candidate is admitted by this migration.
ALTER TABLE public.radar_analysis_receipts DROP CONSTRAINT radar_analysis_receipts_action_check;
ALTER TABLE public.radar_analysis_receipts ADD CONSTRAINT radar_analysis_receipts_action_check
 CHECK(action IN('radar_presence_resolution','radar_business_qualification','radar_discovery_extraction'));
