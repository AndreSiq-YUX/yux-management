-- An explicit new intent may authorize additional work. It never resets usage,
-- clears an uncertain receipt or advances discovery on its own.
ALTER TABLE public.radar_research_request_items ADD COLUMN research_budget JSONB;
ALTER TABLE public.radar_capture_operations ADD COLUMN research_budget_authorizations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(research_budget_authorizations)='array');
