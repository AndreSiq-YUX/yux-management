import type { AppEnv } from '../config/env.js'

export async function invokeAgentRuntime<T>(env: AppEnv, path: string, body: Record<string, unknown>): Promise<T> {
  if (!env.YUX_AGENT_RUNTIME_URL || !env.YUX_AGENT_RUNTIME_TOKEN) throw new Error('agent_runtime_not_configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch(`${env.YUX_AGENT_RUNTIME_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.YUX_AGENT_RUNTIME_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await safeRuntimeErrorDetail(response)
      throw new Error(`agent_runtime_${response.status}${detail ? `:${detail}` : ''}`)
    }
    return await response.json() as T
  } finally { clearTimeout(timeout) }
}

async function safeRuntimeErrorDetail(response: Response) {
  try {
    const text = (await response.text()).slice(0, 1_000)
    if (!text) return ''
    const parsed = JSON.parse(text) as { detail?: unknown }
    const detail = typeof parsed.detail === 'string' ? parsed.detail : text
    return detail.replace(/[^a-zA-Z0-9_:.\-/]/g, '_').slice(0, 240)
  } catch {
    return ''
  }
}
