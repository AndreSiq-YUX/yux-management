import { buildFallbackDraft, normalizeSuggestedItems } from '../_shared/proposalDraft.ts'
import { corsHeaders, getAdminClient, getUserClient, json } from '../_shared/edge.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const { proposalId } = await req.json()
    if (!proposalId) return json({ error: 'proposalId is required' }, 400)

    const userClient = getUserClient(authorization)
    const admin = getAdminClient()
    const { data: visible } = await userClient.from('proposals').select('id').eq('id', proposalId).single()
    if (!visible) return json({ error: 'Proposal not found' }, 404)

    const { data: proposal, error } = await admin.from('proposals').select('*').eq('id', proposalId).single()
    if (error) throw error
    const [{ data: diagnostic }, { data: template }, { data: rules }] = await Promise.all([
      admin.from('commercial_diagnostics').select('*').eq('lead_id', proposal.lead_id).maybeSingle(),
      admin.from('proposal_templates').select('*').eq('organization_id', proposal.organization_id).eq('package_id', proposal.package_id).eq('is_active', true).limit(1).maybeSingle(),
      admin.from('proposal_price_rules').select('*').eq('organization_id', proposal.organization_id).eq('package_id', proposal.package_id),
    ])

    let status = 'fallback'
    let metadata: Record<string, unknown> = { source: 'template' }
    let draft = buildFallbackDraft({ template, diagnostic })
    const webhook = Deno.env.get('N8N_PROPOSAL_GENERATION_WEBHOOK_URL')
    if (webhook) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8_000)
        const provider = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ proposalId, diagnostic: { summary: diagnostic?.summary, painPoints: diagnostic?.pain_points, goals: diagnostic?.goals }, packageId: proposal.package_id, blueprintId: proposal.blueprint_id }),
        })
        clearTimeout(timer)
        if (!provider.ok) throw new Error(`Webhook returned ${provider.status}`)
        draft = { ...draft, ...await provider.json() }
        status = 'completed'
        metadata = { source: 'n8n' }
      } catch (providerError) {
        metadata = { source: 'template', providerError: providerError instanceof Error ? providerError.message : 'Provider failed' }
      }
    }
    const items = normalizeSuggestedItems(draft.items || [], rules || [])
    await admin.from('proposal_items').delete().eq('proposal_id', proposalId)
    if (items.length) await admin.from('proposal_items').insert(items.map(item => ({ proposal_id: proposalId, item_key: item.itemKey, label: item.label, description: item.description || null, quantity: item.quantity, unit_value: item.unitValue, order_index: item.orderIndex })))
    const finalValue = items.reduce((total, item) => total + item.quantity * item.unitValue, 0)
    await admin.from('proposals').update({ scope: draft.scope, whatsapp_message: draft.whatsappMessage, email_subject: draft.emailSubject, email_body: draft.emailBody, final_value: finalValue }).eq('id', proposalId)
    await admin.from('ai_generation_runs').insert({ proposal_id: proposalId, status, input_summary: { leadId: proposal.lead_id, packageId: proposal.package_id }, result_metadata: metadata, completed_at: new Date().toISOString() })
    return json({ success: true, status, draft: { ...draft, items, finalValue } })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Draft generation failed' }, 500)
  }
})
