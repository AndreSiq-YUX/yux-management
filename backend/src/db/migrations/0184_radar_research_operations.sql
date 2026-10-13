-- Explicit research generations and retry identity; does not enable paid services.
ALTER TABLE public.radar_candidate_research_runs ADD COLUMN request_id UUID;
ALTER TABLE public.radar_candidate_research_runs ADD COLUMN operation TEXT NOT NULL DEFAULT 'complete'
  CHECK (operation IN ('complete','resume','refresh','reanalyze'));
CREATE UNIQUE INDEX radar_research_request_idx ON public.radar_candidate_research_runs(organization_id,candidate_id,request_id)
  WHERE request_id IS NOT NULL;
