import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  CheckSquare,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  StickyNote,
  Trophy,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { LeadWorkspaceLayout } from './LeadWorkspaceLayout'
import { LeadProfileSummary } from './LeadProfileSummary'
import { LeadProfilePanel } from './LeadProfilePanel'
import { LeadScoreSummary } from './scoring/LeadScoreSummary'
import { LeadTemperature } from './scoring/LeadTemperature'
import { LeadDeleteButton } from './LeadDeleteDialog'
import { LeadContactDetails, LeadResearchDetails } from './LeadContactDetails'
import { LeadActivityComposer } from './LeadActivityComposer'
import { LeadEmailComposer } from './LeadEmailComposer'
import { LeadDataEditor } from './LeadDataEditor'
import { LeadRadarReconciliation } from './LeadRadarReconciliation'
import { LeadAutomationsPanel } from './LeadAutomationsPanel'
import { LeadTimeline } from './LeadTimeline'
import { LeadConversationWorkspace } from './LeadConversationWorkspace'
import { LeadAiInsightPanel } from './LeadAiInsightPanel'
import { LeadCommercialPanel } from '@/components/proposals/LeadCommercialPanel'
import { useLeadOperations, type LeadAction } from '@/hooks/useLeadOperations'
import { useLeadRecord } from '@/hooks/useLeadRecord'
import { leadSourceLabel } from '@/lib/crm/leadSourceLabel'
import type { CrmGovernanceContext, CrmLead } from '@/types/crm'

export function LeadOperationsModal({
  organizationId,
  crmInstanceId,
  lead,
  onClose,
  governance,
}: {
  organizationId: string
  crmInstanceId?: string
  lead?: CrmLead
  onClose: () => void
  governance?: CrmGovernanceContext | null
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open={!!lead}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        ref={contentRef}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          contentRef.current?.querySelector<HTMLElement>('h2')?.focus()
        }}
        className="h-[94dvh] max-h-[940px] w-[calc(100vw-1rem)] max-w-7xl overflow-hidden p-0 sm:w-[calc(100vw-3rem)]"
        aria-describedby={undefined}
      >
        {lead && (
          <LeadWorkspace
            key={lead.id}
            lead={lead}
            organizationId={organizationId}
            crmInstanceId={crmInstanceId}
            governance={governance}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
function LeadWorkspace({
  lead,
  organizationId,
  crmInstanceId,
  governance,
}: {
  lead: CrmLead
  organizationId: string
  crmInstanceId?: string
  governance?: CrmGovernanceContext | null
}) {
  const record = useLeadRecord(lead.id, organizationId)
  const ops = useLeadOperations({
    lead,
    organizationId,
    onChanged: record.refresh,
  })
  const [tab, setTab] = useState('overview'),
    [editing, setEditing] = useState(false),
    [editingProfile, setEditingProfile] = useState(false),
    [filter, setFilter] = useState('all')
  const navigate = useNavigate(),
    location = useLocation()
  const workspacePrefix = location.pathname.startsWith('/client-workspaces/')
    ? `/client-workspaces/${organizationId}`
    : location.pathname.startsWith('/portal')
      ? '/portal'
      : null
  const inboxHref = (conversationId: string) =>
    `${workspacePrefix ? `${workspacePrefix}/atendimento/conversas` : '/omnichannel'}?conversation=${encodeURIComponent(conversationId)}`
  const act = (action: LeadAction) => {
    setEditing(false)
    setEditingProfile(false)
    ops.open(action)
    setTab(
      action === 'proposal'
        ? 'commercial'
        : action === 'whatsapp'
          ? 'conversations'
          : 'activities',
    )
  }
  const edit = () => {
    ops.close()
    setEditing(true)
    setEditingProfile(false)
  }
  const changed = () => {
    window.dispatchEvent(new Event('crm-leads-changed'))
    void record.refresh()
  }
  const owner = governance?.members?.find(
    (m) =>
      m.id === lead.ownerMemberId ||
      m.userId === (lead.ownerId || lead.assignedTo),
  )
  const team = governance?.teams?.find((t) => t.id === lead.teamId)
  const radarHref = `${workspacePrefix || '/portal'}/comercial/radar/${encodeURIComponent(String(lead.attributionContext?.radarCampaignId || ''))}`
  const pending = record.tasks.filter((t) => t.status === 'pending')
  const calls = record.interactions.filter(
    (i) => filter === 'all' || i.type === filter,
  )
  const actions = [
    ['note', 'Nota', StickyNote],
    ['whatsapp', 'WhatsApp', MessageCircle],
    ['email', 'E-mail', Mail],
    ['call', 'Chamada', Phone],
    ['task', 'Tarefa', CheckSquare],
    ['meeting', 'Reunião', CalendarDays],
  ] as const
  const header = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {leadSourceLabel(lead.sourceKind, lead.source)}
          </p>
          <DialogTitle
            tabIndex={-1}
            className="break-words pr-1 text-lg font-semibold leading-tight sm:text-xl"
          >
            {lead.name}
          </DialogTitle>
          {lead.company && lead.company !== lead.name && (
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {lead.company}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={
              lead.status === 'won'
                ? 'default'
                : lead.status === 'lost'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {lead.status === 'won'
              ? 'Ganho'
              : lead.status === 'lost'
                ? 'Perdido'
                : 'Aberto'}
          </Badge>
          <span
            className="rounded-md border px-2 py-1 text-sm font-semibold"
            title="Pontuação do lead"
          >
            {lead.score}/100
          </span>
          <LeadTemperature temperature={lead.temperature} />
          <LeadDeleteButton lead={lead} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {actions.map(([key, label, Icon]) => (
          <Button
            key={key}
            variant="outline"
            size="sm"
            disabled={ops.busy}
            onClick={() => act(key)}
          >
            <Icon className="mr-1.5 size-4" />
            {label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={edit}>
          <Pencil className="mr-1.5 size-4" />
          Editar dados
        </Button>
      </div>
    </div>
  )
  const identity = (
    <>
      <LeadContactDetails lead={lead} />
      <Separator />
      {(lead.crmInstanceId || crmInstanceId) && (
        <LeadProfileSummary
          lead={lead}
          compact
          onEdit={() => {
            setEditing(false)
            setEditingProfile(true)
            ops.close()
          }}
        />
      )}
      <LeadScoreSummary
        leadId={lead.id}
        compact
        onTask={() => act('task')}
        onProposal={() => act('proposal')}
      />
      <Separator />
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Responsável</dt>
          <dd>
            {owner?.displayName ||
              owner?.email ||
              lead.ownerMemberId ||
              lead.ownerId ||
              lead.assignedTo ||
              'Não atribuído'}
          </dd>
        </div>
        {lead.teamId && (
          <div>
            <dt className="text-xs text-muted-foreground">Equipe</dt>
            <dd>{team?.name || lead.teamId}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">
            Próximo acompanhamento
          </dt>
          <dd>
            {lead.nextFollowUpAt
              ? new Date(lead.nextFollowUpAt).toLocaleString('pt-BR')
              : 'Sem agenda'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Interesse</dt>
          <dd>{lead.interest || 'Não informado'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Urgência</dt>
          <dd>
            {(
              { high: 'Alta', medium: 'Média', low: 'Baixa' } as Record<
                string,
                string
              >
            )[lead.urgency || ''] || 'Não definida'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Consentimento registrado
          </dt>
          <dd>
            {lead.consentLgpd || lead.emailOptIn || lead.whatsappOptIn
              ? 'Sim'
              : 'Não informado'}
          </dd>
        </div>
      </dl>
    </>
  )
  return (
    <LeadWorkspaceLayout
      workKey={`${editing}:${editingProfile}:${tab}:${ops.action || ''}`}
      header={header}
      identity={identity}
    >
      <div className="flex flex-col gap-4">
        {record.error && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
          >
            <p className="flex-1">{record.error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void record.refresh()}
            >
              Atualizar ficha
            </Button>
          </div>
        )}
        {ops.error && (
          <p role="alert" className="text-sm text-destructive">
            {ops.error}
          </p>
        )}
        {ops.message && (
          <p role="status" className="text-sm">
            {ops.message}
          </p>
        )}
        {editing ? (
          <LeadDataEditor
            key={lead.id}
            lead={lead}
            onSaved={() => {
              changed()
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : editingProfile ? (
          <div className="flex flex-col gap-3">
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => setEditingProfile(false)}
            >
              Voltar à ficha
            </Button>
            <LeadProfilePanel
              leadId={lead.id}
              onSaved={() => {
                changed()
                setEditingProfile(false)
              }}
            />
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value)
              ops.close()
            }}
            className="flex flex-col gap-4"
          >
            <TabsList
              className="flex h-auto w-full flex-wrap justify-start gap-1"
              aria-label="Seções da ficha"
            >
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="activities">Atividades</TabsTrigger>
              <TabsTrigger value="conversations">Conversas</TabsTrigger>
              <TabsTrigger value="commercial">Comercial</TabsTrigger>
              <TabsTrigger value="automations">Automações</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-0 flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Metric
                  label="Valor estimado"
                  value={
                    lead.value == null
                      ? 'Não informado'
                      : lead.value.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })
                  }
                />
                <Metric
                  label="Tarefas em aberto"
                  value={
                    record.loading ? 'Carregando...' : String(pending.length)
                  }
                />
                <Metric
                  label="Última atividade"
                  value={
                    lead.lastActivityAt
                      ? new Date(lead.lastActivityAt).toLocaleDateString(
                          'pt-BR',
                        )
                      : 'Sem atividade'
                  }
                />
              </div>
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Próximas atividades</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => act('task')}
                  >
                    Agendar acompanhamento
                  </Button>
                </div>
                {pending.length ? (
                  pending.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">
                          {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.dueAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <Button
                        disabled={ops.busy}
                        size="sm"
                        variant="outline"
                        onClick={() => void ops.completeTask(t.id)}
                      >
                        Concluir
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Defina o próximo contato ou registre o que foi combinado com
                    este lead.
                  </p>
                )}
              </section>
              <Separator />
              <section className="flex flex-col gap-3">
                <h3 className="font-semibold">Sobre a empresa</h3>
                <LeadResearchDetails lead={lead} />
                {(lead.source === 'Radar Comercial' ||
                  lead.attributionContext?.radarCandidateId) && (
                  <LeadRadarReconciliation
                    key={lead.id}
                    leadId={lead.id}
                    onSaved={changed}
                  />
                )}
              </section>
              <section
                className="flex flex-wrap items-center gap-2"
                aria-label="Vínculos do lead"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  Vínculos
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab('conversations')}
                >
                  Conversas vinculadas ({record.conversations.length})
                </Button>
                {lead.attributionContext?.radarCampaignId && (
                  <Button asChild size="sm" variant="outline">
                    <a href={radarHref}>Campanha do Radar</a>
                  </Button>
                )}
              </section>
              <Separator />
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Últimos registros</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTab('activities')}
                  >
                    Ver histórico
                  </Button>
                </div>
                <LeadTimeline interactions={record.interactions.slice(0, 3)} />
              </section>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Mais informações e inteligência
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <p className="text-sm">
                    Perfil {lead.fitScore ?? 0}/100 · Interesse{' '}
                    {lead.intentScore ?? 0}/100
                  </p>
                  <p className="text-sm">
                    Cadastrado em{' '}
                    {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                  {lead.notes && lead.source !== 'Radar Comercial' && (
                    <p className="whitespace-pre-wrap text-sm">{lead.notes}</p>
                  )}
                  {lead.aiSummary && (
                    <p className="text-sm">{lead.aiSummary}</p>
                  )}
                  {lead.intent && (
                    <p className="text-sm">Intenção: {lead.intent}</p>
                  )}
                  {lead.sentiment && (
                    <p className="text-sm">
                      Sentimento:{' '}
                      {
                        {
                          positive: 'Positivo',
                          neutral: 'Neutro',
                          negative: 'Negativo',
                          unknown: 'Não definido',
                        }[lead.sentiment]
                      }
                    </p>
                  )}
                  <p className="text-sm">
                    Segmento: {lead.segment || 'Não informado'}
                  </p>
                  {lead.competitor && (
                    <p className="text-sm">Concorrente: {lead.competitor}</p>
                  )}
                  {lead.objections?.map((v, i) => (
                    <p key={i} className="text-sm">
                      {v}
                    </p>
                  ))}
                  <LeadAiInsightPanel
                    lead={lead}
                    insights={record.insights}
                    fieldSuggestions={record.fieldSuggestions}
                  />
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={ops.busy || lead.status === 'won'}
                  onClick={() => void ops.markWon()}
                >
                  <Trophy className="mr-2 size-4" />
                  Marcar ganho
                </Button>
                <Button
                  disabled={ops.busy || lead.status === 'lost'}
                  variant="outline"
                  onClick={() => void ops.markLost()}
                >
                  Marcar perdido
                </Button>
                <Button variant="outline" onClick={() => act('proposal')}>
                  Preparar proposta
                </Button>
              </div>
            </TabsContent>
            <TabsContent
              value="activities"
              className="mt-0 flex flex-col gap-5"
            >
              {ops.action === 'email' ? (
                <LeadEmailComposer
                  key={lead.id}
                  lead={lead}
                  onSent={ops.changed}
                  onCancel={ops.close}
                />
              ) : ops.action &&
                ['note', 'task', 'call', 'meeting'].includes(ops.action) ? (
                <div className="flex flex-col gap-3">
                  {ops.action === 'call' &&
                    (lead.phone || lead.whatsappPhone) && (
                      <Button variant="outline" asChild>
                        <a
                          href={`tel:${(lead.phone || lead.whatsappPhone || '').replace(/[^+\d]/g, '')}`}
                        >
                          Abrir discador
                        </a>
                      </Button>
                    )}
                  <LeadActivityComposer
                    key={`${lead.id}:${ops.action}`}
                    kind={ops.action as 'note' | 'call' | 'task' | 'meeting'}
                    busy={ops.busy}
                    onSave={ops.saveActivity}
                    onCancel={ops.close}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => act('note')}>
                    Registrar nota
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act('task')}
                  >
                    Criar tarefa
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act('meeting')}
                  >
                    Agendar reunião
                  </Button>
                </div>
              )}
              <section className="flex flex-col gap-3">
                <h3 className="font-semibold">Tarefas e compromissos</h3>
                {record.tasks.length ? (
                  record.tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p className="break-words font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.dueAt).toLocaleString('pt-BR')} ·{' '}
                          {t.status === 'pending'
                            ? 'Em aberto'
                            : t.status === 'completed'
                              ? 'Concluída'
                              : 'Cancelada'}
                        </p>
                      </div>
                      {t.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ops.busy}
                          onClick={() => void ops.completeTask(t.id)}
                        >
                          Concluir
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma tarefa cadastrada.
                  </p>
                )}
              </section>
              <Separator />
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Histórico do lead</h3>
                  <label className="flex items-center gap-2 text-sm">
                    Mostrar
                    <select
                      aria-label="Filtrar histórico"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="h-9 rounded-md border bg-background px-2"
                    >
                      <option value="all">Todos os registros</option>
                      <option value="note">Notas</option>
                      <option value="call">Chamadas</option>
                      <option value="meeting">Reuniões</option>
                      <option value="email">E-mails</option>
                    </select>
                  </label>
                </div>
                <LeadTimeline interactions={calls} />
              </section>
            </TabsContent>
            <TabsContent
              value="conversations"
              className="mt-0 flex flex-col gap-4"
            >
              {lead.whatsappPhone ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <p className="text-sm">
                    WhatsApp identificado: <strong>{lead.whatsappPhone}</strong>
                  </p>
                  <Button asChild variant="outline">
                    <a
                      href={`https://wa.me/${lead.whatsappPhone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir WhatsApp
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum WhatsApp identificado. Cadastre um número confirmado em
                  Editar dados.
                </p>
              )}
              <LeadConversationWorkspace
                conversations={record.conversations}
                quickReplies={record.quickReplies}
                templates={record.templates}
                suggestions={record.responseSuggestions}
                slaEvents={record.slaEvents}
                onOpen={(id) => navigate(inboxHref(id))}
                onChanged={ops.changed}
              />
            </TabsContent>
            <TabsContent value="commercial" className="mt-0">
              <LeadCommercialPanel lead={lead} />
            </TabsContent>
            <TabsContent value="automations" className="mt-0">
              <LeadAutomationsPanel
                lead={lead}
                sequences={record.sequences}
                enrollments={record.enrollments}
                executions={record.executions}
                onChanged={record.refresh}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </LeadWorkspaceLayout>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/20 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-semibold">{value}</span>
    </div>
  )
}
