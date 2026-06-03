import { useRef } from 'react'
import { Bot, Check, GitBranch, RefreshCw, RotateCcw, Send, UserCheck, UserRoundPlus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ResponseMode } from '@/types/omnichannel'

interface ConversationComposerProps {
  conversationId: string
  suggestionMessageId?: string
  failedMessageId?: string
  onSendReply?: (conversationId: string, body: string) => void
  onApproveSuggestion?: (messageId: string) => void
  onAssign?: (conversationId: string) => void
  onReassign?: (conversationId: string) => void
  onHandoff?: (conversationId: string) => void
  onResolve?: (conversationId: string) => void
  onReopen?: (conversationId: string) => void
  onRetry?: (messageId: string) => void
  onModeChange?: (conversationId: string, mode: ResponseMode) => void
}

export function ConversationComposer({
  conversationId,
  suggestionMessageId,
  failedMessageId,
  onSendReply,
  onApproveSuggestion,
  onAssign,
  onReassign,
  onHandoff,
  onResolve,
  onReopen,
  onRetry,
  onModeChange,
}: ConversationComposerProps) {
  const replyRef = useRef<HTMLTextAreaElement>(null)

  return (
    <section className="border-t bg-white p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        <Button type="button" size="icon" variant="outline" title="Aprovar resposta assistida" onClick={() => suggestionMessageId && onApproveSuggestion?.(suggestionMessageId)}><Check className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Atribuir conversa" onClick={() => onAssign?.(conversationId)}><UserCheck className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Reatribuir conversa" onClick={() => onReassign?.(conversationId)}><UserRoundPlus className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Handoff manual" onClick={() => onHandoff?.(conversationId)}><GitBranch className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Resolver conversa" onClick={() => onResolve?.(conversationId)}><XCircle className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Reabrir conversa" onClick={() => onReopen?.(conversationId)}><RotateCcw className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Tentar novamente" onClick={() => failedMessageId && onRetry?.(failedMessageId)}><RefreshCw className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" title="Modo automatico" onClick={() => onModeChange?.(conversationId, 'automatic')}><Bot className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="outline" title="Modo assistido" onClick={() => onModeChange?.(conversationId, 'assisted')}>IA</Button>
        <Button type="button" size="sm" variant="outline" title="Modo manual" onClick={() => onModeChange?.(conversationId, 'manual')}>M</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <textarea
          ref={replyRef}
          name="reply"
          className="min-h-[72px] rounded-md border px-3 py-2 text-sm"
          placeholder="Responder como agente"
        />
        <Button
          type="button"
          title="Enviar resposta"
          onClick={() => {
            const body = replyRef.current?.value.trim() || ''
            if (body) onSendReply?.(conversationId, body)
          }}
        >
          <Send className="mr-2 h-4 w-4" />
          Enviar
        </Button>
      </div>
    </section>
  )
}
