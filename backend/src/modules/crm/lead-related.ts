import type { AuthUser } from '../../auth/routes.js'
import type { ProfileDb } from './record-profile.js'
import { requireActiveLead } from './lead-actions.js'
/** Explicit columns: no provider receipts, model settings or arbitrary metadata. */
export async function loadLeadRelated(
  db: ProfileDb,
  user: AuthUser,
  leadId: string,
) {
  const lead = await requireActiveLead(db, user, leadId)
  const scope = [leadId, lead.organization_id, lead.crm_instance_id]
  const conversations = (
    await db.query(
      `SELECT link.id,link.organization_id,link.crm_instance_id,link.lead_id,link.conversation_id,link.channel,link.status,link.match_method,link.linked_at,link.created_at,link.updated_at,
  jsonb_build_object('id',c.id,'status',c.status,'subject',c.subject,'summary',c.summary,'last_message_at',c.last_message_at) AS conversation
  FROM public.lead_conversation_links link JOIN public.conversations c ON c.id=link.conversation_id AND c.organization_id=link.organization_id
  WHERE link.lead_id=$1 AND link.organization_id=$2 AND link.crm_instance_id=$3 AND link.status<>'archived' ORDER BY link.updated_at DESC LIMIT 100`,
      scope,
    )
  ).rows
  const insights = (
    await db.query(
      'SELECT id,organization_id,crm_instance_id,lead_id,conversation_id,summary,intent,sentiment,urgency,objections,risks,next_best_action,confidence,created_at FROM public.lead_ai_insights WHERE lead_id=$1 AND organization_id=$2 AND crm_instance_id=$3 ORDER BY created_at DESC LIMIT 30',
      scope,
    )
  ).rows
  const fieldSuggestions = (
    await db.query(
      `SELECT id,organization_id,crm_instance_id,lead_id,conversation_id,field_key,
  CASE WHEN jsonb_typeof(current_value) IN ('string','number','boolean','null') THEN current_value ELSE NULL END AS current_value,
  CASE WHEN jsonb_typeof(suggested_value) IN ('string','number','boolean','null') THEN suggested_value ELSE NULL END AS suggested_value,
  confidence,reason,status,confirmed_at,created_at FROM public.lead_ai_field_suggestions WHERE lead_id=$1 AND organization_id=$2 AND crm_instance_id=$3
  AND field_key IN ('city','state','segment','interest','temperature','urgency','competitor','phone','email','whatsapp_phone') ORDER BY created_at DESC LIMIT 50`,
      scope,
    )
  ).rows
  const responseSuggestions = (
    await db.query(
      'SELECT id,organization_id,crm_instance_id,lead_id,conversation_id,channel,body,status,requires_approval,created_at,updated_at FROM public.lead_response_suggestions WHERE lead_id=$1 AND organization_id=$2 AND crm_instance_id=$3 ORDER BY updated_at DESC LIMIT 30',
      scope,
    )
  ).rows
  const slaEvents = (
    await db.query(
      'SELECT id,organization_id,crm_instance_id,lead_id,conversation_id,type,status,due_at,breached_at,resolved_at,created_at,updated_at FROM public.lead_sla_events WHERE lead_id=$1 AND organization_id=$2 AND crm_instance_id=$3 ORDER BY due_at LIMIT 50',
      scope,
    )
  ).rows
  const quickReplies = (
    await db.query(
      'SELECT id,crm_instance_id,label,body,category,channel,is_active,created_at,updated_at FROM public.crm_quick_replies WHERE crm_instance_id=$1 AND is_active ORDER BY label LIMIT 100',
      [lead.crm_instance_id],
    )
  ).rows
  const templates = (
    await db.query(
      "SELECT id,crm_instance_id,name,channel,body,status,requires_opt_in,category,created_at,updated_at FROM public.crm_message_templates WHERE crm_instance_id=$1 AND status='active' ORDER BY name LIMIT 100",
      [lead.crm_instance_id],
    )
  ).rows
  return {
    conversations,
    insights,
    fieldSuggestions,
    responseSuggestions,
    slaEvents,
    quickReplies,
    templates,
  }
}
