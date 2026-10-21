import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { metaChannelService, type WhatsAppTestSendResult } from '@/services/metaChannelService'
import { omnichannelService, type OmnichannelMessageView } from '@/services/omnichannelService'

const statusLabels: Record<string, string> = {
  queued: 'Na fila de envio', processing: 'Envio em processamento', sent: 'Aceita pela Meta',
  delivered: 'Entregue ao destinatário', read: 'Lida pelo destinatário', failed: 'Falha no envio',
  ambiguous: 'Resultado não confirmado — confira o WhatsApp antes de qualquer novo envio',
}

function errorLabel(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code === 'whatsapp_test_recent_conversation_required') return 'Envie primeiro uma mensagem do celular destinatário para este número e aguarde a conversa aparecer no YUX. O teste de texto exige uma mensagem recebida nas últimas 24 horas.'
  if (code === 'whatsapp_connection_unavailable') return 'Reconecte este número e verifique a conexão antes do teste.'
  if (code === 'whatsapp_test_request_conflict') return 'Esta solicitação já foi registrada com outros dados. Confira o histórico da conversa.'
  return 'Não foi possível confirmar a solicitação. Tentar novamente usa a mesma identificação para evitar duplicidade.'
}

export function WhatsAppTestSendForm({ connectionId, senderNumber }: { connectionId: string; senderNumber: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WhatsAppTestSendResult | null>(null)
  const [message, setMessage] = useState<OmnichannelMessageView | null>(null)
  const [lookupError, setLookupError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const sending = useRef(false)
  const attempt = useRef<{ requestId: string; recipient: string; message: string } | null>(null)

  useEffect(() => {
    if (!result) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    async function checkStatus() {
      let terminal = false
      try {
        const messages = await omnichannelService.getMessages(result!.conversationId)
        if (cancelled) return
        const found = messages.find(item => item.id === result!.messageId)
        if (found) {
          setMessage(found)
          terminal = ['delivered', 'read', 'failed'].includes(found.deliveryStatus) || found.metadata.dispatchOutcome === 'ambiguous'
        }
        setLookupError(false)
      } catch {
        if (cancelled) return
        setLookupError(true)
      }
      attempts += 1
      if (!cancelled && !terminal && attempts < 30) timer = setTimeout(() => void checkStatus(), 2000)
    }
    void checkStatus()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [result, refresh])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current || result) return
    if (!attempt.current) {
      const data = new FormData(event.currentTarget)
      const recipient = String(data.get('recipient') || '').trim()
      const body = String(data.get('message') || '').trim()
      if (!/^[1-9]\d{7,14}$/.test(recipient.replace(/[\s()+-]/g, '')) || !body || data.get('confirmed') !== 'on') {
        setError('Informe um telefone com código do país, a mensagem e confirme o destinatário.')
        return
      }
      attempt.current = { requestId: crypto.randomUUID(), recipient, message: body }
    }
    sending.current = true
    setPending(true)
    setError(null)
    try {
      const response = await metaChannelService.sendTest(connectionId, { ...attempt.current, confirmed: true })
      setResult(response)
    } catch (cause) {
      setError(errorLabel(cause))
      // Validation failures happen before persistence, so the user may correct
      // the destination. A lost response keeps the same request and message ID.
      if (cause instanceof Error && ['whatsapp_test_recent_conversation_required', 'whatsapp_connection_unavailable', 'invalid_whatsapp_test_request'].includes(cause.message)) {
        attempt.current = null
      }
    } finally {
      sending.current = false
      setPending(false)
    }
  }

  const status = message?.metadata.dispatchOutcome === 'ambiguous' ? 'ambiguous' : message?.deliveryStatus || result?.deliveryStatus || 'queued'
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-yux-200 bg-yux-50 p-3">
      <h3 className="text-sm font-semibold text-gray-900">Mensagem de teste</h3>
      <p className="text-sm text-gray-700">Remetente: {senderNumber}. Envie primeiro uma mensagem do celular de teste para este número e aguarde a conversa aparecer no YUX.</p>
      <form className="space-y-3" onSubmit={send}>
        <fieldset className="space-y-3" disabled={pending || Boolean(result) || Boolean(attempt.current)}>
          <label className="block text-sm font-medium text-gray-800">Telefone destinatário, com código do país
            <input autoComplete="tel" className="mt-1 w-full rounded-md border bg-white px-3 py-2" name="recipient" placeholder="+55 11 99999-0000" required type="tel" />
          </label>
          <label className="block text-sm font-medium text-gray-800">Mensagem
            <textarea className="mt-1 w-full rounded-md border bg-white px-3 py-2" defaultValue="Teste de integração YUX — envio pelo portal confirmado" maxLength={4096} name="message" required rows={3} />
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input className="mt-1" name="confirmed" required type="checkbox" />
            Confirmo que este é o destinatário de teste autorizado e quero enviar esta mensagem.
          </label>
        </fieldset>
        {!result ? <button className="rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? 'Registrando envio…' : 'Confirmar e enviar mensagem'}</button> : null}
      </form>
      {error ? <p className="text-sm text-red-800" role="alert">{error}</p> : null}
      {result ? <div className="space-y-2 text-sm text-gray-800" role="status">
        <p className="font-semibold">{statusLabels[status] || status}</p>
        <p>A confirmação de entrega depende do retorno da Meta. Confira também o WhatsApp destinatário.</p>
        <p className="break-all text-xs">Identificação YUX: {result.messageId}</p>
        {message?.externalMessageId ? <p className="break-all text-xs">Identificação Meta: {message.externalMessageId}</p> : null}
        {status === 'failed' ? <p role="alert">O envio falhou. Verifique a conexão e a janela de atendimento no histórico da conversa.</p> : null}
        {lookupError ? <p role="alert">O andamento não pôde ser consultado. A solicitação permanece registrada; consulte novamente sem reenviar.</p> : null}
        <button className="rounded-md border bg-white px-3 py-2 text-sm" onClick={() => setRefresh(value => value + 1)} type="button">Consultar andamento</button>
      </div> : null}
    </div>
  )
}
