-- Capture replies before domain validation. No provider, route, budget or replay
-- permission is enabled; old uncertain receipts remain uncertain without a body.
ALTER TABLE public.radar_analysis_receipts
 ADD COLUMN input_request JSONB,
 ADD COLUMN lease_until TIMESTAMPTZ,
 ADD CONSTRAINT radar_analysis_receipt_effect_scope UNIQUE(id,organization_id);

CREATE TABLE public.radar_effect_receipts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL,
 effect_key TEXT NOT NULL CHECK(length(effect_key) BETWEEN 1 AND 400),
 attempt INTEGER NOT NULL CHECK(attempt>0),
 analysis_receipt_id UUID NOT NULL,
 owner_token UUID NOT NULL,
 input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 lease_until TIMESTAMPTZ NOT NULL,
 transport_outcome TEXT NOT NULL DEFAULT 'not_started' CHECK(transport_outcome IN ('not_started','rejected','received','uncertain')),
 validation_outcome TEXT NOT NULL DEFAULT 'pending' CHECK(validation_outcome IN ('pending','valid','invalid')),
 billing_outcome TEXT NOT NULL DEFAULT 'uncertain' CHECK(billing_outcome IN ('known','estimated','uncertain')),
 response_body JSONB,
 usage JSONB,
 provider TEXT,model_snapshot TEXT,external_request_id TEXT,
 failure_code TEXT CHECK(failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{0,159}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,effect_key,attempt),
 FOREIGN KEY(analysis_receipt_id,organization_id) REFERENCES public.radar_analysis_receipts(id,organization_id) ON DELETE CASCADE,
 CHECK(transport_outcome<>'received' OR response_body IS NOT NULL),
 CHECK(validation_outcome<>'valid' OR transport_outcome='received'),
 CHECK(response_body IS NULL OR octet_length(response_body::text)<=1000000)
);
CREATE INDEX radar_effect_receipts_analysis_idx ON public.radar_effect_receipts(analysis_receipt_id,attempt DESC);
CREATE INDEX radar_effect_receipts_attention_idx ON public.radar_effect_receipts(organization_id,created_at) WHERE validation_outcome<>'valid';
ALTER TABLE public.radar_effect_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_effect_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_effect_receipts FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT ON public.radar_effect_receipts TO yux_api,yux_worker,yux_runtime;
GRANT INSERT,UPDATE ON public.radar_effect_receipts TO yux_runtime;
CREATE POLICY radar_effect_service ON public.radar_effect_receipts FOR ALL TO yux_api,yux_worker,yux_runtime
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY radar_effect_tenant_scope ON public.radar_effect_receipts AS RESTRICTIVE FOR ALL
 USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
