import { MessageCircle, Plus, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PortalPage } from '@/components/client-portal/PortalPage'
import {
  DecisionCard,
  EmptyState,
  ProgressRow,
  SectionCard,
  StatusChip,
  portalButtonClasses,
  portalFocusRing,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { formatBrl, formatMissionDate, missionStatusMeta } from '@/lib/action-engine/missionRules'
import { formatRelativeTime } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import type { ActionMission, MissionConversation } from '@/types/actionEngine'
import type { MissionDashboardProps } from './MissionDashboard'
import { missionGoalProgress } from './missionProgress'

const CLOSED_CONVERSATIONS = new Set<MissionConversation['status']>(['converted', 'cancelled'])
/** Conversas que dependem de uma resposta ou decisão do cliente. */
const AWAITING_CLIENT = new Set<MissionConversation['status']>(['awaiting_user', 'brief_confirmation', 'awaiting_plan_approval', 'blocked'])

const conversationStatusText: Record<MissionConversation['status'], string> = {
  collecting_context: 'O agente está analisando o contexto',
  awaiting_user: 'Aguardando sua resposta',
  brief_confirmation: 'Aguardando sua confirmação do briefing',
  planning: 'O agente está preparando o plano',
  awaiting_plan_approval: 'Aguardando sua decisão sobre o plano',
  converted: 'Missão criada',
  blocked: 'Precisa de uma correção sua',
  cancelled: 'Conversa encerrada',
}

const conversationActionLabel: Partial<Record<MissionConversation['status'], string>> = {
  awaiting_user: 'Responder ao agente',
  brief_confirmation: 'Confirmar briefing',
  awaiting_plan_approval: 'Revisar o plano',
  blocked: 'Corrigir informação',
}

const chipByTone: Record<(typeof missionStatusMeta)[keyof typeof missionStatusMeta]['tone'], StatusChipVariant> = {
  neutral: 'neutral',
  // Missões em andamento são trabalho da YUX.
  info: 'yux',
  warning: 'warn',
  success: 'ok',
  danger: 'crit',
}

export function conversationAwaitsClient(status: MissionConversation['status']) {
  return AWAITING_CLIENT.has(status)
}

export function PortalMissionDashboard({
  missions,
  conversations = [],
  economicsByMission = {},
  detailHref,
  conversationHref = id => id,
  canCreate,
  onCreate,
  creationMode = 'conversation',
}: MissionDashboardProps) {
  const active = missions.filter(mission => ['active', 'planning', 'ready', 'pending_plan_approval', 'evaluating'].includes(mission.status)).length
  const pending = missions.filter(mission => mission.status.includes('approval')).length
  const produced = missions.reduce((sum, mission) => sum + Number(economicsByMission[mission.id]?.producedValueBrl ?? 0), 0)
  const completed = missions.filter(mission => mission.status === 'succeeded').length

  const openConversations = conversations
    .filter(item => !CLOSED_CONVERSATIONS.has(item.status))
    .sort((a, b) => {
      const byClient = Number(conversationAwaitsClient(b.status)) - Number(conversationAwaitsClient(a.status))
      if (byClient !== 0) return byClient
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

  const CreateIcon = creationMode === 'conversation' ? MessageCircle : Plus
  const createButton = canCreate ? (
    <button type="button" onClick={onCreate} className={portalButtonClasses(creationMode === 'conversation' ? 'yux' : 'primary')}>
      <CreateIcon aria-hidden="true" />
      {creationMode === 'conversation' ? 'Conversar com o agente' : 'Criar missão'}
    </button>
  ) : undefined

  return (
    <PortalPage
      eyebrow="Execução YUX"
      title="Missões"
      description="Acompanhe as metas que a YUX está executando para você e as decisões que dependem de você."
      primaryAction={createButton}
      metrics={[
        { label: 'Valor produzido', value: formatBrl(String(produced)), detail: 'Receita confirmada nas missões' },
        { label: 'Missões ativas', value: String(active), detail: `${completed} ${completed === 1 ? 'concluída' : 'concluídas'}` },
        { label: 'Aprovações', value: String(pending), detail: 'Decisões pendentes' },
      ]}
      help={[
        'Uma missão é uma meta que a YUX executa para você, como lançar uma campanha ou recuperar oportunidades paradas.',
        'Você conversa com o agente sobre o resultado que deseja. Ele propõe o caminho e só segue depois da sua aprovação.',
        'Conversas que dependem de você aparecem primeiro, com a ação que falta.',
      ]}
    >
      {openConversations.length > 0 ? (
        <SectionCard
          id="missoes-conversas"
          title="Conversas em andamento"
          description="Continue de onde parou. As que dependem de você aparecem primeiro."
        >
          <div className={cn('grid gap-3', openConversations.length > 1 && 'md:grid-cols-2')}>
            {openConversations.map(item => {
              const awaiting = conversationAwaitsClient(item.status)
              return (
                <DecisionCard
                  key={item.id}
                  tone={awaiting ? 'yux' : 'neutral'}
                  module={{ label: 'Conversa com o agente', icon: MessageCircle }}
                  wait={formatRelativeTime(item.updatedAt)}
                  title={item.title}
                  description={conversationStatusText[item.status]}
                  actions={
                    <Link to={conversationHref(item.id)} className={portalButtonClasses(awaiting ? 'yux' : 'ghost')}>
                      {conversationActionLabel[item.status] ?? 'Abrir conversa'}
                    </Link>
                  }
                />
              )
            })}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        id="missoes-lista"
        title="Suas missões"
        description="Meta, prazo e situação de cada missão."
        action={<span className="font-mono text-xs text-yx-fg-3">{missions.length} no total</span>}
      >
        {missions.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nenhuma missão ainda"
            description={
              creationMode === 'conversation'
                ? 'Converse com o agente sobre o resultado desejado. A missão aparece aqui depois que você confirmar o briefing.'
                : 'Preencha os dados da missão para começar. Ela aparece aqui com meta, prazo e situação.'
            }
          />
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {missions.map(mission => (
              <li key={mission.id}>
                <MissionRow mission={mission} producedValueBrl={economicsByMission[mission.id]?.producedValueBrl} href={detailHref(mission.id)} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PortalPage>
  )
}

function MissionRow({ mission, producedValueBrl, href }: { mission: ActionMission; producedValueBrl?: string; href: string }) {
  const meta = missionStatusMeta[mission.status]
  const target = mission.parameters.targetRevenueBrl
  const progress = missionGoalProgress(producedValueBrl, target)
  const hasTarget = Number(target) > 0
  const subtitle = [
    hasTarget ? `Meta: ${formatBrl(target)}` : 'Sem meta definida',
    producedValueBrl !== undefined && hasTarget ? `Produzido: ${formatBrl(producedValueBrl)}` : null,
    `Prazo: ${formatMissionDate(mission.deadlineAt)}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const status = <StatusChip variant={chipByTone[meta.tone]}>{meta.label}</StatusChip>

  return (
    <Link
      to={href}
      className={cn(
        'block rounded-lg border border-yx-line bg-yx-surface p-3.5 text-yx-fg no-underline transition-colors hover:border-yx-blue',
        portalFocusRing,
      )}
    >
      {progress !== null ? (
        <ProgressRow title={mission.title} subtitle={subtitle} percent={progress} status={status} />
      ) : (
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <h3 className="font-sans text-sm font-semibold leading-[1.35] text-yx-fg">{mission.title}</h3>
            <p className="mt-px text-[12.5px] leading-snug text-yx-fg-3">{subtitle}</p>
          </div>
          <div className="shrink-0">{status}</div>
        </div>
      )}
      {mission.objective ? <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-yx-fg-2">{mission.objective}</p> : null}
    </Link>
  )
}
