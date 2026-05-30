import { createPublicToken, hashToken } from '../_shared/proposalSend.ts'
import { corsHeaders, getAdminClient, getUserClient, json } from '../_shared/edge.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const { proposalId } = await req.json()
    const userClient = getUserClient(authorization)
    const admin = getAdminClient()
    const { data: proposal } = await userClient.from('proposals').select('*, proposal_items(*)').eq('id', proposalId).single()
    if (!proposal) return json({ error: 'Proposal not found' }, 404)
    const { data: rules } = await admin.from('proposal_price_rules').select('*').eq('organization_id', proposal.organization_id).eq('package_id', proposal.package_id)
    const outsideRange = (proposal.proposal_items || []).some((item: any) => {
      const rule = rules?.find((candidate: any) => candidate.item_key === item.item_key)
      return rule && (Number(item.unit_value) < Number(rule.minimum_value) || Number(item.unit_value) > Number(rule.maximum_value))
    })
    if (outsideRange && !proposal.override_reason?.trim()) return json({ error: 'Override reason is required' }, 400)
    const { data: prior } = await admin.from('proposal_versions').select('version_number').eq('proposal_id', proposalId).order('version_number', { ascending: false }).limit(1).maybeSingle()
    const snapshot = { ...proposal, proposal_items: undefined, items: proposal.proposal_items || [] }
    const { data: version, error } = await admin.from('proposal_versions').insert({ proposal_id: proposalId, version_number: (prior?.version_number || 0) + 1, snapshot }).select().single()
    if (error) throw error
    await admin.from('proposal_access_tokens').update({ revoked_at: new Date().toISOString() }).is('revoked_at', null).in('proposal_version_id', (await admin.from('proposal_versions').select('id').eq('proposal_id', proposalId)).data?.map(row => row.id) || [])
    const token = createPublicToken()
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    await admin.from('proposal_access_tokens').insert({ proposal_version_id: version.id, token_hash: await hashToken(token), expires_at: expiresAt })
    return json({ success: true, versionId: version.id, versionNumber: version.version_number, expiresAt, publicUrl: `${Deno.env.get('PUBLIC_APP_URL') || 'http://127.0.0.1:4174'}/proposal/review/${token}` })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Proposal send failed' }, 500)
  }
})
