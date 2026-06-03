-- Omnichannel ingestion and CRM sync probes.
-- Run after applying 20260601200000_omnichannel_crm_sync.sql and deploying task 5 functions.

-- 1. Service wrapper must not be executable by anon/authenticated.
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'sync_omnichannel_crm_service'
  AND grantee IN ('anon', 'authenticated');

-- 2. CRM sync function should exist in private and the public service wrapper should exist.
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'private' AND p.proname = 'sync_omnichannel_crm')
   OR (n.nspname = 'public' AND p.proname = 'sync_omnichannel_crm_service')
ORDER BY n.nspname, p.proname;

-- 3. Duplicate webhook events must remain unique by idempotency key.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'channel_webhook_events'
  AND indexdef ILIKE '%idempotency_key%';

-- 4. Runtime probes for a real test organization.
-- Replace placeholders after creating a test channel connection and active whatsapp_ai contract.
--
-- 4a. Repeating the same normalized external event should not create a second message.
-- select count(*)
-- from public.messages
-- where connection_id = '<connection_uuid>'::uuid
--   and external_message_id = '<external_message_id>';
-- Expect: 1
--
-- 4b. CRM sync filters should skip irrelevant channels.
-- update public.omnichannel_settings
-- set crm_sync_filters = '{"channels":["email"]}'::jsonb
-- where organization_id = '<organization_uuid>'::uuid;
-- select public.sync_omnichannel_crm_service('<conversation_uuid>'::uuid, '{}'::jsonb);
-- Expect: {"synced": false, "reason": "channel_not_allowed"}
--
-- 4c. Relevant first contact should create or link a lead idempotently.
-- select public.sync_omnichannel_crm_service('<conversation_uuid>'::uuid, '{}'::jsonb);
-- select lead_id from public.conversations where id = '<conversation_uuid>'::uuid;
-- Expect: non-null lead_id, unchanged across repeated calls.
--
-- 4d. Matching handoff simulation should create an immutable event.
-- select count(*) from public.handoff_events where conversation_id = '<conversation_uuid>'::uuid;
-- Expect: >= 1 after a simulated message asking for a human.
--
-- 4e. Authenticated simulator requests should respect channel_connections RLS.
-- As a user outside the target organization:
-- invoke simulate-channel-event with connectionId = '<other_org_connection_uuid>'
-- Expect: 404 Connection not found.
