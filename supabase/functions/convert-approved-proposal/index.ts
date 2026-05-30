import { corsHeaders, getAdminClient, getUserClient, json } from '../_shared/edge.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const { proposalId } = await req.json()
    const { data: visible } = await getUserClient(authorization).from('proposals').select('id').eq('id', proposalId).single()
    if (!visible) return json({ error: 'Proposal not found' }, 404)
    const admin = getAdminClient()
    const result = await admin.rpc('convert_approved_proposal_service', { target_proposal_id: proposalId })
    if (result.error) throw result.error
    return json({ success: true, conversion: result.data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Conversion failed' }, 500)
  }
})
