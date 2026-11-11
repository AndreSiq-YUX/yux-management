import type pg from 'pg'

type Queryable = Pick<pg.Pool, 'query'>

/**
 * Records the CRM-visible link between a lead and a conversation. The lead's
 * page reads conversations through `lead_conversation_links`; setting only
 * `conversations.lead_id` would keep the reply invisible to the team.
 * Only links leads of a governed CRM instance in the same organization.
 */
export async function ensureLeadConversationLink(
  db: Queryable,
  input: { leadId: string; conversationId: string; matchMethod: 'phone' | 'manual'; contactPhone?: string | null },
) {
  await db.query(
    `INSERT INTO public.lead_conversation_links (
       organization_id, crm_instance_id, lead_id, conversation_id, channel,
       status, match_method, match_score, contact_phone, linked_at
     )
     SELECT lead.organization_id, lead.crm_instance_id, lead.id, conversation.id, conversation.channel,
            'linked', $3, 100, $4, NOW()
       FROM public.leads lead
       JOIN public.conversations conversation
         ON conversation.id = $2 AND conversation.organization_id = lead.organization_id
      WHERE lead.id = $1 AND lead.deleted_at IS NULL AND lead.crm_instance_id IS NOT NULL
        AND conversation.channel IN ('whatsapp', 'instagram', 'email', 'webchat')
     ON CONFLICT (lead_id, conversation_id) DO UPDATE
       SET status = CASE WHEN public.lead_conversation_links.status IN ('suggested', 'archived')
                         THEN 'linked' ELSE public.lead_conversation_links.status END,
           updated_at = NOW()`,
    [input.leadId, input.conversationId, input.matchMethod, input.contactPhone ?? null],
  )
}
