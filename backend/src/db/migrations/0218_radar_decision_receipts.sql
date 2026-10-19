-- Extend the existing per-attempt ledger. No models or paid effects activated.
ALTER TABLE public.radar_analysis_receipts DROP CONSTRAINT radar_analysis_receipts_action_check;
ALTER TABLE public.radar_analysis_receipts ADD CONSTRAINT radar_analysis_receipts_action_check
 CHECK(action IN('radar_presence_resolution','radar_business_qualification','radar_discovery_extraction',
 'radar_initial_triage','radar_next_action','radar_quality_gate'));
