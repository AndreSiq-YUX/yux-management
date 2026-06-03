import { useParams } from 'react-router-dom'
import { WebchatWidget } from '@/components/webchat/WebchatWidget'

export function WebchatWidgetPage() {
  const { sessionToken } = useParams()

  if (!sessionToken) {
    return <p className="p-4 text-sm text-gray-600">Atendimento indisponivel.</p>
  }

  return <WebchatWidget sessionToken={sessionToken} />
}
