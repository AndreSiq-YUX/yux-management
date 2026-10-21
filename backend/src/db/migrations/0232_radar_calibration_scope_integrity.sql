-- Keep tenant identity in the calibration FK and follow existing campaign
-- deletion semantics. This does not expose any delete privilege to the API.
ALTER TABLE public.radar_campaign_gate_calibrations ADD CONSTRAINT radar_campaign_calibration_campaign_scope
 FOREIGN KEY(campaign_id,organization_id) REFERENCES public.radar_campaigns(id,organization_id) ON DELETE CASCADE;
ALTER TABLE public.radar_gate_evaluation_cases DROP CONSTRAINT radar_gate_evaluation_cases_candidate_id_organization_id_c_fkey;
ALTER TABLE public.radar_gate_evaluation_cases ADD CONSTRAINT radar_gate_evaluation_candidate_scope
 FOREIGN KEY(candidate_id,organization_id,campaign_id) REFERENCES public.radar_candidate_records(id,organization_id,campaign_id) ON DELETE CASCADE;
