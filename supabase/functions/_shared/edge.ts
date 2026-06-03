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

export function getUserClient(authorization: string): any {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = firstConfigured(Deno.env.get('SUPABASE_ANON_KEY'), Deno.env.get('SUPABASE_PUBLISHABLE_KEY'), firstJsonValue(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')))
  return createClient(url, key, { global: { headers: { Authorization: authorization } } })
}

export function getAdminClient(): any {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = firstConfigured(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_SECRET_KEY'), firstJsonValue(Deno.env.get('SUPABASE_SECRET_KEYS')))
  return createClient(url, key)
}

let serviceClient: any

export function getServiceRoleClient() {
  serviceClient ||= getAdminClient()
  return serviceClient
}

export async function requireAuthenticatedUser(authorization: string | null) {
  if (!authorization) throw new Error('Missing authorization header')
  const client = getUserClient(authorization)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error('Invalid authenticated user')
  return { client, user: data.user }
}

export async function hashToken(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let diff = leftBytes.length ^ rightBytes.length

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0)
  }

  return diff === 0
}

export async function adapterTokenMatches(storedHash: string, candidateToken: string) {
  return constantTimeEqual(storedHash, await hashToken(candidateToken))
}

export function formatProtectedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error')
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b(token|secret|password|credential)\s+[^,\s]+/gi, '$1 [redacted]')
}

export async function callN8nWebhookWithTimeout(
  url: string | undefined,
  payload: Record<string, unknown>,
  timeoutMs = 10_000,
) {
  if (!url) return { configured: false, status: 'skipped' as const }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { text }
    }
    return { configured: true, ok: response.ok, status: response.status, body }
  } catch (error) {
    return { configured: true, ok: false, status: 'failed' as const, error: formatProtectedError(error) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function recordConversionFailure(admin: any, proposalId: string, error: unknown) {
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
