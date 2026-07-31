import { useEffect, useRef, useState } from 'react'
import { Paperclip, RefreshCw, Send, UserRoundCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WidgetConfig {
  name: string
  branding?: { primaryColor?: string }
  consentText?: string
  initialForm?: string[]
}

interface WebchatMessage {
  id: string
  authorType: string
  body: string
}

type InvokeWebchat = (action: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>

interface WebchatWidgetProps {
  sessionToken: string
  invoke?: InvokeWebchat
}

const defaultInvoke: InvokeWebchat = async (action, payload) => {
  const endpoint = '/api/public/webchat/events'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, origin: window.location.origin, ...payload }),
  })
  if (!response.ok) throw new Error('Webchat request failed')
  return response.json()
}

export function WebchatWidget({ sessionToken, invoke = defaultInvoke }: WebchatWidgetProps) {
  const [widget, setWidget] = useState<WidgetConfig>()
  const [messages, setMessages] = useState<WebchatMessage[]>([])
  const [notFound, setNotFound] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    invoke('load_session', { sessionToken })
      .then(result => {
        if (result.notFound) {
          setNotFound(true)
          return
        }
        setWidget(result.widget as WidgetConfig)
        setMessages((result.messages as WebchatMessage[]) || [])
      })
      .catch(() => setNotFound(true))
  }, [invoke, sessionToken])

  const sendMessage = () => {
    const body = messageRef.current?.value.trim() || ''
    const consentAccepted = Boolean(consentRef.current?.checked)
    if (!body || !consentAccepted) return
    invoke('send_message', {
      sessionToken,
      body,
      contact: {
        name: nameRef.current?.value || '',
        email: emailRef.current?.value || '',
      },
      consentAccepted,
    }).then(result => {
      if (result.message) setMessages(current => [...current, result.message as WebchatMessage])
      if (messageRef.current) messageRef.current.value = ''
    })
  }

  const pollMessages = () => {
    invoke('poll_messages', { sessionToken }).then(result => {
      setMessages((result.messages as WebchatMessage[]) || [])
    })
  }

  const primaryColor = widget?.branding?.primaryColor || '#111827'

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b px-4 py-3" style={{ borderTop: `4px solid ${primaryColor}` }}>
        <h1 className="text-lg font-semibold text-gray-900">{widget?.name || 'Atendimento indisponivel'}</h1>
        {notFound && <p className="text-sm text-gray-500">Atendimento indisponivel no momento.</p>}
      </header>
      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        {widget?.consentText && (
          <label className="flex items-start gap-2 rounded-md border bg-gray-50 p-3 text-sm">
            <input ref={consentRef} name="consent" type="checkbox" className="mt-1" />
            <span>{widget.consentText}</span>
          </label>
        )}
        {widget?.initialForm?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {widget.initialForm.includes('name') && <input ref={nameRef} name="name" className="h-10 rounded-md border px-3 text-sm" placeholder="Nome" />}
            {widget.initialForm.includes('email') && <input ref={emailRef} name="email" className="h-10 rounded-md border px-3 text-sm" placeholder="Email" />}
          </div>
        ) : null}
        <div className="space-y-2">
          {messages.map(message => (
            <article key={message.id} className={`max-w-[82%] rounded-md border p-3 text-sm ${message.authorType === 'contact' ? 'ml-auto bg-yux-50' : 'bg-gray-50'}`}>
              <p>{message.body}</p>
            </article>
          ))}
        </div>
      </main>
      <footer className="space-y-2 border-t p-3">
        <textarea ref={messageRef} name="message" className="min-h-[70px] w-full rounded-md border px-3 py-2 text-sm" placeholder="Digite sua mensagem" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" title="Enviar mensagem" onClick={sendMessage}><Send className="mr-2 h-4 w-4" />Enviar</Button>
          <Button type="button" variant="outline" title="Solicitar anexo" onClick={() => invoke('request_attachment_upload', { sessionToken })}><Paperclip className="mr-2 h-4 w-4" />Anexo</Button>
          <Button type="button" variant="outline" title="Transferir para humano" onClick={() => invoke('request_human', { sessionToken })}><UserRoundCheck className="mr-2 h-4 w-4" />Humano</Button>
          <Button type="button" variant="outline" title="Atualizar conversa" onClick={pollMessages}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>
      </footer>
    </div>
  )
}
