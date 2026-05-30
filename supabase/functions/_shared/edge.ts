import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function firstConfigured(...values: Array<string | undefined>) {
  return values.find(Boolean) || ''
}

function firstJsonValue(value?: string) {
  if (!value) return ''
  try {
    return Object.values(JSON.parse(value) as Record<string, string>)[0] || ''
  } catch {
    return ''
  }
}

export function getUserClient(authorization: string) {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = firstConfigured(Deno.env.get('SUPABASE_ANON_KEY'), Deno.env.get('SUPABASE_PUBLISHABLE_KEY'), firstJsonValue(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')))
  return createClient(url, key, { global: { headers: { Authorization: authorization } } })
}

export function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = firstConfigured(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_SECRET_KEY'), firstJsonValue(Deno.env.get('SUPABASE_SECRET_KEYS')))
  return createClient(url, key)
}

export async function recordConversionFailure(admin: ReturnType<typeof createClient>, proposalId: string, error: unknown) {
  const { data: lastRun } = await admin
    .from('proposal_conversion_runs')
    .select('attempt_number')
    .eq('proposal_id', proposalId)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  await admin.from('proposal_conversion_runs').insert({
    proposal_id: proposalId,
    attempt_number: (lastRun?.attempt_number || 0) + 1,
    status: 'failed',
    error: error instanceof Error ? error.message : 'Conversion failed',
    completed_at: new Date().toISOString(),
  })
  await admin.from('proposals').update({ status: 'conversion_failed' }).eq('id', proposalId).eq('status', 'approved')
}
