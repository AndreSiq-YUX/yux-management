import { Link } from 'react-router-dom'
import { Bot, ExternalLink, Loader2, RotateCcw, Sparkles, UserRound } from 'lucide-react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { MissionBriefCard } from './MissionBriefCard'
import { MissionConversationPlanCard } from './MissionConversationPlanCard'
import type { DecisionReasonKey, MissionConversation, MissionConversationMissingContext, MissionConversationPlanReference } from '@/types/actionEngine'
import type { ResolvedCorrectionTarget } from '@/lib/workspace/correctionTargets'

type Props = {
  strategyHref?: string
  conversation: MissionConversation
  processing: boolean
  processingError?: string | null
  canWrite: boolean
  onQuickReply: (message: string) => void
  onConfirmBrief?: () => void
  onRetry?: () => void
  onApprovePlan?: (reference: MissionConversationPlanReference) => void
  onRequestPlanChanges?: (reference: MissionConversationPlanReference, reasonKey: DecisionReasonKey, comment?: string) => void
  correctionTarget?: (missing: MissionConversationMissingContext) => ResolvedCorrectionTarget | null
  onInlineCorrection?: (missing: MissionConversationMissingContext, target: ResolvedCorrectionTarget) => void
}

export function MissionConversationThread({ strategyHref, conversation, processing, processingError, canWrite, onQuickReply, onConfirmBrief, onRetry, onApprovePlan, onRequestPlanChanges, correctionTarget, onInlineCorrection }: Props) {
  return (
    <Conversation className="min-h-0 bg-yx-surface-2">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-7 sm:px-6">
        <div className="flex gap-3 rounded-xl border border-yx-line-strong bg-yx-blue-soft p-4 text-sm leading-6 text-yx-fg-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-yx-blue" />
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
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isUser ? 'bg-yx-blue text-white' : 'bg-yx-blue text-white'}`}>{isUser ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
                <MessageContent className={isUser ? 'max-w-[82%] !bg-yx-blue !text-white' : 'max-w-[88%] rounded-xl border border-yx-line bg-yx-surface px-4 py-3 shadow-sm'}>
                  <MessageResponse className={isUser ? '!text-white [&_*]:!text-white' : 'text-yx-fg-2'}>{message.content}</MessageResponse>
                  {!isUser && payload.strategyProposalReference && strategyHref && canWrite ? <div className="mt-4 rounded-lg border border-yx-line bg-yx-blue-soft p-4"><p className="text-sm">Uma proposta de estratégia está disponível para sua revisão. Nenhuma alteração foi publicada.</p><Link className="mt-2 inline-block text-sm font-semibold text-yx-blue" to={`${strategyHref}?proposalId=${encodeURIComponent(payload.strategyProposalReference.proposalId)}`}>Revisar estratégia</Link></div> : null}
                  {!isUser && payload.questions?.length ? <div className="mt-4 space-y-3">{payload.questions.map(question => <div className="rounded-lg bg-yx-surface-2 p-3" key={question.key}><p className="text-sm font-semibold text-yx-fg">{question.label}</p><p className="mt-1 text-xs leading-5 text-yx-fg-3">{question.whyNeeded}</p>{canWrite && question.choices?.length ? <div className="mt-3 flex flex-wrap gap-2">{question.choices.map(choice => <button className="rounded-full border border-yx-line-strong bg-yx-surface px-3 py-1.5 text-xs font-semibold text-yx-blue hover:bg-yx-blue-soft" key={choice} onClick={() => onQuickReply(choice)} type="button">{choice}</button>)}</div> : null}</div>)}</div> : null}
                  {!isUser && missing.length ? <div className="mt-4 space-y-2">{missing.map(item => <MissingContextCard target={correctionTarget?.(item) ?? null} onInline={() => { const target = correctionTarget?.(item); if (target?.mode === 'inline') onInlineCorrection?.(item, target) }} item={item} key={item.key} />)}</div> : null}
                  {!isUser && actions.length ? <div className="mt-4 flex flex-wrap gap-2">{actions.map(action => action.kind === 'quick_reply' ? <button className="rounded-full border border-yx-line-strong bg-yx-blue-soft px-3 py-1.5 text-xs font-semibold text-yx-blue hover:bg-yx-blue-soft" key={action.key} onClick={() => onQuickReply(action.label)} type="button">{action.label}</button> : null)}</div> : null}
                  {!isUser && message.messageKind === 'brief' && payload.brief ? <MissionBriefCard brief={payload.brief} disabled={!canWrite || processing} onConfirm={canWrite && onConfirmBrief ? onConfirmBrief : undefined} /> : null}
                  {!isUser && message.messageKind === 'plan' && onApprovePlan && onRequestPlanChanges ? <MissionConversationPlanCard payload={payload} canApprove={canWrite} busy={processing} onApprove={onApprovePlan} onRequestChanges={onRequestPlanChanges} /> : null}
                </MessageContent>
              </div>
            </Message>
          )
        })}
        {processing ? <div className="flex items-start gap-3" aria-label="Agente analisando"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-yx-blue text-white"><Bot className="h-4 w-4" /></span><div className="flex items-center gap-2 rounded-xl border border-yx-line-strong bg-yx-surface px-4 py-3 text-sm text-yx-fg-2 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-yx-blue" />Consultando estratégia YUX e contexto da empresa…</div></div> : null}
        {processingError && !processing ? <div className="rounded-xl border border-yx-warn-line bg-yx-warn-soft p-4 text-sm text-yx-warn"><p>{processingErrorMessage(processingError)}</p>{canWrite && onRetry ? <button className="mt-3 inline-flex items-center gap-2 font-semibold text-yx-warn hover:underline" onClick={onRetry} type="button"><RotateCcw className="h-4 w-4" />Tentar novamente sem reenviar</button> : null}</div> : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

function processingErrorMessage(code: string) {
  if (code === 'harness_response_incomplete') return 'A resposta do agente foi interrompida antes de terminar. Sua mensagem foi salva; tente novamente sem reenviar.'
  if (code === 'harness_response_invalid') return 'A resposta do agente não pôde ser validada. Sua mensagem foi salva; tente novamente sem reenviar.'
  if (code === 'insufficient_ai_credits') return 'Os créditos de IA deste contrato acabaram. Sua mensagem foi salva; recarregue os créditos e tente novamente sem reenviar.'
  if (code === 'harness_unavailable') return 'O agente de estratégia está temporariamente indisponível. Sua mensagem foi salva.'
  if (code === 'harness_timeout' || code === 'conversation_processing_stalled') return 'A análise demorou mais do que o esperado. Sua mensagem foi salva.'
  return 'Não consegui concluir esta análise agora. Sua mensagem foi salva.'
}

function MissingContextCard({ item, target, onInline }: { item: MissionConversationMissingContext; target: ResolvedCorrectionTarget | null; onInline: () => void }) {
  return <div className="rounded-lg border border-yx-warn-line bg-yx-warn-soft p-3"><p className="text-sm font-medium text-yx-warn">{item.reason}</p>{target?.mode === 'inline' ? <button className="mt-2 text-xs font-semibold text-yx-warn hover:underline" onClick={onInline} type="button">Preencher nesta conversa</button> : target?.path ? <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-yx-warn hover:underline" href={target.path}>Preencher esta informação <ExternalLink className="h-3 w-3" /></a> : null}</div>
}
