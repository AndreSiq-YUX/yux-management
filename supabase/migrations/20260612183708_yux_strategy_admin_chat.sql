-- Admin-only strategic chat for the internal YUX Growth Strategist.

CREATE TABLE IF NOT EXISTS public.yux_strategy_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  profile_key TEXT NOT NULL DEFAULT 'growth_strategist' CHECK (BTRIM(profile_key) <> ''),
  title TEXT NOT NULL DEFAULT 'Nova conversa estrategica' CHECK (BTRIM(title) <> ''),
  mode TEXT NOT NULL DEFAULT 'general' CHECK (mode IN ('general','initial_analysis','diagnostic_48h','service_plan','proposal','roadmap_30_60_90','do_not_do')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_snapshot) = 'object'),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.yux_strategy_chat_sessions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL CHECK (BTRIM(content) <> ''),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed')),
  model_provider TEXT,
  model_name TEXT,
  routing_rule_id UUID REFERENCES public.model_routing_rules(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  safe_context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_context) = 'object'),
  tool_results JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tool_results) = 'array'),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_chat_sessions_actor_created
  ON public.yux_strategy_chat_sessions(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_chat_sessions_scope
  ON public.yux_strategy_chat_sessions(organization_id, client_id, contract_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_chat_messages_session_created
  ON public.yux_strategy_chat_messages(session_id, created_at);

DROP TRIGGER IF EXISTS update_yux_strategy_chat_sessions_updated_at ON public.yux_strategy_chat_sessions;
CREATE TRIGGER update_yux_strategy_chat_sessions_updated_at
  BEFORE UPDATE ON public.yux_strategy_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.yux_strategy_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users manage strategy chat sessions" ON public.yux_strategy_chat_sessions;
CREATE POLICY "Internal users manage strategy chat sessions" ON public.yux_strategy_chat_sessions
  FOR ALL TO authenticated
  USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

DROP POLICY IF EXISTS "Internal users manage strategy chat messages" ON public.yux_strategy_chat_messages;
CREATE POLICY "Internal users manage strategy chat messages" ON public.yux_strategy_chat_messages
  FOR ALL TO authenticated
  USING (
    private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.yux_strategy_chat_sessions s
      WHERE s.id = session_id
    )
  )
  WITH CHECK (
    private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.yux_strategy_chat_sessions s
      WHERE s.id = session_id
    )
  );

DROP POLICY IF EXISTS "Service role manages strategy chat sessions" ON public.yux_strategy_chat_sessions;
CREATE POLICY "Service role manages strategy chat sessions" ON public.yux_strategy_chat_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages strategy chat messages" ON public.yux_strategy_chat_messages;
CREATE POLICY "Service role manages strategy chat messages" ON public.yux_strategy_chat_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.yux_strategy_chat_sessions FROM anon;
REVOKE ALL ON public.yux_strategy_chat_messages FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_chat_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_chat_messages TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
