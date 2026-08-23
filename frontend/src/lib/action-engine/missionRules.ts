import type { ActionMission, ActionRunStatus, MissionActionRun, MissionMetric, MissionStatus } from '@/types/actionEngine'

export const missionStatusMeta: Record<MissionStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: 'Rascunho', tone: 'neutral' }, qualifying: { label: 'Qualificando', tone: 'info' }, planning: { label: 'Planejando', tone: 'info' },
  pending_plan_approval: { label: 'Aguardando plano', tone: 'warning' }, ready: { label: 'Pronta', tone: 'info' }, active: { label: 'Em execução', tone: 'info' },
  paused: { label: 'Pausada', tone: 'warning' }, blocked: { label: 'Bloqueada', tone: 'danger' }, evaluating: { label: 'Avaliando', tone: 'info' },
  pending_replan_approval: { label: 'Aguardando replanejamento', tone: 'warning' }, succeeded: { label: 'Concluída', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' }, expired: { label: 'Expirada', tone: 'neutral' }, cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const actionStatusMeta: Record<ActionRunStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pendente', tone: 'neutral' }, ready: { label: 'Pronta', tone: 'info' }, waiting_approval: { label: 'Aguardando aprovação', tone: 'warning' },
  queued: { label: 'Na fila', tone: 'info' }, running: { label: 'Em andamento', tone: 'info' }, retry_scheduled: { label: 'Nova tentativa agendada', tone: 'warning' },
  succeeded: { label: 'Concluída', tone: 'success' }, failed: { label: 'Falhou', tone: 'danger' }, blocked: { label: 'Bloqueada', tone: 'danger' },
  skipped: { label: 'Ignorada', tone: 'neutral' }, cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const planStatusLabel: Record<string, string> = {
  proposed: 'Proposto', validating: 'Validando', invalid: 'Inválido', pending_approval: 'Aguardando aprovação',
  approved: 'Aprovado', active: 'Ativo', superseded: 'Substituído', completed: 'Concluído', cancelled: 'Cancelado',
}

export const approvalStatusLabel: Record<string, string> = {
  pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', changes_requested: 'Alterações solicitadas', expired: 'Expirada', cancelled: 'Cancelada',
}

export const approvalTypeLabel: Record<string, string> = {
  plan: 'Plano', replan: 'Replanejamento', population: 'População', canary: 'Lote canário', action: 'Ação', external_effect: 'Efeito externo',
}

export const missionModeLabel: Record<string, string> = { assisted: 'Assistido', prepare: 'Preparação', shadow: 'Simulação', autonomous: 'Autônomo' }

export function missionProgress(actions: MissionActionRun[]) {
  if (!actions.length) return 0
  const complete = actions.filter(action => ['succeeded', 'skipped', 'cancelled'].includes(action.status)).length
  return Math.round((complete / actions.length) * 100)
}

export function availableMissionCommands(mission: ActionMission) {
  return {
    qualify: mission.status === 'draft',
    plan: ['qualifying', 'blocked'].includes(mission.status),
    approvePlan: mission.status === 'pending_plan_approval' || mission.status === 'pending_replan_approval',
    start: mission.status === 'ready',
    pause: mission.status === 'active',
    resume: mission.status === 'paused',
    evaluate: ['active', 'paused', 'blocked'].includes(mission.status),
    cancel: !['succeeded', 'failed', 'expired', 'cancelled'].includes(mission.status),
  }
}

export function formatBrl(value?: string) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(number)
}

export function formatMetric(metric?: MissionMetric) {
  if (!metric || metric.kind !== 'known') return 'Indisponível'
  if (metric.unit === 'BRL') return formatBrl(metric.value)
  if (metric.unit === 'ratio') return `${(Number(metric.value) * 100).toFixed(1)}%`
  if (metric.unit === 'hours') return `${Number(metric.value).toFixed(1)} h`
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(metric.value))
}

export function formatMissionDate(value?: string) {
  if (!value) return 'Sem prazo'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
