import { useEffect, useState } from 'react'
import { Loader2, MessageCircle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MissionIntake } from './MissionIntake'
import { MissionDashboard } from './MissionDashboard'
import { MissionConversationComposer } from './MissionConversationComposer'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, MissionConversation, MissionEconomics } from '@/types/actionEngine'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'

export function MissionsWorkspace({ organizationId, contractId, canWrite, missionCreation, detailHref, conversationHref }: { organizationId: string; contractId?: string; canWrite: boolean; missionCreation: WorkspaceContextV1['missionCreation']; detailHref: (id: string) => string; conversationHref: (id: string) => string }) {
  const navigate = useNavigate()
  const compatibilityMode = missionCreation.mode === 'form'
  const [missions, setMissions] = useState<ActionMission[]>([])
  const [conversations, setConversations] = useState<MissionConversation[]>([])
  const [economics, setEconomics] = useState<Record<string, MissionEconomics>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)

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
    }).catch(cause => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Não foi possível carregar as missões.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organizationId])

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

  if (loading) return <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" /></div>
  if (loadError) return <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-700">{loadError}</div>
  return <>
    <MissionDashboard missions={missions} conversations={conversations} economicsByMission={economics} detailHref={detailHref} conversationHref={conversationHref} canCreate={canWrite && missionCreation.mode !== 'unavailable'} creationMode={compatibilityMode ? 'form' : 'conversation'} onCreate={() => compatibilityMode ? setIntakeOpen(true) : setConversationOpen(true)} />
    {missionCreation.mode === 'unavailable' ? <div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">A criação de missões não está disponível para este acesso. Você ainda pode acompanhar as missões existentes e solicitar a criação a um administrador do workspace.</div> : null}
    {!compatibilityMode && conversationOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Iniciar conversa sobre uma missão"><div className="w-full max-w-2xl rounded-2xl bg-slate-50 p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"><MessageCircle className="h-5 w-5" /></span><h2 className="mt-4 text-xl font-semibold text-slate-950">O que você quer que a YUX realize?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Pode explicar do seu jeito. O agente consultará a estratégia YUX, os dados da empresa e as ferramentas do seu plano antes de propor o caminho.</p></div><button aria-label="Fechar" className="rounded-full p-2 text-slate-500 hover:bg-white" onClick={() => setConversationOpen(false)} type="button"><X className="h-4 w-4" /></button></div><div className="mt-5 flex flex-wrap gap-2">{['Criar uma campanha completa', 'Montar um funil e uma sequência de e-mails', 'Recuperar oportunidades paradas'].map(prompt => <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700" key={prompt} onClick={() => void startConversation(prompt).catch(() => undefined)} disabled={creatingConversation} type="button">{prompt}</button>)}</div>{actionError ? <div className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError} O texto foi preservado para você tentar novamente.</div> : null}<div className="mt-4"><MissionConversationComposer disabled={creatingConversation} onSend={startConversation} placeholder="Ex.: Quero captar mais empresas de Londrina para nossos serviços…" /></div></div></div> : null}
    {compatibilityMode ? <MissionIntake open={intakeOpen} organizationId={organizationId} contractId={contractId} canWrite={canWrite} onOpenChange={setIntakeOpen} onCreated={mission => setMissions(current => [mission, ...current])} /> : null}
  </>
}
