CREATE TABLE public.radar_email_domain_policy(
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 configuration JSONB NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.radar_email_domain_policy(singleton,configuration) VALUES(TRUE,
 '{"genericProviders":["gmail.com","googlemail.com","hotmail.com","hotmail.com.br","outlook.com","outlook.com.br","live.com","msn.com","yahoo.com","yahoo.com.br","ymail.com","icloud.com","me.com","aol.com","bol.com.br","uol.com.br","terra.com.br","ig.com.br","globo.com","globomail.com","r7.com","zipmail.com.br","protonmail.com","proton.me"],"accountantTokens":["contab","contador","assessoria","escritorio","fiscal"]}'::jsonb);
ALTER TABLE public.radar_email_domain_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_email_domain_policy FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_email_domain_policy FROM PUBLIC,yux_api,yux_worker,yux_runtime;
GRANT SELECT,UPDATE ON public.radar_email_domain_policy TO yux_api;
GRANT SELECT ON public.radar_email_domain_policy TO yux_worker;
CREATE POLICY radar_email_policy_admin ON public.radar_email_domain_policy FOR ALL TO yux_api
 USING(current_setting('app.current_role',true)='yux_admin') WITH CHECK(current_setting('app.current_role',true)='yux_admin');
CREATE POLICY radar_email_policy_worker ON public.radar_email_domain_policy FOR SELECT TO yux_worker
 USING(current_setting('app.service_role',true)='worker');
-- Copy only descriptions already acquired; never buys a new registry lookup.
UPDATE public.radar_candidate_records SET normalized_payload=normalized_payload||jsonb_build_object('registryActivities',raw_payload->'registryActivities')
 WHERE NOT(normalized_payload?'registryActivities') AND jsonb_typeof(raw_payload->'registryActivities')='array';
