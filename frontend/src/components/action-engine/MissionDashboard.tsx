import { ArrowRight, Bot, CircleDollarSign, Clock3, MessageCircle, Plus, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MissionStatusBadge } from './MissionStatusBadge'
import { PortalMissionDashboard } from './PortalMissionDashboard'
import { formatBrl, formatMissionDate, missionStatusMeta } from '@/lib/action-engine/missionRules'
import type { ActionMission, MissionConversation, MissionEconomics } from '@/types/actionEngine'

export type MissionDashboardProps = {
  missions: ActionMission[]
  conversations?: MissionConversation[]
  economicsByMission?: Record<string, MissionEconomics>
  detailHref: (missionId: string) => string
  conversationHref?: (conversationId: string) => string
  canCreate: boolean
  onCreate: () => void
  creationMode?: 'conversation' | 'form'
  /** `portal` = visual do Portal do Cliente; `default` = tela interna (Hub YUX). */
  profile?: 'default' | 'portal'
}

export function MissionDashboard(props: MissionDashboardProps) {
  if (props.profile === 'portal') return <PortalMissionDashboard {...props} />
  return <InternalMissionDashboard {...props} />
}

function InternalMissionDashboard({ missions, conversations = [], economicsByMission = {}, detailHref, conversationHref = id => id, canCreate, onCreate, creationMode = 'conversation' }: MissionDashboardProps) {
  const active = missions.filter(mission => ['active', 'planning', 'ready', 'pending_plan_approval', 'evaluating'].includes(mission.status)).length
  const pending = missions.filter(mission => mission.status.includes('approval')).length
  const produced = missions.reduce((sum, mission) => sum + Number(economicsByMission[mission.id]?.producedValueBrl ?? 0), 0)
  const completed = missions.filter(mission => mission.status === 'succeeded').length

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-yx-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-yx-fg">Missões</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-yx-fg-2">Acompanhe as metas que a YUX está executando para você e as decisões que dependem de você.</p>
        </div>
        {canCreate && <CreateButton creationMode={creationMode} onClick={onCreate} />}
      </header>

      <section className="grid border border-yx-line bg-yx-surface sm:grid-cols-3">
        <Metric icon={CircleDollarSign} label="Valor produzido" value={formatBrl(String(produced))} detail="Receita confirmada nas missões" tone="green" />
        <Metric icon={Bot} label="Missões ativas" value={String(active)} detail={`${completed} ${completed === 1 ? 'concluída' : 'concluídas'}`} />
        <Metric icon={Clock3} label="Aprovações" value={String(pending)} detail="Decisões pendentes" tone="amber" />
      </section>

      {conversations.filter(item => !['converted', 'cancelled'].includes(item.status)).length ? <section className="overflow-hidden border border-yx-line-strong bg-yx-surface"><div className="flex items-center justify-between border-b border-yx-line-strong bg-yx-blue-soft px-5 py-4"><div><h2 className="font-semibold text-yx-fg">Pedidos em conversa</h2><p className="mt-1 text-xs text-yx-fg-3">Continue de onde parou antes de a missão ser criada.</p></div><MessageCircle className="h-5 w-5 text-yx-blue" /></div><div className="divide-y divide-yx-line">{conversations.filter(item => !['converted', 'cancelled'].includes(item.status)).map(item => <Link className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-yx-surface-2" key={item.id} to={conversationHref(item.id)}><div className="min-w-0"><p className="truncate text-sm font-semibold text-yx-fg">{item.title}</p><p className="mt-1 text-xs text-yx-fg-3">{conversationStatus(item.status)}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-yx-fg-3" /></Link>)}</div></section> : null}

      <section className="border border-yx-line bg-yx-surface">
        <div className="flex items-center justify-between border-b border-yx-line px-5 py-4">
          <div><h2 className="font-semibold text-yx-fg">Portfólio de missões</h2><p className="mt-1 text-xs text-yx-fg-3">Meta, prazo e situação de cada missão.</p></div>
          <span className="text-xs font-semibold text-yx-fg-3">{missions.length} no total</span>
        </div>
        {missions.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-8 text-center"><div><ShieldCheck className="mx-auto h-9 w-9 text-yx-fg-3" /><h3 className="mt-4 font-semibold text-yx-fg">Nenhuma missão criada</h3><p className="mt-2 text-sm text-yx-fg-3">{creationMode === 'conversation' ? 'Converse com o agente sobre o resultado desejado. A missão aparecerá aqui após você confirmar o briefing.' : 'Preencha os dados da missão para começar.'}</p>{canCreate ? <span className="mt-5 inline-flex"><CreateButton creationMode={creationMode} onClick={onCreate} /></span> : null}</div></div>
        ) : (
          <div className="divide-y divide-yx-line">
            {missions.map(mission => {
              const meta = missionStatusMeta[mission.status]
              return (
                <Link key={mission.id} to={detailHref(mission.id)} className="grid gap-4 px-5 py-4 transition-colors hover:bg-yx-surface-2 lg:grid-cols-[minmax(260px,1.5fr)_1fr_1fr_auto] lg:items-center">
                  <div><h3 className="font-semibold text-yx-fg">{mission.title}</h3><p className="mt-1 line-clamp-1 text-xs text-yx-fg-3">{mission.objective}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-yx-fg-3">Meta</p><p className="mt-1 text-sm font-semibold text-yx-fg">{formatBrl(mission.parameters.targetRevenueBrl)}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-yx-fg-3">Prazo</p><p className="mt-1 text-sm text-yx-fg-2">{formatMissionDate(mission.deadlineAt)}</p></div>
                  <div className="flex items-center justify-between gap-3 lg:justify-end"><MissionStatusBadge {...meta} /><ArrowRight className="h-4 w-4 text-yx-fg-3" /></div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function CreateButton({ creationMode, onClick }: { creationMode: 'conversation' | 'form'; onClick: () => void }) {
  const Icon = creationMode === 'conversation' ? MessageCircle : Plus
  return <button type="button" onClick={onClick} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-yx-blue px-4 text-sm font-semibold text-white hover:bg-yx-blue-ink"><Icon className="h-4 w-4" /> {creationMode === 'conversation' ? 'Conversar com o agente' : 'Criar missão'}</button>
}

function conversationStatus(status: MissionConversation['status']) {
  return ({ collecting_context: 'Agente analisando o contexto', awaiting_user: 'Aguardando sua resposta', brief_confirmation: 'Briefing pronto para confirmar', planning: 'Plano em preparação', awaiting_plan_approval: 'Plano aguardando decisão', converted: 'Missão criada', blocked: 'Precisa de uma correção', cancelled: 'Conversa encerrada' } satisfies Record<MissionConversation['status'], string>)[status]
}

function Metric({ icon: Icon, label, value, detail, tone = 'blue' }: { icon: typeof Bot; label: string; value: string; detail: string; tone?: 'blue' | 'green' | 'amber' | 'violet' }) {
  const color = { blue: 'text-yx-blue bg-yx-blue-soft', green: 'text-yx-ok bg-yx-ok-soft', amber: 'text-yx-warn bg-yx-warn-soft', violet: 'text-brand-violet-500 bg-yx-blue-soft' }[tone]
  return <article className="flex min-h-32 items-center gap-4 border-b border-yx-line p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className={`grid h-10 w-10 place-items-center ${color}`}><Icon className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-yx-fg-3">{label}</p><p className="mt-2 text-2xl font-semibold text-yx-fg">{value}</p><p className="mt-1 text-xs text-yx-fg-3">{detail}</p></div></article>
}
