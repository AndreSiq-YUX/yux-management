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
  const preparing = conversation.messages.at(-1)?.structuredPayload.crmPreparation === 'running'
  const latestMessageId = conversation.messages.at(-1)?.id
  return (
    <Conversation className="min-h-0 bg-yx-surface-2">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-7 sm:px-6">
        <div className="flex gap-3 rounded-xl border border-yx-line-strong bg-yx-blue-soft p-4 text-sm leading-6 text-yx-fg-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-yx-blue" />
          <p>Converse naturalmente. Vou combinar a metodologia da YUX, o contexto da empresa e as ferramentas disponíveis antes de propor qualquer execução.</p>
        </div>
        {conversation.messages.map(message => {
          const isUser = message.actorType === 'user'
          const isCurrent = !isUser && message.id === latestMessageId
          const canRespond = isCurrent && canWrite && !processing
          const payload = message.structuredPayload
          const questions = payload.questions ?? []
          const questionKeys = new Set(questions.map(question => question.key))
          const choiceLabels = new Set(questions.flatMap(question => question.choices ?? []))
          const missing = (payload.readiness?.missing ?? []).filter(item => !questionKeys.has(item.key))
          const executionMissing = missing.filter(isExecutionPrerequisite)
          const businessMissing = missing.filter(item => !isExecutionPrerequisite(item))
          const actions = (payload.suggestedActions ?? []).filter(action => !choiceLabels.has(action.label))
          return (
            <Message from={isUser ? 'user' : 'assistant'} key={message.id} className="max-w-full">
              <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isUser ? 'bg-yx-blue text-white' : 'bg-yx-blue text-white'}`}>{isUser ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
                <MessageContent className={isUser ? 'max-w-[82%] !bg-yx-blue !text-white' : 'max-w-[88%] rounded-xl border border-yx-line bg-yx-surface px-4 py-3 shadow-sm'}>
                  <MessageResponse className={isUser ? '!text-white [&_*]:!text-white' : 'text-yx-fg-2'}>{message.content}</MessageResponse>
                  {!isUser && payload.strategyProposalReference && strategyHref && canWrite ? <div className="mt-4 rounded-lg border border-yx-line bg-yx-blue-soft p-4"><p className="text-sm">Uma proposta de estratégia está disponível para sua revisão. Nenhuma alteração foi publicada.</p><Link className="mt-2 inline-block text-sm font-semibold text-yx-blue" to={`${strategyHref}?proposalId=${encodeURIComponent(payload.strategyProposalReference.proposalId)}`}>Revisar estratégia</Link></div> : null}
                  {!isUser && questions.length ? isCurrent ? <div className="mt-5 space-y-4 border-l-2 border-yx-line-strong pl-4">{questions.map(question => <div key={question.key}><p className="text-sm leading-6 text-yx-fg">{question.label}</p>{canRespond && question.choices?.length ? <div className="mt-2 flex flex-wrap gap-2">{question.choices.map(choice => <button className="rounded-full border border-yx-line-strong px-3 py-1.5 text-xs text-yx-blue hover:bg-yx-blue-soft" key={choice} onClick={() => onQuickReply(choice)} type="button">{choice}</button>)}</div> : null}</div>)}</div> : <details className="mt-3 text-xs text-yx-fg-3"><summary className="cursor-pointer">Perguntas desta etapa</summary><ul className="mt-2 list-disc space-y-1 pl-4">{questions.map(question => <li key={question.key}>{question.label}</li>)}</ul></details> : null}
                  {!isUser && isCurrent && businessMissing.length ? <details className="mt-4 rounded-lg border border-yx-line px-3 py-2 text-sm text-yx-fg-3"><summary className="cursor-pointer">Pontos para aprofundar ({businessMissing.length})</summary><p className="mt-2 text-xs leading-5">Podemos detalhar estes pontos conforme a conversa avançar.</p><div className="mt-3 space-y-3">{businessMissing.map(item => <MissingContextCard target={canRespond ? correctionTarget?.(item) ?? null : null} onInline={() => { const target = correctionTarget?.(item); if (target?.mode === 'inline') onInlineCorrection?.(item, target) }} item={item} key={item.key} />)}</div></details> : null}
                  {!isUser && isCurrent && executionMissing.length ? <details className="mt-4 rounded-lg border border-yx-line px-3 py-2 text-sm text-yx-fg-3"><summary className="cursor-pointer">Antes de executar ({executionMissing.length})</summary><div className="mt-3 space-y-3">{executionMissing.map(item => <MissingContextCard target={canRespond ? correctionTarget?.(item) ?? null : null} onInline={() => { const target = correctionTarget?.(item); if (target?.mode === 'inline') onInlineCorrection?.(item, target) }} item={item} key={item.key} />)}</div></details> : null}
                  {canRespond && actions.length ? <div className="mt-4 flex flex-wrap gap-2">{actions.map(action => action.kind === 'quick_reply' ? <button className="rounded-full border border-yx-line-strong bg-yx-blue-soft px-3 py-1.5 text-xs font-semibold text-yx-blue hover:bg-yx-blue-soft" key={action.key} onClick={() => onQuickReply(action.label)} type="button">{action.label}</button> : null)}</div> : null}
                  {!isUser && message.messageKind === 'brief' && payload.brief ? <MissionBriefCard brief={payload.brief} disabled={!canRespond} onConfirm={canRespond && onConfirmBrief ? onConfirmBrief : undefined} /> : null}
                  {!isUser && message.messageKind === 'plan' && onApprovePlan && onRequestPlanChanges ? <MissionConversationPlanCard payload={payload} canApprove={canRespond} busy={processing} onApprove={onApprovePlan} onRequestChanges={onRequestPlanChanges} /> : null}
                </MessageContent>
              </div>
            </Message>
          )
        })}
        {processing ? <div className="flex items-start gap-3" aria-label="Agente analisando"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-yx-blue text-white"><Bot className="h-4 w-4" /></span><div className="flex items-center gap-2 rounded-xl border border-yx-line-strong bg-yx-surface px-4 py-3 text-sm text-yx-fg-2 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-yx-blue" />{preparing ? 'Criando os rascunhos de CRM, funil e e-mails…' : 'Consultando estratégia YUX e contexto da empresa…'}</div></div> : null}
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
  const configuration = item.category === 'integration' || ['channel_connection', 'provider_connection', 'contract_modules'].includes(item.correctionKey ?? '')
  return <div><p className="text-sm leading-6 text-yx-fg-2">{item.reason}</p>{target?.mode === 'inline' && !configuration ? <button className="mt-1 text-xs font-semibold text-yx-blue hover:underline" onClick={onInline} type="button">Preencher nesta conversa</button> : target?.path ? <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-yx-blue hover:underline" href={target.path}>{configuration ? 'Ver configuração' : 'Ver informação'} <ExternalLink className="h-3 w-3" /></a> : null}</div>
}

function isExecutionPrerequisite(item: MissionConversationMissingContext) {
  return item.category === 'integration' || item.requiredFor?.includes('mission_execution') === true
    || ['channel_connection', 'provider_connection', 'contract_modules'].includes(item.correctionKey ?? '')
}
