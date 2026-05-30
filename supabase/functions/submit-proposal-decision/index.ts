import { validatePublicDecision } from '../_shared/proposalDecision.ts'
import { hashToken } from '../_shared/proposalSend.ts'
import { corsHeaders, getAdminClient, json } from '../_shared/edge.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const input = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json()
    if (!input.token) return json({ error: 'Link invalido.' }, 400)
    const admin = getAdminClient()
    const { data: access } = await admin.from('proposal_access_tokens').select('*, proposal_versions(*, proposals(id,current_version_id,status))').eq('token_hash', await hashToken(input.token)).maybeSingle()
    const version = access?.proposal_versions
    if (!access || access.revoked_at || new Date(access.expires_at) <= new Date() || !version || version.proposals?.current_version_id !== version.id || version.status !== 'pending') return json({ error: 'Link invalido ou expirado.' }, 404)
    if (req.method === 'GET') return json({ versionId: version.id, versionNumber: version.version_number, snapshot: version.snapshot, status: version.status, expiresAt: access.expires_at })
    const validationError = validatePublicDecision(input.decision, input.comment)
    if (validationError) return json({ error: validationError }, 400)
    const { error } = await admin.from('proposal_decisions').insert({ proposal_version_id: version.id, decision: input.decision, source: 'public_token', comment: input.comment?.trim() || null })
    if (error) throw error
    let conversion: unknown
    if (input.decision === 'approved') {
      const result = await admin.rpc('convert_approved_proposal_service', { target_proposal_id: version.proposal_id })
      conversion = result.error ? { pending: true } : result.data
    }
    return json({ success: true, decision: input.decision, conversion })
  } catch {
    return json({ error: 'Nao foi possivel registrar a decisao.' }, 500)
  }
})
