BEGIN;

CREATE TABLE IF NOT EXISTS public.action_mission_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  mission_id UUID REFERENCES public.action_missions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'collecting_context'
    CHECK (status IN (
      'collecting_context','awaiting_user','brief_confirmation','planning',
      'awaiting_plan_approval','converted','blocked','cancelled'
    )),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  current_brief JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(current_brief) = 'object'),
  context_readiness JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context_readiness) = 'object'),
  last_context_hash TEXT CHECK (last_context_hash IS NULL OR last_context_hash ~ '^[a-f0-9]{64}$'),
  last_harness_run_id TEXT,
  create_idempotency_key TEXT NOT NULL CHECK (BTRIM(create_idempotency_key) <> ''),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, create_idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.action_mission_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','agent','system')),
  message_kind TEXT NOT NULL CHECK (message_kind IN ('text','question','brief','plan','status','error')),
  content TEXT NOT NULL CHECK (BTRIM(content) <> ''),
  structured_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(structured_payload) = 'object'),
  source_refs JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(source_refs) = 'array'),
  client_message_id TEXT,
  harness_run_id TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.action_mission_conversations(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (conversation_id, sequence)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_mission_conversation_client_message
  ON public.action_mission_conversation_messages(conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_mission_conversation_harness_run
  ON public.action_mission_conversation_messages(conversation_id, harness_run_id)
  WHERE harness_run_id IS NOT NULL AND actor_type = 'agent';
CREATE INDEX IF NOT EXISTS idx_action_mission_conversations_org_status_updated
  ON public.action_mission_conversations(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_mission_conversations_contract
  ON public.action_mission_conversations(organization_id, contract_id, updated_at DESC)
  WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_action_mission_conversations_mission
  ON public.action_mission_conversations(organization_id, mission_id)
  WHERE mission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_action_mission_conversation_messages_order
  ON public.action_mission_conversation_messages(organization_id, conversation_id, sequence);

DROP TRIGGER IF EXISTS update_action_mission_conversations_updated_at ON public.action_mission_conversations;
CREATE TRIGGER update_action_mission_conversations_updated_at
  BEFORE UPDATE ON public.action_mission_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION private.guard_action_mission_conversation_message_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'action_mission_conversation_message_append_only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_mission_conversation_messages_append_only
  ON public.action_mission_conversation_messages;
CREATE TRIGGER action_mission_conversation_messages_append_only
  BEFORE UPDATE OR DELETE ON public.action_mission_conversation_messages
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_mission_conversation_message_append_only();

ALTER TABLE public.action_mission_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_mission_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.action_mission_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_mission_conversation_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_mission_conversations_tenant ON public.action_mission_conversations;
CREATE POLICY action_mission_conversations_tenant ON public.action_mission_conversations
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

DROP POLICY IF EXISTS action_mission_conversation_messages_tenant
  ON public.action_mission_conversation_messages;
CREATE POLICY action_mission_conversation_messages_tenant
  ON public.action_mission_conversation_messages
  USING (private.rls_can_access_organization(organization_id))
  WITH CHECK (private.rls_can_access_organization(organization_id));

COMMIT;
