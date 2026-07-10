import { useEffect, useState } from 'react'
import { WebchatWidget } from '@/components/webchat/WebchatWidget'

export function WebchatWidgetPage() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  useEffect(() => {
    const receiveBootstrap = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || typeof payload !== 'object') return
      const data = payload as { type?: unknown; sessionToken?: unknown }
      if (data.type !== 'yux_webchat_bootstrap' || typeof data.sessionToken !== 'string' || !data.sessionToken.trim()) return
      setSessionToken(data.sessionToken)
    }

    window.addEventListener('message', receiveBootstrap)
    window.parent?.postMessage({ type: 'yux_webchat_ready' }, window.location.origin)
    return () => window.removeEventListener('message', receiveBootstrap)
  }, [])

  if (!sessionToken) {
    return <p className="p-4 text-sm text-gray-600">Atendimento indisponivel.</p>
  }

  return <WebchatWidget sessionToken={sessionToken} />
}
