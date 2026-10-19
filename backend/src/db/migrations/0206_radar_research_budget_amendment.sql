-- Capacity amendments never reset effect history or consume retry approvals.
ALTER TABLE public.radar_research_requests ADD COLUMN budget_revision INTEGER NOT NULL DEFAULT 1 CHECK(budget_revision>0);
ALTER TABLE public.radar_research_requests ADD COLUMN budget_authorizations JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(budget_authorizations)='array');
ALTER TABLE public.radar_research_request_items ADD COLUMN resume_pending BOOLEAN NOT NULL DEFAULT FALSE;
