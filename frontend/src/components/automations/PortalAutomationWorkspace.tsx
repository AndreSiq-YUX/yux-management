import { Copy, FlaskConical, History, Pause, Play, Plus, Search, Settings2, Trash2, Wand2, Zap } from 'lucide-react'
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  MasterDetail,
  SectionCard,
  SkeletonCard,
  StatusChip,
  portalButtonClasses,
  portalFocusRing,
} from '@/components/portal-ui'
import { Input } from '@/components/ui/input'
import { automationObjectiveTemplates, getSectorTemplate, type SectorTemplate } from '@/lib/automations/sectorTemplateCatalog'
import { cn } from '@/lib/utils'
import type { AutomationFlow } from '@/types/automation'
import { AiActionPreview } from './AiActionPreview'
import { AutomationAuditTrail } from './AutomationAuditTrail'
import { AutomationCreateDialog } from './AutomationCreateDialog'
import { AutomationDryRunToggle } from './AutomationDryRunToggle'
import { AutomationExecutionsWorkspace, type AutomationExecutionRow } from './AutomationExecutionsWorkspace'
import { AutomationGuidedBuilder } from './AutomationGuidedBuilder'
import { AutomationOnboarding } from './AutomationOnboarding'
import { AutomationSimulationPanel } from './AutomationSimulationPanel'
import { AutomationTechnicalBuilder } from './AutomationTechnicalBuilder'
import { AutomationVersionPanel } from './AutomationVersionPanel'
import type { AutomationWorkspaceProps } from './AutomationWorkspace'
import { CrmIntegrationPreview } from './CrmIntegrationPreview'
import { describeAction, describeCondition, flowStatus, isRunInProgress, objectiveChannelLabel, triggerLabel } from './automationLabels'

const AutomationNodeEditor = lazy(() => import('./AutomationNodeEditor').then(module => ({ default: module.AutomationNodeEditor })))

type PortalSection = 'Automacoes' | 'Templates' | 'Execucoes'
type FlowFilter = 'all' | 'active' | 'paused' | 'draft'

export const AUTOMATION_MOBILE_EDIT_NOTICE = 'A edição de fluxos funciona melhor no computador.'

const sectionCopy: Record<PortalSection, { title: string; description: string }> = {
  Automacoes: {
    title: 'Fluxos',
    description: 'Escolha o que você quer automatizar e ative. Os fluxos trabalham sozinhos e você acompanha tudo em Execuções.',
  },
  Templates: {
    title: 'Modelos de fluxo',
    description: 'Modelos prontos por objetivo e por setor. Escolha um, crie o fluxo e ajuste depois, se quiser.',
  },
  Execucoes: {
    title: 'Execuções',
    description: 'Veja o que cada fluxo fez, quando fez e o motivo de qualquer falha.',
  },
}

const filterLabels: Record<FlowFilter, string> = { all: 'Todos', active: 'Ativos', paused: 'Pausados', draft: 'Rascunhos' }

function matchesFilter(flow: AutomationFlow, filter: FlowFilter) {
  if (filter === 'all') return true
  if (filter === 'draft') return flow.status === 'draft'
  if (filter === 'active') return flow.isEnabled && flow.status !== 'draft'
  return !flow.isEnabled && flow.status !== 'draft'
}

/** Colunas que preenchem a linha (4 / 3 / 2 / 1), sem cartão sozinho. */
function templateColumns(count: number) {
  if (count > 0 && count % 4 === 0) return 'md:grid-cols-2 xl:grid-cols-4'
  if (count > 0 && count % 3 === 0) return 'md:grid-cols-3'
  if (count > 0 && count % 2 === 0) return 'md:grid-cols-2'
  return 'grid-cols-1'
}

/**
 * Variante do Portal do Cliente para Automações.
 * Porta de entrada: "O que você quer automatizar?" com modelos; o construtor técnico fica em "Modo avançado".
 */
export function PortalAutomationWorkspace({
  flows,
  workspaceContext,
  initialSection = 'Automacoes',
  onCreateFlow,
  onDeleteFlow,
  onDuplicateFlow,
  onToggleFlow,
  onPublishFlow,
  onUpdateFlow,
  onAddTrigger,
  onUpdateTrigger,
  onDeleteTrigger,
  onAddCondition,
  onUpdateCondition,
  onDeleteCondition,
  onAddAction,
  onUpdateAction,
  onDeleteAction,
  onReorderActions,
  onSaveSimulation,
  onRollbackVersion,
  onCreateFromTemplate,
  onToggleDryRun,
  loadError,
  onRetry,
}: AutomationWorkspaceProps) {
  const section: PortalSection = initialSection === 'Templates' || initialSection === 'Execucoes' ? initialSection : 'Automacoes'
  const [advanced, setAdvanced] = useState(false)
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FlowFilter>('all')
  const [pauseTarget, setPauseTarget] = useState<{ flow: AutomationFlow; running: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AutomationFlow | null>(null)
  const [publishTarget, setPublishTarget] = useState<AutomationFlow | null>(null)

  const canConfigure = workspaceContext ? workspaceContext.canConfigure && workspaceContext.moduleKeys.includes('automations') : true
  const actionsDisabled = Boolean(loadError || !canConfigure)
  const disabledReason = loadError
    ? 'As alterações ficam disponíveis quando as automações voltarem a carregar.'
    : !canConfigure
      ? 'Você pode consultar as automações, mas somente um administrador pode alterá-las.'
      : null

  const copy = sectionCopy[section]
  const allRuns = useMemo<AutomationExecutionRow[]>(
    () => flows.flatMap(flow => flow.executionRuns.map(run => ({ ...run, flowName: flow.name }))),
    [flows],
  )
  const activeFlows = flows.filter(flow => flow.isEnabled && flow.status !== 'draft').length
  const failedRuns = allRuns.filter(run => run.status === 'failed').length

  const selected = flows.find(flow => flow.id === selectedFlowId) ?? null
  const visibleTemplates = automationObjectiveTemplates.filter(template => template.portalVisible)

  const filteredFlows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return flows.filter(flow => {
      const matchesSearch = !query || flow.name.toLowerCase().includes(query) || (flow.description ?? '').toLowerCase().includes(query)
      return matchesSearch && matchesFilter(flow, filter)
    })
  }, [flows, search, filter])

  const requestToggle = (flow: AutomationFlow) => {
    if (!flow.isEnabled) {
      onToggleFlow?.(flow.id, true)
      return
    }
    const running = flow.executionRuns.filter(isRunInProgress).length
    if (running > 0) {
      setPauseTarget({ flow, running })
      return
    }
    onToggleFlow?.(flow.id, false)
  }

  return (
    <PortalPage
      eyebrow="Automações"
      title={copy.title}
      description={copy.description}
      primaryAction={
        section === 'Automacoes' ? (
          <button
            type="button"
            aria-pressed={advanced}
            onClick={() => setAdvanced(current => !current)}
            className={portalButtonClasses(advanced ? 'primary' : 'ghost')}
          >
            <Settings2 aria-hidden="true" />
            Modo avançado
          </button>
        ) : undefined
      }
      metrics={[
        { label: 'Fluxos ativos', value: String(activeFlows), detail: `de ${flows.length} ${flows.length === 1 ? 'fluxo' : 'fluxos'}` },
        { label: 'Execuções registradas', value: String(allRuns.length), detail: 'Somando todos os fluxos' },
        { label: 'Execuções com falha', value: String(failedRuns), detail: failedRuns > 0 ? 'Veja o motivo em Execuções' : 'Nenhuma falha registrada' },
      ]}
      help={[
        'Um fluxo é uma automação: quando algo acontece (gatilho), e se as condições forem atendidas, a ação é feita sozinha.',
        'Comece por um modelo pronto. Você ajusta gatilho, condições e ações depois, no Modo avançado.',
        'Use o Modo de teste para ver o que o fluxo faria sem executar as ações de verdade.',
      ]}
      related={
        section === 'Automacoes'
          ? [{ label: 'Modelos de fluxo', href: '/portal/automacoes/templates' }, { label: 'Execuções', href: '/portal/automacoes/execucoes' }]
          : section === 'Templates'
            ? [{ label: 'Fluxos', href: '/portal/automacoes/fluxos' }, { label: 'Execuções', href: '/portal/automacoes/execucoes' }]
            : [{ label: 'Fluxos', href: '/portal/automacoes/fluxos' }, { label: 'Modelos de fluxo', href: '/portal/automacoes/templates' }]
      }
    >
      {loadError ? <ErrorState title="Automações indisponíveis no momento" description={loadError} onRetry={onRetry} /> : null}
      {disabledReason && !loadError ? (
        <p role="note" className="rounded-lg border border-yx-warn-line bg-yx-warn-soft px-3.5 py-2.5 text-[13px] text-yx-warn">
          {disabledReason}
        </p>
      ) : null}

      {section === 'Automacoes' ? (
        <>
          <SectionCard
            id="automacoes-entrada"
            title="O que você quer automatizar?"
            description="Escolha um modelo pronto. Você ajusta gatilho, condições e ações depois, se quiser."
          >
            <TemplateGrid
              templates={visibleTemplates}
              disabled={actionsDisabled}
              onCreate={key => onCreateFromTemplate?.(key)}
              onCreateFromScratch={() => setCreateDialogOpen(true)}
            />
          </SectionCard>

          <SectionCard
            id="automacoes-fluxos"
            title="Seus fluxos"
            description="Ative, pause ou abra um fluxo para ver o que ele faz."
            action={<span className="font-mono text-xs text-yx-fg-3">{flows.length} no total</span>}
          >
            {flows.length === 0 ? (
              <EmptyState
                icon={Zap}
                title="Nenhum fluxo ainda"
                description="Escolha um dos modelos acima para criar o primeiro fluxo. Ele aparece aqui para você ativar, pausar e acompanhar."
              />
            ) : (
              <MasterDetail
                listWidth={340}
                onBack={() => setSelectedFlowId(null)}
                backLabel="Voltar para os fluxos"
                emptyDetail={
                  <div className="rounded-[10px] border border-dashed border-yx-line-strong px-5 py-10 text-center text-[13px] text-yx-fg-2">
                    Selecione um fluxo para ver o que ele faz e ativar ou pausar.
                  </div>
                }
                list={
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
                    <label className="relative block">
                      <span className="sr-only">Buscar fluxos</span>
                      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yx-fg-3" />
                      <Input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar fluxos…"
                        className="h-10 pl-9 text-[13px]"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar fluxos">
                      {(Object.keys(filterLabels) as FlowFilter[]).map(key => {
                        const count = flows.filter(flow => matchesFilter(flow, key)).length
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={filter === key}
                            onClick={() => setFilter(key)}
                            className={portalButtonClasses(filter === key ? 'primary' : 'ghost', 'min-h-10 px-3 text-xs')}
                          >
                            {filterLabels[key]} ({count})
                          </button>
                        )
                      })}
                    </div>
                    {filteredFlows.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-yx-line-strong px-3 py-6 text-center text-[13px] text-yx-fg-2">Nenhum fluxo encontrado.</p>
                    ) : (
                      <ul className="m-0 grid min-w-0 list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
                        {filteredFlows.map(flow => (
                          <li key={flow.id}>
                            <FlowListItem flow={flow} selected={selected?.id === flow.id} onSelect={() => setSelectedFlowId(flow.id)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                }
                detail={
                  selected ? (
                    <FlowDetailPanel
                      flow={selected}
                      advanced={advanced}
                      actionsDisabled={actionsDisabled}
                      disabledReason={disabledReason}
                      onToggle={() => requestToggle(selected)}
                      onPublish={() => setPublishTarget(selected)}
                      onDuplicate={() => onDuplicateFlow?.(selected.id)}
                      onDelete={() => setDeleteTarget(selected)}
                      onEnableAdvanced={() => setAdvanced(true)}
                    >
                      {advanced ? (
                        <AdvancedEditor
                          flow={selected}
                          disabled={actionsDisabled}
                          onUpdateFlow={onUpdateFlow}
                          onAddTrigger={onAddTrigger}
                          onUpdateTrigger={onUpdateTrigger}
                          onDeleteTrigger={onDeleteTrigger}
                          onAddCondition={onAddCondition}
                          onUpdateCondition={onUpdateCondition}
                          onDeleteCondition={onDeleteCondition}
                          onAddAction={onAddAction}
                          onUpdateAction={onUpdateAction}
                          onDeleteAction={onDeleteAction}
                          onReorderActions={onReorderActions}
                          onSaveSimulation={onSaveSimulation}
                          onRollbackVersion={onRollbackVersion}
                          onToggleDryRun={onToggleDryRun}
                        />
                      ) : null}
                    </FlowDetailPanel>
                  ) : null
                }
              />
            )}
            {flows.length === 0 ? (
              <div className="mt-3 flex justify-center">
                <button type="button" className={portalButtonClasses('ghost')} onClick={() => setOnboardingOpen(true)}>
                  Ver como funciona
                </button>
              </div>
            ) : null}
          </SectionCard>
        </>
      ) : null}

      {section === 'Templates' ? (
        <>
          <SectionCard id="modelos-objetivo" title="Por objetivo" description="Comece pelo resultado que você quer: responder mais rápido, acompanhar propostas, reativar clientes.">
            <TemplateGrid
              templates={visibleTemplates}
              disabled={actionsDisabled}
              onCreate={key => onCreateFromTemplate?.(key)}
              onCreateFromScratch={() => setCreateDialogOpen(true)}
            />
          </SectionCard>
          <SectionCard id="modelos-setor" title="Por setor" description="Fluxos já montados para a rotina de cada tipo de negócio.">
            <TemplateGrid
              templates={['clinic', 'real_estate', 'dealer', 'workshop', 'agency'].map(key => getSectorTemplate(key)).filter((item): item is SectorTemplate => Boolean(item))}
              disabled={actionsDisabled}
              onCreate={key => onCreateFromTemplate?.(key)}
              showChannel={false}
            />
          </SectionCard>
        </>
      ) : null}

      {section === 'Execucoes' ? (
        <SectionCard id="execucoes" title="Histórico de execuções" description="Da mais recente para a mais antiga.">
          <AutomationExecutionsWorkspace variant="portal" runs={allRuns} />
        </SectionCard>
      ) : null}

      <AutomationCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={input => {
          onCreateFlow?.(input)
          setCreateDialogOpen(false)
        }}
        disabled={actionsDisabled}
      />

      <ConfirmDialog
        open={pauseTarget !== null}
        onOpenChange={open => { if (!open) setPauseTarget(null) }}
        title="Pausar este fluxo?"
        description={
          pauseTarget
            ? `${pauseTarget.running} ${pauseTarget.running === 1 ? 'execução está em andamento' : 'execuções estão em andamento'} e ${pauseTarget.running === 1 ? 'vai continuar' : 'vão continuar'} até terminar. Novas execuções não serão iniciadas enquanto o fluxo estiver pausado.`
            : ''
        }
        confirmLabel="Pausar fluxo"
        onConfirm={() => {
          if (pauseTarget) onToggleFlow?.(pauseTarget.flow.id, false)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="Excluir este fluxo?"
        description={deleteTarget ? `O fluxo "${deleteTarget.name}" será removido e deixará de rodar. Esta ação não pode ser desfeita.` : ''}
        confirmLabel="Excluir fluxo"
        tone="danger"
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteFlow?.(deleteTarget.id)
            if (deleteTarget.id === selectedFlowId) setSelectedFlowId(null)
          }
        }}
      />

      <ConfirmDialog
        open={publishTarget !== null}
        onOpenChange={open => { if (!open) setPublishTarget(null) }}
        title="Publicar este fluxo?"
        description="Ele será ativado e começará a executar automaticamente."
        confirmLabel="Publicar"
        onConfirm={() => {
          if (publishTarget) onPublishFlow?.(publishTarget.id)
        }}
      />

      {flows.length === 0 ? (
        <AutomationOnboarding
          open={onboardingOpen}
          onOpenChange={setOnboardingOpen}
          onCreateFlow={() => {
            setOnboardingOpen(false)
            setCreateDialogOpen(true)
          }}
        />
      ) : null}
    </PortalPage>
  )
}

function TemplateGrid({
  templates,
  disabled,
  onCreate,
  onCreateFromScratch,
  showChannel = true,
}: {
  templates: SectorTemplate[]
  disabled?: boolean
  onCreate: (templateKey: string) => void
  onCreateFromScratch?: () => void
  showChannel?: boolean
}) {
  const count = templates.length + (onCreateFromScratch ? 1 : 0)
  return (
    <ul className={cn('m-0 grid list-none gap-3 p-0', templateColumns(count))}>
      {templates.map(template => (
        <li key={template.key} className="flex">
          <article className="flex w-full flex-col gap-2 rounded-lg border border-yx-line bg-yx-surface p-3.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-[15px] font-semibold leading-[1.35] text-yx-fg">{template.label}</h3>
              {showChannel && template.channel ? <StatusChip>{objectiveChannelLabel[template.channel] ?? template.channel}</StatusChip> : null}
            </div>
            <p className="flex-1 text-[13px] leading-normal text-yx-fg-2">{template.description}</p>
            <p className="font-mono text-[11.5px] text-yx-fg-3">
              {template.triggers.length} {template.triggers.length === 1 ? 'gatilho' : 'gatilhos'} · {template.conditions.length} {template.conditions.length === 1 ? 'condição' : 'condições'} · {template.actions.length} {template.actions.length === 1 ? 'ação' : 'ações'}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onCreate(template.key)}
              aria-label={`Criar fluxo: ${template.label}`}
              className={portalButtonClasses('primary', 'mt-1 w-full')}
            >
              <Plus aria-hidden="true" />
              Criar fluxo
            </button>
          </article>
        </li>
      ))}
      {onCreateFromScratch ? (
        <li className="flex">
          <article className="flex w-full flex-col gap-2 rounded-lg border border-dashed border-yx-line-strong bg-yx-surface p-3.5">
            <h3 className="font-display text-[15px] font-semibold leading-[1.35] text-yx-fg">Outra automação</h3>
            <p className="flex-1 text-[13px] leading-normal text-yx-fg-2">Não achou o que precisa? Monte do zero escolhendo gatilho, condições e ações.</p>
            <button
              type="button"
              disabled={disabled}
              onClick={onCreateFromScratch}
              className={portalButtonClasses('ghost', 'mt-1 w-full')}
            >
              <Wand2 aria-hidden="true" />
              Criar do zero
            </button>
          </article>
        </li>
      ) : null}
    </ul>
  )
}

function FlowListItem({ flow, selected, onSelect }: { flow: AutomationFlow; selected: boolean; onSelect: () => void }) {
  const status = flowStatus(flow)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg border bg-yx-surface p-3 text-left transition-colors hover:border-yx-blue',
        selected ? 'border-yx-blue bg-yx-blue-soft' : 'border-yx-line',
        portalFocusRing,
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-yx-fg sm:truncate">{flow.name}</span>
        <StatusChip variant={status.variant}>{status.label}</StatusChip>
      </span>
      <span className="truncate text-[12.5px] text-yx-fg-3">{flow.description || 'Sem descrição'}</span>
      {flow.riskLevel === 'test' || flow.lastError ? (
        <span className="flex flex-wrap gap-1.5">
          {flow.riskLevel === 'test' ? <StatusChip variant="warn" icon={FlaskConical}>Modo de teste</StatusChip> : null}
          {flow.lastError ? <StatusChip variant="crit">Com erro</StatusChip> : null}
        </span>
      ) : null}
    </button>
  )
}

function FlowDetailPanel({
  flow,
  advanced,
  actionsDisabled,
  disabledReason,
  onToggle,
  onPublish,
  onDuplicate,
  onDelete,
  onEnableAdvanced,
  children,
}: {
  flow: AutomationFlow
  advanced: boolean
  actionsDisabled: boolean
  disabledReason: string | null
  onToggle: () => void
  onPublish: () => void
  onDuplicate: () => void
  onDelete: () => void
  onEnableAdvanced: () => void
  children?: ReactNode
}) {
  const status = flowStatus(flow)
  const crmActions = flow.actions.filter(action => ['change_stage', 'assign_owner', 'create_task'].includes(action.actionType))
  const aiActions = flow.actions.filter(action => action.actionType.startsWith('ai_'))
  const orderedActions = [...flow.actions].sort((left, right) => left.orderIndex - right.orderIndex)
  const isDraft = flow.status === 'draft'

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-yx-fg">{flow.name}</h3>
          <StatusChip variant={status.variant}>{status.label}</StatusChip>
          {flow.riskLevel === 'test' ? <StatusChip variant="warn" icon={FlaskConical}>Modo de teste</StatusChip> : null}
        </div>
        <p className="text-[13.5px] text-yx-fg-2">{flow.description || 'Fluxo sem descrição.'}</p>
        {flow.lastError ? <p role="alert" className="rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-[13px] text-yx-crit">{flow.lastError}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {isDraft ? (
          <button type="button" disabled={actionsDisabled} onClick={onPublish} className={portalButtonClasses('primary')}>
            <Play aria-hidden="true" />
            Publicar
          </button>
        ) : (
          <button type="button" disabled={actionsDisabled} onClick={onToggle} className={portalButtonClasses(flow.isEnabled ? 'ghost' : 'primary')}>
            {flow.isEnabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {flow.isEnabled ? 'Pausar' : 'Ativar'}
          </button>
        )}
        <button type="button" disabled={actionsDisabled} onClick={onDuplicate} className={portalButtonClasses('ghost')}>
          <Copy aria-hidden="true" />
          Duplicar
        </button>
        {!advanced ? (
          <button type="button" onClick={onEnableAdvanced} className={portalButtonClasses('ghost')}>
            <Settings2 aria-hidden="true" />
            Editar no modo avançado
          </button>
        ) : null}
        <button type="button" disabled={actionsDisabled} onClick={onDelete} className={portalButtonClasses('ghost', 'text-yx-crit hover:border-yx-crit hover:text-yx-crit')}>
          <Trash2 aria-hidden="true" />
          Excluir
        </button>
      </div>
      {actionsDisabled && disabledReason ? <p className="text-[13px] text-yx-fg-3">{disabledReason}</p> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <FlowBlock title="Gatilho" hint="Quando acontece" items={flow.triggers.map(trigger => triggerLabel(trigger.triggerType))} />
        <FlowBlock title="Condições" hint="Se for o caso" items={flow.conditions.map(describeCondition)} emptyText="Sem condições: roda sempre que o gatilho ocorrer." />
        <FlowBlock title="Ações" hint="Então faz" items={orderedActions.map(describeAction)} />
      </div>

      {crmActions.length > 0 ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold text-yx-fg">Integrações com o comercial</h4>
          {crmActions.map(action => <CrmIntegrationPreview key={action.id} action={action} />)}
        </div>
      ) : null}
      {aiActions.length > 0 ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold text-yx-fg">Ações com IA</h4>
          {aiActions.map(action => <AiActionPreview key={action.id} action={action} />)}
        </div>
      ) : null}

      <div className="grid gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-yx-fg"><History aria-hidden="true" className="h-4 w-4" />Últimas execuções</h4>
        <AutomationExecutionsWorkspace variant="portal" runs={flow.executionRuns} limit={5} />
      </div>

      {children}
    </div>
  )
}

function FlowBlock({ title, hint, items, emptyText = 'Nada configurado ainda.' }: { title: string; hint: string; items: string[]; emptyText?: string }) {
  return (
    <section className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
      <h4 className="text-sm font-semibold text-yx-fg">{title}</h4>
      <p className="font-mono text-[11px] uppercase tracking-[0.07em] text-yx-fg-3">{hint}</p>
      <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[13px] text-yx-fg-2">
        {items.length > 0 ? items.map((item, index) => <li key={`${item}-${index}`} className="rounded-md bg-yx-surface px-2 py-1.5">{item}</li>) : <li>{emptyText}</li>}
      </ul>
    </section>
  )
}

type AdvancedHandlers = Pick<
  AutomationWorkspaceProps,
  | 'onUpdateFlow'
  | 'onAddTrigger'
  | 'onUpdateTrigger'
  | 'onDeleteTrigger'
  | 'onAddCondition'
  | 'onUpdateCondition'
  | 'onDeleteCondition'
  | 'onAddAction'
  | 'onUpdateAction'
  | 'onDeleteAction'
  | 'onReorderActions'
  | 'onSaveSimulation'
  | 'onRollbackVersion'
  | 'onToggleDryRun'
>

/** Construtor técnico (formulário guiado, editor visual, teste, versões). Só aparece no Modo avançado. */
function AdvancedEditor({ flow, disabled, ...handlers }: { flow: AutomationFlow; disabled: boolean } & AdvancedHandlers) {
  const nodeMode = flow.builderMode === 'node'
  return (
    <section aria-label="Modo avançado" className="grid gap-4 rounded-[10px] border border-yx-line-strong p-3.5 sm:p-4">
      <div>
        <h4 className="font-display text-base font-semibold text-yx-fg">Modo avançado: editar este fluxo</h4>
        <p className="mt-0.5 text-[13px] text-yx-fg-3">Ajuste o gatilho, as condições e as ações, teste sem executar de verdade e volte para versões anteriores.</p>
      </div>
      <p role="note" data-testid="automation-mobile-edit-notice" className="rounded-lg border border-yx-warn-line bg-yx-warn-soft px-3 py-2 text-[13px] text-yx-warn lg:hidden">
        {AUTOMATION_MOBILE_EDIT_NOTICE}
      </p>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Modo de edição">
        <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-yx-fg-3">Modo de edição</span>
        <button
          type="button"
          aria-pressed={!nodeMode}
          disabled={disabled}
          onClick={() => handlers.onUpdateFlow?.(flow.id, { builderMode: 'guided' })}
          className={portalButtonClasses(!nodeMode ? 'primary' : 'ghost')}
        >
          Formulário guiado
        </button>
        <button
          type="button"
          aria-pressed={nodeMode}
          disabled={disabled}
          onClick={() => handlers.onUpdateFlow?.(flow.id, { builderMode: 'node' })}
          className={portalButtonClasses(nodeMode ? 'primary' : 'ghost')}
        >
          Editor visual
        </button>
      </div>

      <div className="min-w-0 overflow-x-auto">
        {nodeMode ? (
          <Suspense fallback={<SkeletonCard lines={5} />}>
            <AutomationNodeEditor
              key={flow.id}
              flow={flow}
              onSaveGraph={async graph => {
                if (handlers.onUpdateFlow) await handlers.onUpdateFlow(flow.id, { graph })
              }}
            />
          </Suspense>
        ) : (
          <AutomationGuidedBuilder
            flow={flow}
            disabled={disabled}
            onAddTrigger={(triggerType, config) => handlers.onAddTrigger?.(flow.id, triggerType, config)}
            onUpdateTrigger={(triggerId, triggerType, config) => handlers.onUpdateTrigger?.(flow.id, triggerId, triggerType, config)}
            onDeleteTrigger={triggerId => handlers.onDeleteTrigger?.(flow.id, triggerId)}
            onAddCondition={(field, operator, value) => handlers.onAddCondition?.(flow.id, field, operator, value)}
            onUpdateCondition={(conditionId, field, operator, value) => handlers.onUpdateCondition?.(flow.id, conditionId, field, operator, value)}
            onDeleteCondition={conditionId => handlers.onDeleteCondition?.(flow.id, conditionId)}
            onAddAction={(actionType, payload) => handlers.onAddAction?.(flow.id, actionType, payload)}
            onUpdateAction={(actionId, actionType, payload) => handlers.onUpdateAction?.(flow.id, actionId, actionType, payload)}
            onDeleteAction={actionId => handlers.onDeleteAction?.(flow.id, actionId)}
            onReorderActions={actions => handlers.onReorderActions?.(flow.id, actions)}
          />
        )}
      </div>

      <AutomationDryRunToggle flow={flow} onToggle={handlers.onToggleDryRun} />
      <AutomationSimulationPanel flow={flow} onSimulate={result => handlers.onSaveSimulation?.({ ...result, flowId: flow.id })} />
      <AutomationTechnicalBuilder flow={flow} />
      <AutomationVersionPanel flow={flow} onRollback={(versionId, versionNumber) => handlers.onRollbackVersion?.(flow.id, versionId, versionNumber)} />
      <AutomationAuditTrail flow={flow} />
    </section>
  )
}
