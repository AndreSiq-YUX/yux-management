-- Provider-neutral omnichannel schema, permissions, storage, and RLS core.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE public.omnichannel_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  availability_mode TEXT NOT NULL DEFAULT 'business_hours' CHECK (availability_mode IN ('always_on', 'business_hours', 'manual')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.omnichannel_team_members (
  team_id UUID NOT NULL REFERENCES public.omnichannel_teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE public.conversation_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.omnichannel_teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'least_busy', 'priority', 'manual')),
  sla_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  adapter_key TEXT NOT NULL,
  inbound_token_hash TEXT NOT NULL,
  n8n_routing_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, channel, name),
  UNIQUE (inbound_token_hash)
);

CREATE TABLE public.omnichannel_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  external_identities JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR external_identities <> '{}'::jsonb)
);

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.omnichannel_contacts(id) ON DELETE RESTRICT,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_ai', 'waiting_human', 'assigned', 'resolved', 'archived')),
  response_mode TEXT NOT NULL DEFAULT 'assisted' CHECK (response_mode IN ('automatic', 'assisted', 'manual')),
  queue_id UUID REFERENCES public.conversation_queues(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.omnichannel_teams(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  subject TEXT,
  summary TEXT,
  classification TEXT,
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  commercial_intent TEXT CHECK (commercial_intent IS NULL OR commercial_intent IN ('none', 'low', 'medium', 'high')),
  scheduling_intent TEXT CHECK (scheduling_intent IS NULL OR scheduling_intent IN ('none', 'requested', 'confirmed', 'cancelled')),
  last_message_at TIMESTAMPTZ,
  sla_deadline_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  author_type TEXT NOT NULL CHECK (author_type IN ('contact', 'ai', 'agent', 'system')),
  author_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'file', 'template', 'system')),
  body TEXT,
  external_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'processing', 'sent', 'delivered', 'read', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (body IS NOT NULL OR metadata <> '{}'::jsonb)
);

CREATE TABLE public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  retention_deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, tag),
  CHECK (BTRIM(tag) <> '')
);

CREATE TABLE public.conversation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES public.conversation_queues(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.omnichannel_teams(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'rule', 'auto_routing', 'lead_owner', 'team_availability', 'supervisor_fallback', 'sla')),
  reason TEXT,
  assigned_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.handoff_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  combinator TEXT NOT NULL DEFAULT 'all' CHECK (combinator IN ('all', 'any')),
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.handoff_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.handoff_rules(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  matched_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_assignment JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_assignment JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.channel_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  external_event_id TEXT,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  sanitized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed')),
  protected_error_text TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.outbound_message_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  adapter_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed')),
  sanitized_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  sanitized_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, attempt_number)
);

CREATE TABLE public.scheduling_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.omnichannel_contacts(id) ON DELETE RESTRICT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  requested_slot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'scheduled', 'cancelled', 'failed')),
  external_reference TEXT,
  n8n_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ai_message_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  inbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  outbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  logical_provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'fallback', 'failed')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost NUMERIC(14, 6) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  protected_error_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.crm_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  sanitized_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'url', 'file', 'faq', 'integration')),
  name TEXT NOT NULL,
  source_url TEXT,
  storage_path TEXT,
  retention_deadline_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),
  reviewer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.knowledge_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  body_snapshot TEXT NOT NULL,
  publisher_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.omnichannel_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_response_mode TEXT NOT NULL DEFAULT 'assisted' CHECK (default_response_mode IN ('automatic', 'assisted', 'manual')),
  retention_months INTEGER NOT NULL DEFAULT 12 CHECK (retention_months > 0),
  attachment_retention_months INTEGER NOT NULL DEFAULT 12 CHECK (attachment_retention_months > 0),
  anonymize_on_retention BOOLEAN NOT NULL DEFAULT false,
  crm_sync_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_logical_provider TEXT,
  ai_model TEXT,
  ai_token_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.webchat_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_text TEXT,
  initial_form JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.webchat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID NOT NULL REFERENCES public.webchat_widgets(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.omnichannel_contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  validated_origin TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE private.webchat_widget_tokens (
  widget_id UUID PRIMARY KEY REFERENCES public.webchat_widgets(id) ON DELETE CASCADE,
  public_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_omnichannel_teams_organization ON public.omnichannel_teams(organization_id);
CREATE INDEX idx_omnichannel_team_members_user ON public.omnichannel_team_members(user_id);
CREATE INDEX idx_conversation_queues_organization ON public.conversation_queues(organization_id);
CREATE INDEX idx_conversation_queues_team ON public.conversation_queues(team_id);
CREATE INDEX idx_channel_connections_organization_channel ON public.channel_connections(organization_id, channel, is_active);
CREATE INDEX idx_channel_connections_last_event_at ON public.channel_connections(last_event_at DESC);
CREATE UNIQUE INDEX idx_omnichannel_contacts_org_email_unique ON public.omnichannel_contacts(organization_id, LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_omnichannel_contacts_org_phone_unique ON public.omnichannel_contacts(organization_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_omnichannel_contacts_external_identities ON public.omnichannel_contacts USING GIN (external_identities);
CREATE INDEX idx_omnichannel_contacts_lead_id ON public.omnichannel_contacts(lead_id);
CREATE INDEX idx_conversations_organization_status_channel ON public.conversations(organization_id, status, channel);
CREATE INDEX idx_conversations_organization_queue_team_user ON public.conversations(organization_id, queue_id, team_id, assigned_user_id);
CREATE INDEX idx_conversations_organization_sla_deadline ON public.conversations(organization_id, sla_deadline_at);
CREATE INDEX idx_conversations_organization_last_message ON public.conversations(organization_id, last_message_at DESC);
CREATE INDEX idx_messages_conversation_created_at ON public.messages(conversation_id, created_at);
CREATE UNIQUE INDEX idx_messages_connection_external_id ON public.messages(connection_id, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_message_attachments_message_id ON public.message_attachments(message_id);
CREATE INDEX idx_conversation_assignments_conversation_created_at ON public.conversation_assignments(conversation_id, created_at DESC);
CREATE INDEX idx_handoff_rules_organization_priority ON public.handoff_rules(organization_id, is_enabled, priority);
CREATE INDEX idx_handoff_events_conversation_created_at ON public.handoff_events(conversation_id, created_at DESC);
CREATE INDEX idx_channel_webhook_events_connection_received_at ON public.channel_webhook_events(connection_id, received_at DESC);
CREATE INDEX idx_channel_webhook_events_idempotency_key ON public.channel_webhook_events(idempotency_key);
CREATE INDEX idx_outbound_message_runs_conversation_created_at ON public.outbound_message_runs(conversation_id, created_at DESC);
CREATE INDEX idx_ai_message_runs_conversation_created_at ON public.ai_message_runs(conversation_id, created_at DESC);
CREATE INDEX idx_scheduling_requests_conversation_created_at ON public.scheduling_requests(conversation_id, created_at DESC);
CREATE INDEX idx_crm_sync_runs_conversation_created_at ON public.crm_sync_runs(conversation_id, created_at DESC);
CREATE INDEX idx_knowledge_sources_organization_status ON public.knowledge_sources(organization_id, status);
CREATE INDEX idx_knowledge_entries_organization_status ON public.knowledge_entries(organization_id, status, updated_at DESC);
CREATE INDEX idx_knowledge_publications_entry_published_at ON public.knowledge_publications(entry_id, published_at DESC);
CREATE INDEX idx_webchat_widgets_organization_active ON public.webchat_widgets(organization_id, is_active);
CREATE INDEX idx_webchat_sessions_widget_created_at ON public.webchat_sessions(widget_id, created_at DESC);
CREATE INDEX idx_webchat_sessions_validated_origin ON public.webchat_sessions(validated_origin);
CREATE INDEX idx_private_webchat_widget_tokens_hash ON private.webchat_widget_tokens(public_token_hash);

CREATE OR REPLACE FUNCTION private.has_active_omnichannel_contract(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.memberships m ON m.organization_id = o.id
    JOIN public.roles r ON r.key = m.role_key AND r.scope = 'client'
    JOIN public.contracts c ON c.client_id = o.client_id
      AND c.status = 'active'
      AND c.starts_at <= CURRENT_DATE
      AND (c.ends_at IS NULL OR c.ends_at >= CURRENT_DATE)
    JOIN public.contract_modules cm ON cm.contract_id = c.id
      AND cm.module_key = 'whatsapp_ai'
      AND cm.enabled
    WHERE o.id = target_organization_id
      AND o.kind = 'client'
      AND m.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.has_omnichannel_permission(target_organization_id UUID, target_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_permission IN (
      'omnichannel.read',
      'omnichannel.write',
      'omnichannel.supervise',
      'omnichannel.configure'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.memberships m
        JOIN public.roles r ON r.key = m.role_key AND r.scope = 'internal'
        JOIN public.role_permissions rp ON rp.role_key = m.role_key
        WHERE m.user_id = (SELECT auth.uid())
          AND rp.permission_key IN (target_permission, 'platform.manage')
      )
      OR (
        private.has_active_omnichannel_contract(target_organization_id)
        AND EXISTS (
          SELECT 1
          FROM public.memberships m
          JOIN public.role_permissions rp ON rp.role_key = m.role_key
          WHERE m.organization_id = target_organization_id
            AND m.user_id = (SELECT auth.uid())
            AND rp.permission_key = target_permission
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_supervise_omnichannel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.roles r ON r.key = m.role_key AND r.scope = 'internal'
    JOIN public.role_permissions rp ON rp.role_key = m.role_key
    WHERE m.user_id = (SELECT auth.uid())
      AND rp.permission_key IN ('omnichannel.supervise', 'omnichannel.configure', 'platform.manage')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_organization(target_organization_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE target_action
    WHEN 'read' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.read')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.write')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.configure')
    WHEN 'write' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.write')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
    WHEN 'supervise' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
    WHEN 'configure' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.configure')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_conversation(target_conversation_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = target_conversation_id
      AND private.can_access_omnichannel_organization(c.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_message(target_message_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = target_message_id
      AND private.can_access_omnichannel_organization(c.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_knowledge(target_entry_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_entries k
    WHERE k.id = target_entry_id
      AND private.can_access_omnichannel_organization(k.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_queue(target_queue_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_queues q
    WHERE q.id = target_queue_id
      AND private.can_access_omnichannel_organization(q.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_team(target_team_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.omnichannel_teams t
    WHERE t.id = target_team_id
      AND private.can_access_omnichannel_organization(t.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_widget(target_widget_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webchat_widgets w
    WHERE w.id = target_widget_id
      AND private.can_access_omnichannel_organization(w.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_allowed_widget_origin(target_widget_id UUID, request_origin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webchat_widgets w
    JOIN LATERAL unnest(w.allowed_origins) AS allowed_origin(value) ON true
    WHERE w.id = target_widget_id
      AND w.is_active
      AND NULLIF(BTRIM(request_origin), '') IS NOT NULL
      AND (
        LOWER(allowed_origin.value) = LOWER(request_origin)
        OR allowed_origin.value = '*'
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.find_active_webchat_widget_by_token_hash(candidate_token_hash TEXT, request_origin TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT w.id
  FROM private.webchat_widget_tokens wt
  JOIN public.webchat_widgets w ON w.id = wt.widget_id
  WHERE wt.public_token_hash = candidate_token_hash
    AND w.is_active
    AND private.is_allowed_widget_origin(w.id, request_origin)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.verify_webchat_session(target_session_id UUID, candidate_session_token_hash TEXT, request_origin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webchat_sessions s
    WHERE s.id = target_session_id
      AND s.session_token_hash = candidate_session_token_hash
      AND s.validated_origin = request_origin
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_storage_object(object_name TEXT, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  organization_folder TEXT;
  target_organization_id UUID;
BEGIN
  organization_folder := (storage.foldername(object_name))[1];
  IF organization_folder IS NULL THEN
    RETURN false;
  END IF;

  target_organization_id := organization_folder::UUID;
  RETURN private.can_access_omnichannel_organization(target_organization_id, target_action);
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_immutable_omnichannel_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Immutable omnichannel audit rows cannot be %', LOWER(TG_OP);
END;
$$;

REVOKE ALL ON TABLE private.webchat_widget_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.webchat_widget_tokens TO service_role;

REVOKE ALL ON FUNCTION private.has_active_omnichannel_contract(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_omnichannel_permission(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_supervise_omnichannel() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_organization(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_conversation(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_message(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_knowledge(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_queue(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_team(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_widget(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_allowed_widget_origin(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.find_active_webchat_widget_by_token_hash(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.verify_webchat_session(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_omnichannel_storage_object(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_active_omnichannel_contract(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_omnichannel_permission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_supervise_omnichannel() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_organization(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_conversation(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_message(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_knowledge(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_queue(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_team(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_widget(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_allowed_widget_origin(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.find_active_webchat_widget_by_token_hash(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION private.verify_webchat_session(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION private.can_access_omnichannel_storage_object(TEXT, TEXT) TO authenticated, service_role;

CREATE TRIGGER protect_handoff_events_immutable
  BEFORE UPDATE OR DELETE ON public.handoff_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_immutable_omnichannel_event_mutation();

CREATE TRIGGER protect_knowledge_publications_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_publications
  FOR EACH ROW EXECUTE FUNCTION private.prevent_immutable_omnichannel_event_mutation();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'omnichannel_teams',
    'omnichannel_team_members',
    'conversation_queues',
    'channel_connections',
    'omnichannel_contacts',
    'conversations',
    'messages',
    'message_attachments',
    'handoff_rules',
    'channel_webhook_events',
    'outbound_message_runs',
    'scheduling_requests',
    'ai_message_runs',
    'crm_sync_runs',
    'knowledge_sources',
    'knowledge_entries',
    'omnichannel_settings',
    'webchat_widgets',
    'webchat_sessions'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END
$$;

ALTER TABLE public.omnichannel_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_message_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_message_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users supervise channel connections" ON public.channel_connections
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

CREATE POLICY "Omnichannel users read contacts" ON public.omnichannel_contacts
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel users write contacts" ON public.omnichannel_contacts
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'write'));

CREATE POLICY "Omnichannel users read conversations" ON public.conversations
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel users write conversations" ON public.conversations
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'write'));

CREATE POLICY "Omnichannel users read messages" ON public.messages
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_conversation(conversation_id, 'read'));
CREATE POLICY "Omnichannel users write messages" ON public.messages
  FOR ALL TO authenticated USING (private.can_access_omnichannel_conversation(conversation_id, 'write'))
  WITH CHECK (private.can_access_omnichannel_conversation(conversation_id, 'write'));

CREATE POLICY "Omnichannel users read message attachments" ON public.message_attachments
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_message(message_id, 'read'));
CREATE POLICY "Omnichannel users write message attachments" ON public.message_attachments
  FOR ALL TO authenticated USING (private.can_access_omnichannel_message(message_id, 'write'))
  WITH CHECK (private.can_access_omnichannel_message(message_id, 'write'));

CREATE POLICY "Omnichannel users read tags" ON public.conversation_tags
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_conversation(conversation_id, 'read'));
CREATE POLICY "Omnichannel users write tags" ON public.conversation_tags
  FOR ALL TO authenticated USING (private.can_access_omnichannel_conversation(conversation_id, 'write'))
  WITH CHECK (private.can_access_omnichannel_conversation(conversation_id, 'write'));

CREATE POLICY "Omnichannel users read assignments" ON public.conversation_assignments
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_conversation(conversation_id, 'read'));
CREATE POLICY "Omnichannel supervisors insert assignments" ON public.conversation_assignments
  FOR INSERT TO authenticated WITH CHECK (private.can_access_omnichannel_conversation(conversation_id, 'supervise'));

CREATE POLICY "Omnichannel users read teams" ON public.omnichannel_teams
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage teams" ON public.omnichannel_teams
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read team members" ON public.omnichannel_team_members
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_team(team_id, 'read'));
CREATE POLICY "Omnichannel configurators manage team members" ON public.omnichannel_team_members
  FOR ALL TO authenticated USING (private.can_access_omnichannel_team(team_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_team(team_id, 'configure'));

CREATE POLICY "Omnichannel users read queues" ON public.conversation_queues
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage queues" ON public.conversation_queues
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read handoff rules" ON public.handoff_rules
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage handoff rules" ON public.handoff_rules
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read handoff events" ON public.handoff_events
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_conversation(conversation_id, 'read'));
CREATE POLICY "Omnichannel supervisors insert handoff events" ON public.handoff_events
  FOR INSERT TO authenticated WITH CHECK (private.can_access_omnichannel_conversation(conversation_id, 'supervise'));

CREATE POLICY "Internal users supervise webhook events" ON public.channel_webhook_events
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

CREATE POLICY "Internal users supervise outbound runs" ON public.outbound_message_runs
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

CREATE POLICY "Omnichannel users read scheduling requests" ON public.scheduling_requests
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel users write scheduling requests" ON public.scheduling_requests
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'write'));

CREATE POLICY "Internal users supervise ai runs" ON public.ai_message_runs
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

CREATE POLICY "Internal users supervise crm sync runs" ON public.crm_sync_runs
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

CREATE POLICY "Omnichannel users read knowledge sources" ON public.knowledge_sources
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage knowledge sources" ON public.knowledge_sources
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read knowledge entries" ON public.knowledge_entries
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage knowledge entries" ON public.knowledge_entries
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read knowledge publications" ON public.knowledge_publications
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators insert knowledge publications" ON public.knowledge_publications
  FOR INSERT TO authenticated WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read settings" ON public.omnichannel_settings
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage settings" ON public.omnichannel_settings
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read widgets" ON public.webchat_widgets
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage widgets" ON public.webchat_widgets
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Internal users supervise webchat sessions" ON public.webchat_sessions
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'omnichannel-attachments',
  'omnichannel-attachments',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/ogg', 'audio/webm',
    'video/mp4', 'video/webm',
    'application/pdf', 'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = NOW();

CREATE POLICY "Omnichannel attachment readers" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'omnichannel-attachments'
    AND private.can_access_omnichannel_storage_object(name, 'read')
  );
CREATE POLICY "Omnichannel attachment uploaders" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'omnichannel-attachments'
    AND private.can_access_omnichannel_storage_object(name, 'write')
  );
CREATE POLICY "Omnichannel attachment editors" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'omnichannel-attachments'
    AND private.can_access_omnichannel_storage_object(name, 'write')
  ) WITH CHECK (
    bucket_id = 'omnichannel-attachments'
    AND private.can_access_omnichannel_storage_object(name, 'write')
  );
CREATE POLICY "Omnichannel attachment deleters" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'omnichannel-attachments'
    AND private.can_access_omnichannel_storage_object(name, 'write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omnichannel_teams TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omnichannel_team_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_queues TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_connections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omnichannel_contacts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_attachments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_tags TO authenticated, service_role;
GRANT SELECT, INSERT ON public.conversation_assignments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handoff_rules TO authenticated, service_role;
GRANT SELECT, INSERT ON public.handoff_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_webhook_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_message_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_message_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sync_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_sources TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_entries TO authenticated, service_role;
GRANT SELECT, INSERT ON public.knowledge_publications TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omnichannel_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webchat_widgets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webchat_sessions TO authenticated, service_role;

INSERT INTO public.roles (key, name, scope)
VALUES ('yux_member', 'YUX Member', 'internal')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  scope = EXCLUDED.scope,
  updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('yux_admin', 'omnichannel.read'),
  ('yux_admin', 'omnichannel.write'),
  ('yux_admin', 'omnichannel.supervise'),
  ('yux_admin', 'omnichannel.configure'),
  ('yux_manager', 'omnichannel.read'),
  ('yux_manager', 'omnichannel.write'),
  ('yux_manager', 'omnichannel.supervise'),
  ('yux_manager', 'omnichannel.configure'),
  ('yux_member', 'omnichannel.read'),
  ('yux_member', 'omnichannel.write'),
  ('client_admin', 'omnichannel.read'),
  ('client_admin', 'omnichannel.write'),
  ('client_admin', 'omnichannel.configure'),
  ('client_member', 'omnichannel.read'),
  ('client_member', 'omnichannel.write')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES (
  'whatsapp_ai',
  'Central Omnichannel IA',
  false,
  '/omnichannel',
  '/portal/omnichannel',
  ARRAY['omnichannel.read']
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route,
  required_permissions = EXCLUDED.required_permissions,
  updated_at = NOW();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'omnichannel_teams', 'omnichannel_team_members', 'conversation_queues',
    'channel_connections', 'omnichannel_contacts', 'conversations', 'messages',
    'message_attachments', 'conversation_tags', 'conversation_assignments',
    'handoff_rules', 'handoff_events', 'channel_webhook_events',
    'outbound_message_runs', 'scheduling_requests', 'ai_message_runs',
    'crm_sync_runs', 'knowledge_sources', 'knowledge_entries',
    'knowledge_publications', 'omnichannel_settings', 'webchat_widgets',
    'webchat_sessions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = target_table
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', target_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_schema = 'public'
      AND table_name IN (
        'omnichannel_teams', 'omnichannel_team_members', 'conversation_queues',
        'channel_connections', 'omnichannel_contacts', 'conversations', 'messages',
        'message_attachments', 'conversation_tags', 'conversation_assignments',
        'handoff_rules', 'handoff_events', 'channel_webhook_events',
        'outbound_message_runs', 'scheduling_requests', 'ai_message_runs',
        'crm_sync_runs', 'knowledge_sources', 'knowledge_entries',
        'knowledge_publications', 'omnichannel_settings', 'webchat_widgets',
        'webchat_sessions'
      )
  ) THEN
    RAISE EXCEPTION 'Omnichannel tables must not grant direct anon access';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'webchat_widgets'
      AND column_name LIKE '%token%'
  ) THEN
    RAISE EXCEPTION 'Public webchat_widgets columns must not store public token hashes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'omnichannel-attachments'
      AND public
  ) THEN
    RAISE EXCEPTION 'Omnichannel attachments bucket must remain private';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
