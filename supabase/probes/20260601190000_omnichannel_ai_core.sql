-- Omnichannel core structural probes.
-- Run after applying 20260601190000_omnichannel_ai_core.sql.
-- Zero rows means pass unless otherwise noted.

-- 1. Every omnichannel public table must have RLS enabled.
SELECT c.relname AS table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'omnichannel_teams', 'omnichannel_team_members', 'conversation_queues',
    'channel_connections', 'omnichannel_contacts', 'conversations', 'messages',
    'message_attachments', 'conversation_tags', 'conversation_assignments',
    'handoff_rules', 'handoff_events', 'channel_webhook_events',
    'outbound_message_runs', 'scheduling_requests', 'ai_message_runs',
    'crm_sync_runs', 'knowledge_sources', 'knowledge_entries',
    'knowledge_publications', 'omnichannel_settings', 'webchat_widgets',
    'webchat_sessions'
  )
  AND NOT c.relrowsecurity;

-- 2. No public omnichannel table should grant anything to anon.
SELECT table_name, privilege_type
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
  );

-- 3. Public widget configuration must not expose token hashes.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'webchat_widgets'
  AND (
    column_name LIKE '%token_hash%'
    OR column_name IN ('public_token', 'widget_token', 'token_hash')
  );

-- 4. The private attachment bucket must remain private.
SELECT id, public
FROM storage.buckets
WHERE id = 'omnichannel-attachments'
  AND public;

-- 5. Immutable audit/publication triggers should exist.
SELECT tgname
FROM pg_trigger
WHERE tgrelid IN ('public.handoff_events'::regclass, 'public.knowledge_publications'::regclass)
  AND NOT tgisinternal
ORDER BY tgname;
-- Expect exactly:
-- protect_handoff_events_immutable
-- protect_knowledge_publications_immutable

-- 6. Module metadata must point to omnichannel routes.
SELECT key, name, internal_route, portal_route, required_permissions
FROM public.platform_modules
WHERE key = 'whatsapp_ai';
-- Expect:
-- name = 'Central Omnichannel IA'
-- internal_route = '/omnichannel'
-- portal_route = '/portal/omnichannel'
-- required_permissions = {'omnichannel.read'}

-- 7. Required private helpers must exist.
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND proname IN (
    'has_active_omnichannel_contract',
    'has_omnichannel_permission',
    'can_supervise_omnichannel',
    'can_access_omnichannel_organization',
    'can_access_omnichannel_conversation',
    'can_access_omnichannel_message',
    'can_access_omnichannel_knowledge',
    'can_access_omnichannel_queue',
    'can_access_omnichannel_team',
    'can_access_omnichannel_widget',
    'is_allowed_widget_origin',
    'find_active_webchat_widget_by_token_hash',
    'verify_webchat_session',
    'can_access_omnichannel_storage_object'
  )
ORDER BY proname;

-- 8. Runtime probes for a real test environment.
-- Use the Supabase RLS tester or an authenticated client session after substituting IDs.
--
-- 8a. Client organization isolation: as a client user from org A, reads for org B must fail.
-- select * from public.conversations where organization_id = '<other_org_uuid>'::uuid;
--
-- 8b. Inactive or missing whatsapp_ai contract should deny access.
-- select private.has_active_omnichannel_contract('<client_org_uuid>'::uuid);
--
-- 8c. Handoff events and knowledge publications must reject updates/deletes.
-- update public.handoff_events set outcome = '{}'::jsonb where id = '<handoff_event_uuid>'::uuid;
-- delete from public.knowledge_publications where id = '<publication_uuid>'::uuid;
--
-- 8d. Widget origin and session validation.
-- select private.find_active_webchat_widget_by_token_hash('<hashed_token>', 'https://allowed.example');
-- select private.verify_webchat_session('<session_uuid>'::uuid, '<hashed_session_token>', 'https://allowed.example');
--
-- 8e. Internal-only tables should stay hidden from portal users.
-- select * from public.ai_message_runs;
-- select * from public.channel_webhook_events;
