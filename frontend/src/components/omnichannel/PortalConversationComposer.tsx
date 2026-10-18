import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Paperclip, RefreshCw, Send } from 'lucide-react'
import { PendingBadge, portalButtonClasses } from '@/components/portal-ui'
import { getPendingFeature } from '@/lib/client-portal/pendingFeatures'

interface PortalConversationComposerProps {
  conversationId: string
  /** Mensagem enviada que falhou; mostra o aviso com "Reenviar". */
  failedMessageId?: string
  onSendReply?: (conversationId: string, body: string) => void
  onRetry?: (messageId: string) => void
}

/** Campo de resposta, fixo na base da conversa (inclusive no celular). */
export function PortalConversationComposer({ conversationId, failedMessageId, onSendReply, onRetry }: PortalConversationComposerProps) {
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const [attachInfoOpen, setAttachInfoOpen] = useState(false)
  const attachInfoId = useId()

  const handleSend = () => {
    const body = replyRef.current?.value.trim() || ''
    if (!body) return
    onSendReply?.(conversationId, body)
    if (replyRef.current) replyRef.current.value = ''
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <section
      aria-label="Responder conversa"
      className="shrink-0 space-y-2 border-t border-yx-line bg-yx-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {failedMessageId ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-[13px] font-medium text-yx-crit">
          <span className="mr-auto">Uma mensagem não foi enviada.</span>
          <button type="button" onClick={() => onRetry?.(failedMessageId)} className={portalButtonClasses('ghost', 'px-3')}>
            <RefreshCw aria-hidden="true" />
            Reenviar
          </button>
        </div>
      ) : null}
      {attachInfoOpen ? (
        <p id={attachInfoId} role="status" className="flex flex-wrap items-center gap-2 text-xs leading-snug text-yx-fg-2">
          <PendingBadge code="B26" />
          {getPendingFeature('B26').clientMessage}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        {/* Pendente (B26): continua visível, só explica que está em implantação; não envia nada. */}
        <button
          type="button"
          aria-label="Anexar arquivo"
          aria-disabled="true"
          aria-describedby={attachInfoOpen ? attachInfoId : undefined}
          title={`Pendente: ${getPendingFeature('B26').title}`}
          onClick={() => setAttachInfoOpen(open => !open)}
          className={portalButtonClasses('ghost', 'relative h-10 w-10 shrink-0 px-0 opacity-70')}
        >
          <Paperclip aria-hidden="true" />
          <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400" />
        </button>
        <textarea
          ref={replyRef}
          name="portal-reply"
          rows={1}
          aria-label="Escreva sua resposta"
          placeholder="Escreva uma resposta"
          onKeyDown={handleKeyDown}
          className="max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-lg border border-yx-line-strong bg-yx-surface px-3 py-2 text-sm text-yx-fg placeholder:text-yx-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
        />
        <button type="button" onClick={handleSend} className={portalButtonClasses('primary', 'shrink-0')}>
          <Send aria-hidden="true" />
          Enviar
        </button>
      </div>
    </section>
  )
}
