ALTER TABLE public.radar_capture_operations ADD COLUMN funnel_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN replenishment_start_queries INTEGER CHECK(replenishment_start_queries>=0),
 ADD COLUMN replenishment_stop_reason TEXT;
ALTER TABLE public.radar_capture_items ADD COLUMN initial_gate_status TEXT CHECK(initial_gate_status IN('pending','pass','block')),
 ADD COLUMN initial_gate_reason TEXT;
CREATE TABLE public.radar_cnae_catalog(code TEXT PRIMARY KEY CHECK(code~'^[0-9]{7}$'),description TEXT NOT NULL,search_text TEXT NOT NULL,hierarchy JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE public.radar_cnae_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_cnae_catalog FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_cnae_catalog FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT ON public.radar_cnae_catalog TO yux_api,yux_worker;
CREATE POLICY radar_cnae_reference_read ON public.radar_cnae_catalog FOR SELECT TO yux_api,yux_worker USING(TRUE);
