import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, MessageCircle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MissionIntake } from './MissionIntake'
import { MissionDashboard } from './MissionDashboard'
import { MissionConversationComposer } from './MissionConversationComposer'
import { ErrorState, SkeletonCard, SkeletonKpiGrid, StatusChip } from '@/components/portal-ui'
import { Button } from '@/components/ui/button'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, MissionConversation, MissionEconomics } from '@/types/actionEngine'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'

type MissionsWorkspaceProps = {
  organizationId: string
  contractId?: string
  canWrite: boolean
  missionCreation: WorkspaceContextV1['missionCreation']
  detailHref: (id: string) => string
  conversationHref: (id: string) => string
  /** `portal` = visual do Portal do Cliente; `default` = tela interna (Hub YUX). */
  profile?: 'default' | 'portal'
}

const STARTER_PROMPTS = ['Criar uma campanha completa', 'Montar um funil e uma sequência de e-mails', 'Recuperar oportunidades paradas']

export function MissionsWorkspace({ organizationId, contractId, canWrite, missionCreation, detailHref, conversationHref, profile = 'default' }: MissionsWorkspaceProps) {
  const navigate = useNavigate()
  const portal = profile === 'portal'
  const compatibilityMode = missionCreation.mode === 'form'
  const creationUnavailableMessage = missionCreation.reasonCode === 'mission_supervisor_disabled'
    ? 'A criação de missões está temporariamente desativada porque o Supervisor de Missões não está habilitado. As missões existentes continuam disponíveis para consulta.'
    : 'A criação de missões não está disponível para este acesso. Você ainda pode acompanhar as missões existentes e solicitar a criação a um administrador do workspace.'
  const [missions, setMissions] = useState<ActionMission[]>([])
  const [conversations, setConversations] = useState<MissionConversation[]>([])
  const [economics, setEconomics] = useState<Record<string, MissionEconomics>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true); setLoadError(null)
    Promise.all([actionEngineService.listMissions(organizationId), actionEngineService.listMissionConversations(organizationId)]).then(async ([data, intakeData]) => {
      if (!active) return
      setMissions(data)
      setConversations(intakeData)
      const results = await Promise.allSettled(data.map(mission => actionEngineService.getEconomics(mission.id, organizationId)))
      if (!active) return
      setEconomics(Object.fromEntries(results.flatMap((result, index) => result.status === 'fulfilled' ? [[data[index].id, result.value]] : [])))
    }).catch(() => { if (active) setLoadError('Não foi possível carregar as missões. Tente novamente em instantes.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organizationId, reloadKey])

  const startConversation = async (message: string) => {
    setCreatingConversation(true); setActionError(null)
    try {
      const result = await actionEngineService.createMissionConversation({ organizationId, contractId, message })
      setConversations(current => [result.conversation, ...current.filter(item => item.id !== result.conversation.id)])
      navigate(conversationHref(result.conversation.id))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a conversa.')
      setCreatingConversation(false)
      throw cause
    }
  }

  if (loading) {
    return portal
      ? <div className="grid gap-6" aria-busy="true"><SkeletonKpiGrid count={3} /><SkeletonCard lines={3} /><SkeletonCard lines={5} /></div>
      : <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-yx-blue" /></div>
  }
  if (loadError) {
    return portal
      ? <ErrorState title="Não foi possível carregar as missões." description="Tente novamente em instantes." onRetry={() => setReloadKey(key => key + 1)} />
      : <div className="flex flex-col gap-3 border border-yx-crit-line bg-yx-crit-soft p-5 text-sm text-yx-crit sm:flex-row sm:items-center sm:justify-between"><span>{loadError}</span><Button type="button" variant="outline" onClick={() => setReloadKey(key => key + 1)}>Tentar novamente</Button></div>
  }
  return <>
    <MissionDashboard profile={profile} missions={missions} conversations={conversations} economicsByMission={economics} detailHref={detailHref} conversationHref={conversationHref} canCreate={canWrite && missionCreation.mode !== 'unavailable'} creationMode={compatibilityMode ? 'form' : 'conversation'} onCreate={() => compatibilityMode ? setIntakeOpen(true) : setConversationOpen(true)} />
    {missionCreation.mode === 'unavailable' ? <div className="mt-4 rounded-lg border border-yx-warn-line bg-yx-warn-soft p-4 text-sm text-yx-warn">{creationUnavailableMessage}</div> : null}
    {!compatibilityMode ? (
      // Radix Dialog: foco preso dentro da janela, devolvido ao botão de origem e fechamento por Esc.
      <DialogPrimitive.Root open={conversationOpen} onOpenChange={open => { if (!open && creatingConversation) return; setConversationOpen(open) }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content
            ref={dialogRef}
            aria-label="Iniciar conversa sobre uma missão"
            aria-describedby="mission-conversation-description"
            onOpenAutoFocus={event => {
              // Foco inicial no campo de texto, onde o cliente começa a escrever.
              const field = dialogRef.current?.querySelector<HTMLElement>('textarea')
              if (field) { event.preventDefault(); field.focus() }
            }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] border border-yx-line bg-yx-surface p-5 text-yx-fg shadow-lg sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-gradient text-white"><MessageCircle aria-hidden="true" className="h-5 w-5" /></span>
                <DialogPrimitive.Title className="mt-4 font-display text-xl font-semibold tracking-[-0.01em] text-yx-fg">O que você quer que a YUX realize?</DialogPrimitive.Title>
                <DialogPrimitive.Description id="mission-conversation-description" className="mt-2 text-sm leading-6 text-yx-fg-2">Pode explicar do seu jeito. O agente consultará a estratégia YUX, os dados da empresa e as ferramentas do seu plano antes de propor o caminho.</DialogPrimitive.Description>
                <div className="mt-3"><StatusChip variant="yux">Agente YUX</StatusChip></div>
              </div>
              <DialogPrimitive.Close aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-yx-fg-3 hover:bg-yx-surface-2 hover:text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue sm:h-8 sm:w-8" type="button">
                <X aria-hidden="true" className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {STARTER_PROMPTS.map(prompt => (
                <button className="min-h-10 rounded-full border border-yx-line-strong bg-yx-surface px-3 py-1.5 text-xs font-medium text-yx-fg-2 hover:border-yx-blue hover:text-yx-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue disabled:opacity-60 sm:min-h-0" key={prompt} onClick={() => void startConversation(prompt).catch(() => undefined)} disabled={creatingConversation} type="button">{prompt}</button>
              ))}
            </div>
            {actionError ? <div role="alert" className="mt-4 rounded-lg border border-yx-crit-line bg-yx-crit-soft p-3 text-sm text-yx-crit">{actionError} O texto foi preservado para você tentar novamente.</div> : null}
            <div className="mt-4"><MissionConversationComposer disabled={creatingConversation} onSend={startConversation} placeholder="Ex.: Quero captar mais empresas de Londrina para nossos serviços…" /></div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    ) : null}
    {compatibilityMode ? <MissionIntake open={intakeOpen} organizationId={organizationId} contractId={contractId} canWrite={canWrite} onOpenChange={setIntakeOpen} onCreated={mission => setMissions(current => [mission, ...current])} /> : null}
  </>
}
