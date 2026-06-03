-- Transactional CRM synchronization for provider-neutral omnichannel conversations.

CREATE OR REPLACE FUNCTION private.sync_omnichannel_crm(
  target_conversation_id UUID,
  sync_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_conversation public.conversations%ROWTYPE;
  target_contact public.omnichannel_contacts%ROWTYPE;
  target_settings public.omnichannel_settings%ROWTYPE;
  default_pipeline_id UUID;
  default_stage_id UUID;
  target_lead public.leads%ROWTYPE;
  lead_email TEXT;
  lead_phone TEXT;
  should_create_lead BOOLEAN;
  sync_status TEXT := 'completed';
  sync_result JSONB;
BEGIN
  SELECT * INTO target_conversation
  FROM public.conversations
  WHERE id = target_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  SELECT * INTO target_contact
  FROM public.omnichannel_contacts
  WHERE id = target_conversation.contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Omnichannel contact not found';
  END IF;

  SELECT * INTO target_settings
  FROM public.omnichannel_settings
  WHERE organization_id = target_conversation.organization_id;

  IF target_settings.crm_sync_filters ? 'channels'
    AND NOT (target_settings.crm_sync_filters->'channels' ? target_conversation.channel)
  THEN
    INSERT INTO public.crm_sync_runs (organization_id, conversation_id, lead_id, status, sanitized_metadata)
    VALUES (
      target_conversation.organization_id,
      target_conversation.id,
      target_conversation.lead_id,
      'completed',
      jsonb_build_object('skipped', true, 'reason', 'channel_not_allowed')
    );
    RETURN jsonb_build_object('synced', false, 'reason', 'channel_not_allowed');
  END IF;

  lead_email := NULLIF(BTRIM(COALESCE(target_contact.email, '')), '');
  lead_phone := NULLIF(BTRIM(COALESCE(target_contact.phone, '')), '');

  IF target_conversation.lead_id IS NOT NULL THEN
    SELECT * INTO target_lead
    FROM public.leads
    WHERE id = target_conversation.lead_id
      AND organization_id = target_conversation.organization_id
    FOR UPDATE;
  END IF;

  IF target_lead.id IS NULL AND lead_email IS NOT NULL THEN
    SELECT * INTO target_lead
    FROM public.leads
    WHERE organization_id = target_conversation.organization_id
      AND LOWER(email) = LOWER(lead_email)
    ORDER BY updated_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF target_lead.id IS NULL AND lead_phone IS NOT NULL THEN
    SELECT * INTO target_lead
    FROM public.leads
    WHERE organization_id = target_conversation.organization_id
      AND phone = lead_phone
    ORDER BY updated_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  should_create_lead := COALESCE((target_settings.crm_sync_filters->>'createLeadWhenMissing')::BOOLEAN, true);

  IF target_lead.id IS NULL AND should_create_lead THEN
    SELECT id INTO default_pipeline_id
    FROM public.crm_pipelines
    WHERE organization_id = target_conversation.organization_id
      AND is_default
      AND is_active
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO default_stage_id
    FROM public.crm_pipeline_stages
    WHERE pipeline_id = default_pipeline_id
      AND is_active
    ORDER BY order_index
    LIMIT 1;

    INSERT INTO public.leads (
      organization_id,
      pipeline_id,
      stage_id,
      name,
      email,
      phone,
      company,
      source,
      stage,
      status,
      score,
      notes,
      assigned_to,
      next_follow_up_at
    )
    VALUES (
      target_conversation.organization_id,
      default_pipeline_id,
      default_stage_id,
      COALESCE(NULLIF(target_contact.display_name, ''), 'Contato omnichannel'),
      COALESCE(lead_email, CONCAT('omnichannel+', target_contact.id::TEXT, '@local.invalid')),
      lead_phone,
      target_contact.profile_metadata->>'company',
      CONCAT('Omnichannel ', target_conversation.channel),
      'NEW',
      'open',
      CASE target_conversation.commercial_intent
        WHEN 'high' THEN 85
        WHEN 'medium' THEN 60
        WHEN 'low' THEN 35
        ELSE 10
      END,
      target_conversation.summary,
      target_conversation.assigned_user_id,
      CASE
        WHEN target_conversation.scheduling_intent IN ('requested', 'confirmed') THEN NOW() + INTERVAL '1 day'
        ELSE NULL
      END
    )
    RETURNING * INTO target_lead;
  END IF;

  IF target_lead.id IS NOT NULL THEN
    UPDATE public.omnichannel_contacts
    SET lead_id = target_lead.id,
        updated_at = NOW()
    WHERE id = target_contact.id;

    UPDATE public.conversations
    SET lead_id = target_lead.id,
        updated_at = NOW()
    WHERE id = target_conversation.id;

    UPDATE public.leads
    SET notes = COALESCE(NULLIF(target_conversation.summary, ''), notes),
        score = GREATEST(
          COALESCE(score, 0),
          CASE target_conversation.commercial_intent
            WHEN 'high' THEN 85
            WHEN 'medium' THEN 60
            WHEN 'low' THEN 35
            ELSE 0
          END
        ),
        assigned_to = COALESCE(assigned_to, target_conversation.assigned_user_id),
        next_follow_up_at = COALESCE(
          next_follow_up_at,
          CASE
            WHEN target_conversation.scheduling_intent IN ('requested', 'confirmed') THEN NOW() + INTERVAL '1 day'
            ELSE NULL
          END
        ),
        updated_at = NOW()
    WHERE id = target_lead.id;

    INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
    SELECT
      target_conversation.organization_id,
      target_lead.id,
      'note',
      'Conversa omnichannel',
      COALESCE(target_conversation.summary, CONCAT('Conversa ', target_conversation.channel)),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.interactions i
      WHERE i.organization_id = target_conversation.organization_id
        AND i.lead_id = target_lead.id
        AND i.title = 'Conversa omnichannel'
        AND i.description = COALESCE(target_conversation.summary, CONCAT('Conversa ', target_conversation.channel))
    );
  ELSE
    sync_status := 'completed';
  END IF;

  sync_result := jsonb_build_object(
    'synced', target_lead.id IS NOT NULL,
    'conversationId', target_conversation.id,
    'contactId', target_contact.id,
    'leadId', target_lead.id
  );

  INSERT INTO public.crm_sync_runs (organization_id, conversation_id, lead_id, status, sanitized_metadata)
  VALUES (
    target_conversation.organization_id,
    target_conversation.id,
    target_lead.id,
    sync_status,
    COALESCE(sync_metadata, '{}'::jsonb) || sync_result
  );

  RETURN sync_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_omnichannel_crm_service(
  target_conversation_id UUID,
  sync_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.sync_omnichannel_crm(target_conversation_id, sync_metadata);
$$;

REVOKE ALL ON FUNCTION private.sync_omnichannel_crm(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_omnichannel_crm_service(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_omnichannel_crm(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_omnichannel_crm_service(UUID, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
