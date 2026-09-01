import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, ExternalLink, Loader2, MoreHorizontal, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MissionConversationComposer } from './MissionConversationComposer'
import { MissionConversationThread } from './MissionConversationThread'
import { MissionContextDrawer } from './MissionContextDrawer'
import { actionEngineService } from '@/services/actionEngineService'
import type { MissionConversation, MissionConversationMessage, MissionConversationMissingContext } from '@/types/actionEngine'

type Props = {
  conversationId: string
  organizationId: string
  canWrite: boolean
  backHref: string
  missionHref: (missionId: string) => string
  correctionHref?: (missing: MissionConversationMissingContext) => string | undefined
  pollMaxSeconds?: number
}

const POLLING_STATUSES = new Set(['collecting_context', 'planning'])

export function MissionConversationWorkspace({ conversationId, organizationId, canWrite, backHref, missionHref, correctionHref, pollMaxSeconds = 5 }: Props) {
  const [conversation, setConversation] = useState<MissionConversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [acceptedTurn, setAcceptedTurn] = useState<number | null>(null)
  const [pendingRetry, setPendingRetry] = useState<{ message: string; clientMessageId: string; expectedVersion: number } | null>(null)
  const pollingAttempt = useRef(0)
  const mounted = useRef(true)
  const conversationStatus = conversation?.status
  const conversationVersion = conversation?.version
  const shouldPoll = conversationStatus ? POLLING_STATUSES.has(conversationStatus) : false

  const load = useCallback(async () => {
    const next = await actionEngineService.getMissionConversation(conversationId, organizationId)
    if (!mounted.current) return next
    setConversation(next)
    setError(null)
    if (!POLLING_STATUSES.has(next.status)) {
      setAcceptedTurn(null)
      pollingAttempt.current = 0
    }
    return next
  }, [conversationId, organizationId])

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    load().catch(cause => setError(readError(cause))).finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false }
  }, [load])

  useEffect(() => {
    if (!shouldPoll) return
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const next = await load()
        if (cancelled || !POLLING_STATUSES.has(next.status)) return
      } catch (cause) {
        if (!cancelled) setError(readError(cause))
      }
      if (cancelled) return
      const delays = [1000, 2000, 4000]
      const delay = Math.min(delays[Math.min(pollingAttempt.current, delays.length - 1)], pollMaxSeconds * 1000)
      pollingAttempt.current += 1
      timer = window.setTimeout(poll, delay)
    }
    void poll()
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer) }
  }, [shouldPoll, conversationVersion, load, pollMaxSeconds])

  useEffect(() => {
    const onFocus = () => { if (shouldPoll) void load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [shouldPoll, load])

  const send = async (message: string, retry?: { clientMessageId: string; expectedVersion: number }) => {
    if (!conversation || !canWrite || acceptedTurn != null) return
    const clientMessageId = retry?.clientMessageId ?? crypto.randomUUID()
    const expectedVersion = retry?.expectedVersion ?? conversation.version
    const optimistic = optimisticMessage(conversation, message, clientMessageId)
    if (!retry) setConversation({ ...conversation, status: 'collecting_context', messages: [...conversation.messages, optimistic] })
    setAcceptedTurn(expectedVersion)
    setPendingRetry(null)
    setError(null)
    try {
      const result = await actionEngineService.appendMissionConversationMessage(conversation.id, {
        organizationId, expectedVersion, message, clientMessageId,
      })
      if (!mounted.current) return
      setConversation(result.conversation)
      pollingAttempt.current = 0
    } catch (cause) {
      if (!mounted.current) return
      setConversation(conversation)
      setAcceptedTurn(null)
      setPendingRetry({ message, clientMessageId, expectedVersion })
      setError(readError(cause))
    }
  }

  const confirmBrief = async () => {
    if (!conversation?.lastContextHash) return
    setAcceptedTurn(conversation.version)
    try {
      const result = await actionEngineService.confirmMissionConversationBrief(conversation.id, {
        organizationId, expectedVersion: conversation.version, briefHash: conversation.lastContextHash,
      })
      setConversation(result.conversation)
    } catch (cause) {
      setError(readError(cause)); setAcceptedTurn(null)
    }
  }

  const cancel = async () => {
    if (!conversation) return
    try {
      setConversation(await actionEngineService.cancelMissionConversation(conversation.id, { organizationId, expectedVersion: conversation.version }))
    } catch (cause) { setError(readError(cause)) }
  }

  if (loading) return <div className="grid min-h-[520px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
  if (!conversation) return <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error ?? 'Conversa não encontrada.'}</div>
  const processing = POLLING_STATUSES.has(conversation.status) || acceptedTurn != null
  const writable = canWrite && !['cancelled', 'converted', 'awaiting_plan_approval'].includes(conversation.status)
  const liveStatus = processing ? 'O agente está consultando a estratégia YUX e o contexto da empresa.' : statusLabel(conversation.status)

  return (
    <main className="flex min-h-[calc(100vh-7.5rem)] flex-col overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link aria-label="Voltar para missões" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" to={backHref}><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{conversation.title}</p><p className="mt-0.5 text-xs text-slate-500">{statusLabel(conversation.status)}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setContextOpen(true)} type="button"><BookOpen className="h-4 w-4" />Contexto usado</button>
          {conversation.missionId ? <Link className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white" to={missionHref(conversation.missionId)}>Ver missão <ExternalLink className="h-3.5 w-3.5" /></Link> : null}
          {writable && !processing ? <button aria-label="Cancelar conversa" className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => void cancel()} type="button"><XCircle className="h-4 w-4" /></button> : <MoreHorizontal className="h-4 w-4 text-slate-300" />}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <MissionConversationThread conversation={conversation} processing={processing} canWrite={writable} onQuickReply={message => void send(message)} onConfirmBrief={() => void confirmBrief()} onRetry={pendingRetry ? () => void send(pendingRetry.message, pendingRetry) : undefined} correctionHref={correctionHref} />
        <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6"><div className="mx-auto max-w-3xl">{error ? <div className="mb-2 flex items-center justify-between gap-3 text-xs text-red-600"><span>{error}</span>{pendingRetry ? <button className="shrink-0 font-semibold hover:underline" onClick={() => void send(pendingRetry.message, pendingRetry)} type="button">Tentar novamente</button> : null}</div> : null}{writable ? <MissionConversationComposer disabled={processing} onSend={send} /> : <p className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-500">{conversation.status === 'cancelled' ? 'Esta conversa foi encerrada.' : 'Acompanhe a próxima etapa na missão.'}</p>}<p className="mt-2 text-center text-[11px] text-slate-400">Nada é executado externamente sem passar pelas regras e aprovações do Action Engine.</p></div></div>
      </div>
      <p aria-live="polite" className="sr-only">{liveStatus}</p>
      <MissionContextDrawer conversation={conversation} open={contextOpen} onClose={() => setContextOpen(false)} correctionHref={correctionHref} />
    </main>
  )
}

function optimisticMessage(conversation: MissionConversation, content: string, clientMessageId: string): MissionConversationMessage {
  return { id: `pending-${clientMessageId}`, organizationId: conversation.organizationId, conversationId: conversation.id, sequence: conversation.messages.length + 1, actorType: 'user', messageKind: 'text', content, structuredPayload: {}, sourceRefs: [], clientMessageId, createdAt: new Date().toISOString() }
}

function readError(cause: unknown) { return cause instanceof Error ? cause.message : 'Não foi possível continuar a conversa agora.' }

function statusLabel(status: MissionConversation['status']) {
  return ({ collecting_context: 'Analisando contexto', awaiting_user: 'Aguardando sua resposta', brief_confirmation: 'Briefing pronto para confirmar', planning: 'Preparando plano', awaiting_plan_approval: 'Plano aguardando decisão', converted: 'Missão criada', blocked: 'Precisa de correção', cancelled: 'Conversa encerrada' } satisfies Record<MissionConversation['status'], string>)[status]
}
