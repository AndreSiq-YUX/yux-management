-- Reuse the existing explicit, expiring, single-consumption retry protocol.
-- Its route version snapshot also binds decision_config (versioned by trigger).
ALTER TABLE public.radar_analysis_retry_authorizations DROP CONSTRAINT radar_analysis_retry_authorizations_action_check;
ALTER TABLE public.radar_analysis_retry_authorizations ADD CONSTRAINT radar_analysis_retry_authorizations_action_check
 CHECK(action IN('radar_presence_resolution','radar_business_qualification','radar_initial_triage','radar_next_action','radar_quality_gate'));
