CREATE TABLE public.company_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  client_id uuid REFERENCES public.clients(id),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  last_revision_number integer NOT NULL DEFAULT 0 CHECK (last_revision_number >= 0),
  draft_revision_id uuid,
  published_revision_id uuid,
  is_primary boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX company_strategy_one_primary ON public.company_strategies(organization_id) WHERE is_primary AND archived_at IS NULL;
CREATE INDEX company_strategy_org_status ON public.company_strategies(organization_id,archived_at,updated_at DESC);

CREATE TABLE public.company_strategy_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  strategy_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  origin jsonb NOT NULL DEFAULT '{"kind":"manual"}'::jsonb,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,strategy_id) REFERENCES public.company_strategies(organization_id,id),
  UNIQUE(organization_id,strategy_id,id),
  UNIQUE(strategy_id,revision_number),
  UNIQUE(organization_id,idempotency_key)
);
ALTER TABLE public.company_strategies ADD CONSTRAINT company_strategy_draft_scope
  FOREIGN KEY(organization_id,id,draft_revision_id) REFERENCES public.company_strategy_revisions(organization_id,strategy_id,id);
ALTER TABLE public.company_strategies ADD CONSTRAINT company_strategy_publication_scope
  FOREIGN KEY(organization_id,id,published_revision_id) REFERENCES public.company_strategy_revisions(organization_id,strategy_id,id);

CREATE TABLE public.company_strategy_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  strategy_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  publisher_user_id uuid NOT NULL REFERENCES public.app_users(id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,strategy_id,revision_id) REFERENCES public.company_strategy_revisions(organization_id,strategy_id,id),
  UNIQUE(organization_id,idempotency_key),
  UNIQUE(strategy_id,revision_id)
);
CREATE INDEX company_strategy_publications_scope ON public.company_strategy_publications(organization_id,strategy_id,published_at DESC);

CREATE TABLE public.company_strategy_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  strategy_id uuid,
  conversation_id uuid NOT NULL REFERENCES public.action_mission_conversations(id),
  message_id uuid NOT NULL REFERENCES public.action_mission_conversation_messages(id),
  base_revision_id uuid,
  base_strategy_version integer,
  content jsonb NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_hash text NOT NULL,
  status text NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','applied')),
  applied_strategy_id uuid,
  applied_revision_id uuid,
  created_by uuid NOT NULL REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,strategy_id) REFERENCES public.company_strategies(organization_id,id),
  FOREIGN KEY(organization_id,strategy_id,base_revision_id) REFERENCES public.company_strategy_revisions(organization_id,strategy_id,id),
  FOREIGN KEY(organization_id,applied_strategy_id,applied_revision_id) REFERENCES public.company_strategy_revisions(organization_id,strategy_id,id),
  UNIQUE(organization_id,message_id)
);
CREATE INDEX company_strategy_proposals_scope ON public.company_strategy_proposals(organization_id,strategy_id,created_at DESC);

CREATE FUNCTION private.company_strategy_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'company_strategy_revision_or_publication_immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER company_strategy_revision_immutable BEFORE UPDATE OR DELETE ON public.company_strategy_revisions FOR EACH ROW EXECUTE FUNCTION private.company_strategy_immutable();
CREATE TRIGGER company_strategy_publication_immutable BEFORE UPDATE OR DELETE ON public.company_strategy_publications FOR EACH ROW EXECUTE FUNCTION private.company_strategy_immutable();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['company_strategies','company_strategy_revisions','company_strategy_publications','company_strategy_proposals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,yux_api,yux_worker,yux_runtime',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON public.%I TO yux_api,yux_worker',table_name);
    EXECUTE format('CREATE POLICY company_strategy_scope ON public.%I FOR ALL TO yux_api,yux_worker USING (private.rls_can_access_organization(organization_id)) WITH CHECK(private.rls_can_access_organization(organization_id))',table_name);
    EXECUTE format('CREATE POLICY company_strategy_write ON public.%I AS RESTRICTIVE FOR INSERT TO yux_api,yux_worker WITH CHECK(current_setting(''app.current_role'',true) IN (''yux_admin'',''yux_operator'',''client_admin''))',table_name);
  END LOOP;
END;
$$;
GRANT UPDATE ON public.company_strategies,public.company_strategy_proposals TO yux_api,yux_worker;
CREATE POLICY company_strategy_update ON public.company_strategies AS RESTRICTIVE FOR UPDATE TO yux_api,yux_worker
 USING(current_setting('app.current_role',true) IN ('yux_admin','yux_operator','client_admin'))
 WITH CHECK(current_setting('app.current_role',true) IN ('yux_admin','yux_operator','client_admin'));
CREATE POLICY company_strategy_proposal_update ON public.company_strategy_proposals AS RESTRICTIVE FOR UPDATE TO yux_api,yux_worker
 USING(current_setting('app.current_role',true) IN ('yux_admin','yux_operator','client_admin'))
 WITH CHECK(current_setting('app.current_role',true) IN ('yux_admin','yux_operator','client_admin'));
CREATE POLICY company_strategy_member_read ON public.company_strategies AS RESTRICTIVE FOR SELECT TO yux_api,yux_worker
 USING(current_setting('app.current_role',true)<>'client_member' OR published_revision_id IS NOT NULL);
CREATE POLICY company_strategy_member_revision ON public.company_strategy_revisions AS RESTRICTIVE FOR SELECT TO yux_api,yux_worker
 USING(current_setting('app.current_role',true)<>'client_member' OR EXISTS(SELECT 1 FROM public.company_strategies strategy WHERE strategy.id=strategy_id AND strategy.published_revision_id=company_strategy_revisions.id));
CREATE POLICY company_strategy_member_proposal ON public.company_strategy_proposals AS RESTRICTIVE FOR SELECT TO yux_api,yux_worker
 USING(current_setting('app.current_role',true)<>'client_member');
