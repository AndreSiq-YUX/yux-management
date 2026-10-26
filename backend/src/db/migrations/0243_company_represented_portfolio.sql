ALTER TABLE public.organization_company_profiles ADD COLUMN business_models text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.organization_company_profiles ADD CONSTRAINT company_business_models_valid CHECK(business_models <@ ARRAY['service_provider','retailer','manufacturer','commercial_representative','distributor','other']::text[]);
CREATE TABLE public.company_represented_businesses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 client_id uuid REFERENCES public.clients(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 200),
 relationship_type text NOT NULL CHECK(relationship_type IN ('representation','distribution','both')),
 website_url text,description text NOT NULL DEFAULT '',
 service_regions text[] NOT NULL DEFAULT '{}',authorized_lines text[] NOT NULL DEFAULT '{}',
 commercial_conditions text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX company_represented_scope ON public.company_represented_businesses(organization_id,status,name);
ALTER TABLE public.company_represented_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_represented_businesses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_represented_businesses FROM PUBLIC,yux_runtime;
GRANT SELECT,INSERT,UPDATE ON public.company_represented_businesses TO yux_api,yux_worker;
CREATE POLICY represented_scope ON public.company_represented_businesses TO yux_api,yux_worker USING(private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id));
CREATE POLICY represented_insert ON public.company_represented_businesses AS RESTRICTIVE FOR INSERT TO yux_api,yux_worker WITH CHECK(current_setting('app.current_role',true) IN ('yux_admin','yux_operator','client_admin'));
CREATE POLICY represented_update ON public.company_represented_businesses AS RESTRICTIVE FOR UPDATE TO yux_api,yux_worker USING(current_setting('app.current_role',true) IN ('yux_admin','yux_operator','client_admin')) WITH CHECK(current_setting('app.current_role',true) IN ('yux_admin','yux_operator','client_admin'));
