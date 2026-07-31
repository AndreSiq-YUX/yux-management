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
    if (!response.ok) throw new Error(`agent_runtime_${response.status}`)
    return await response.json() as T
  } finally { clearTimeout(timeout) }
}
