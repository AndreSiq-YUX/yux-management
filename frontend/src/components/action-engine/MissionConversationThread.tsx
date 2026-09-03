import { Bot, ExternalLink, Loader2, RotateCcw, Sparkles, UserRound } from 'lucide-react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { MissionBriefCard } from './MissionBriefCard'
import { MissionConversationPlanCard } from './MissionConversationPlanCard'
import type { DecisionReasonKey, MissionConversation, MissionConversationMissingContext, MissionConversationPlanReference } from '@/types/actionEngine'

type Props = {
  conversation: MissionConversation
  processing: boolean
  processingError?: string | null
  canWrite: boolean
  onQuickReply: (message: string) => void
  onConfirmBrief?: () => void
  onRetry?: () => void
  onApprovePlan?: (reference: MissionConversationPlanReference) => void
  onRequestPlanChanges?: (reference: MissionConversationPlanReference, reasonKey: DecisionReasonKey, comment?: string) => void
  correctionHref?: (missing: MissionConversationMissingContext) => string | undefined
}

export function MissionConversationThread({ conversation, processing, processingError, canWrite, onQuickReply, onConfirmBrief, onRetry, onApprovePlan, onRequestPlanChanges, correctionHref }: Props) {
  return (
    <Conversation className="min-h-0 bg-slate-50/70">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-7 sm:px-6">
        <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-slate-700">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>Converse naturalmente. Vou combinar a metodologia da YUX, o contexto da empresa e as ferramentas disponíveis antes de propor qualquer execução.</p>
        </div>
        {conversation.messages.map(message => {
          const isUser = message.actorType === 'user'
          const payload = message.structuredPayload
          const missing = payload.readiness?.missing ?? []
          const actions = payload.suggestedActions ?? []
          return (
            <Message from={isUser ? 'user' : 'assistant'} key={message.id} className="max-w-full">
              <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isUser ? 'bg-slate-900 text-white' : 'bg-blue-600 text-white'}`}>{isUser ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
                <MessageContent className={isUser ? 'max-w-[82%] bg-slate-900 text-white' : 'max-w-[88%] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm'}>
                  <MessageResponse className={isUser ? 'text-white' : 'text-slate-700'}>{message.content}</MessageResponse>
                  {!isUser && payload.questions?.length ? <div className="mt-4 space-y-3">{payload.questions.map(question => <div className="rounded-lg bg-slate-50 p-3" key={question.key}><p className="text-sm font-semibold text-slate-800">{question.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{question.whyNeeded}</p>{canWrite && question.choices?.length ? <div className="mt-3 flex flex-wrap gap-2">{question.choices.map(choice => <button className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50" key={choice} onClick={() => onQuickReply(choice)} type="button">{choice}</button>)}</div> : null}</div>)}</div> : null}
                  {!isUser && missing.length ? <div className="mt-4 space-y-2">{missing.map(item => <MissingContextCard correctionHref={correctionHref?.(item)} item={item} key={item.key} />)}</div> : null}
                  {!isUser && actions.length ? <div className="mt-4 flex flex-wrap gap-2">{actions.map(action => action.kind === 'quick_reply' ? <button className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100" key={action.key} onClick={() => onQuickReply(action.label)} type="button">{action.label}</button> : null)}</div> : null}
                  {!isUser && message.messageKind === 'brief' && payload.brief ? <MissionBriefCard brief={payload.brief} disabled={!canWrite || processing} onConfirm={canWrite && onConfirmBrief ? onConfirmBrief : undefined} /> : null}
                  {!isUser && message.messageKind === 'plan' && onApprovePlan && onRequestPlanChanges ? <MissionConversationPlanCard payload={payload} canApprove={canWrite} busy={processing} onApprove={onApprovePlan} onRequestChanges={onRequestPlanChanges} /> : null}
                </MessageContent>
              </div>
            </Message>
          )
        })}
        {processing ? <div className="flex items-start gap-3" aria-label="Agente analisando"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-white"><Bot className="h-4 w-4" /></span><div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-blue-600" />Consultando estratégia YUX e contexto da empresa…</div></div> : null}
        {processingError && !processing ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{processingErrorMessage(processingError)}</p>{canWrite && onRetry ? <button className="mt-3 inline-flex items-center gap-2 font-semibold text-amber-900 hover:underline" onClick={onRetry} type="button"><RotateCcw className="h-4 w-4" />Tentar novamente sem reenviar</button> : null}</div> : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

function processingErrorMessage(code: string) {
  if (code === 'insufficient_ai_credits') return 'Os créditos de IA deste contrato acabaram. Sua mensagem foi salva; recarregue os créditos e tente novamente sem reenviar.'
  if (code === 'harness_unavailable') return 'O agente de estratégia está temporariamente indisponível. Sua mensagem foi salva.'
  if (code === 'harness_timeout' || code === 'conversation_processing_stalled') return 'A análise demorou mais do que o esperado. Sua mensagem foi salva.'
  return 'Não consegui concluir esta análise agora. Sua mensagem foi salva.'
}

function MissingContextCard({ item, correctionHref }: { item: MissionConversationMissingContext; correctionHref?: string }) {
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-medium text-amber-950">{item.reason}</p>{correctionHref ? <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline" href={correctionHref}>Preencher esta informação <ExternalLink className="h-3 w-3" /></a> : null}</div>
}
