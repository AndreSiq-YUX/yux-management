import { AlertCircle, CheckSquare, Copy, GitBranch, Layers3, Play, Plus, Power, Search, Square, Trash2, Workflow } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AiActionPreview } from './AiActionPreview'
import { AutomationAuditTrail } from './AutomationAuditTrail'
import { AutomationCreateDialog } from './AutomationCreateDialog'
import { AutomationDryRunToggle } from './AutomationDryRunToggle'
import { AutomationExecutionsWorkspace } from './AutomationExecutionsWorkspace'
import { AutomationGuidedBuilder } from './AutomationGuidedBuilder'
import { AutomationOnboarding } from './AutomationOnboarding'
import { AutomationRealtime } from './AutomationRealtime'
import { AutomationSimulationPanel } from './AutomationSimulationPanel'
import { AutomationTechnicalBuilder } from './AutomationTechnicalBuilder'
import { AutomationVersionPanel } from './AutomationVersionPanel'
import { ConfirmDialog } from './ConfirmDialog'
import { CrmIntegrationPreview } from './CrmIntegrationPreview'
import { EmailSettingsPanel } from './EmailSettingsPanel'
import { PortalAutomationWorkspace } from './PortalAutomationWorkspace'
import { SequencesWorkspace } from './SequencesWorkspace'
import { GrowthTemplateLibrary } from '@/components/growth-workspace/GrowthTemplateLibrary'
import { automationObjectiveTemplates, getSectorTemplate } from '@/lib/automations/sectorTemplateCatalog'
import type { AutomationAction, AutomationFlow, AutomationFlowInput } from '@/types/automation'
import type { AutomationSequence, AutomationSequenceChannel, AutomationSequenceStatus, AutomationSequenceStepKind } from '@/types/automationSequence'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'

import type { ReactNode } from 'react'

export interface AutomationWorkspaceProps {
  /** `portal` = visual do Portal do Cliente (porta de entrada por modelos + Modo avançado); `default` = tela interna (Hub YUX). */
  variant?: 'default' | 'portal'
  flows: AutomationFlow[]
  workspaceContext?: WorkspaceContextV1
  initialSection?: AutomationSection
  sequences?: AutomationSequence[]
  sequencesLoading?: boolean
  onCreateFlow?: (input: Omit<AutomationFlowInput, 'organizationId'>) => void
  onUpdateFlow?: (flowId: string, input: Partial<Pick<AutomationFlowInput, 'name' | 'description' | 'sectorTemplateKey' | 'dailyRunLimit' | 'requiresHumanApproval' | 'riskLevel' | 'builderMode' | 'graph'>>) => void
  onDeleteFlow?: (flowId: string) => void
  onDuplicateFlow?: (flowId: string) => void
  onToggleFlow?: (flowId: string, isEnabled: boolean) => void
  onPublishFlow?: (flowId: string) => void
  onBulkToggle?: (flowIds: string[], isEnabled: boolean) => void
  onBulkDelete?: (flowIds: string[]) => void
  onAddTrigger?: (flowId: string, triggerType: string, config: Record<string, unknown>) => void
  onUpdateTrigger?: (flowId: string, triggerId: string, triggerType: string, config: Record<string, unknown>) => void
  onDeleteTrigger?: (flowId: string, triggerId: string) => void
  onAddCondition?: (flowId: string, field: string, operator: string, value?: unknown) => void
  onUpdateCondition?: (flowId: string, conditionId: string, field: string, operator: string, value?: unknown) => void
  onDeleteCondition?: (flowId: string, conditionId: string) => void
  onAddAction?: (flowId: string, actionType: string, payload: Record<string, unknown>) => void
  onUpdateAction?: (flowId: string, actionId: string, actionType: string, payload: Record<string, unknown>) => void
  onDeleteAction?: (flowId: string, actionId: string) => void
  onReorderActions?: (flowId: string, actions: AutomationAction[]) => void
  onSaveSimulation?: (result: { flowId: string; eventType: string; samplePayload: Record<string, unknown>; matched: boolean; conditionResults: unknown[]; plannedActions: unknown[]; blockedReasons: string[] }) => void
  onRollbackVersion?: (flowId: string, versionId: string, versionNumber: number) => void
  onCreateFromTemplate?: (templateKey: string) => void
  onToggleDryRun?: (flowId: string, dryRun: boolean) => void
  onCreateSequence?: (input: { name: string; description?: string; channel: AutomationSequenceChannel }) => void
  onDeleteSequence?: (sequenceId: string) => void
  onToggleSequence?: (sequenceId: string, status: AutomationSequenceStatus) => void
  onAddSequenceStep?: (sequenceId: string, step: { stepKind: AutomationSequenceStepKind; channel?: 'email' | 'whatsapp'; delayMinutes: number; subject?: string; body?: string }) => void
  onDeleteSequenceStep?: (sequenceId: string, stepId: string) => void
  loadError?: string | null
  backendUnavailable?: boolean
  onRetry?: () => void
}

const sections = ['Dashboard', 'Automacoes', 'Sequencias', 'Templates', 'Execucoes', 'Configuracoes'] as const
export type AutomationSection = typeof sections[number]

const sectionLabels: Record<AutomationSection, string> = {
  Dashboard: 'Painel',
  Automacoes: 'Automações',
  Sequencias: 'Sequências',
  Templates: 'Modelos',
  Execucoes: 'Execuções',
  Configuracoes: 'Configurações',
}

const AutomationDashboard = lazy(() => import('./AutomationDashboard').then(module => ({ default: module.AutomationDashboard })))
const AutomationNodeEditor = lazy(() => import('./AutomationNodeEditor').then(module => ({ default: module.AutomationNodeEditor })))

function HeavyPanelFallback({ label }: { label: string }) {
  return <div role="status" aria-live="polite" className="grid min-h-72 place-items-center rounded-md border bg-yx-surface-2 text-sm text-yx-fg-3">{label}</div>
}

export function AutomationWorkspace(props: AutomationWorkspaceProps) {
  if (props.variant === 'portal') return <PortalAutomationWorkspace {...props} />
  return <InternalAutomationWorkspace {...props} />
}

function InternalAutomationWorkspace({
  flows,
  workspaceContext,
  initialSection = 'Automacoes',
  sequences,
  sequencesLoading,
  onCreateFlow,
  onUpdateFlow,
  onDeleteFlow,
  onDuplicateFlow,
  onToggleFlow,
  onPublishFlow,
  onBulkToggle,
  onBulkDelete,
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
  onCreateSequence,
  onDeleteSequence,
  onToggleSequence,
  onAddSequenceStep,
  onDeleteSequenceStep,
  loadError,
  backendUnavailable,
  onRetry,
}: AutomationWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<AutomationSection>(initialSection)
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(flows[0]?.id ?? null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmFlowId, setDeleteConfirmFlowId] = useState<string | null>(null)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [publishConfirmFlowId, setPublishConfirmFlowId] = useState<string | null>(null)
  const [selectedObjectiveKey, setSelectedObjectiveKey] = useState<string | undefined>(automationObjectiveTemplates[0]?.key)
  const actionsDisabled = Boolean(loadError || backendUnavailable
    || (workspaceContext && (!workspaceContext.canConfigure || !workspaceContext.moduleKeys.includes('automations'))))

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  const filteredFlows = useMemo(() => {
    return flows.filter(flow => {
      const matchesSearch = !searchQuery || flow.name.toLowerCase().includes(searchQuery.toLowerCase()) || (flow.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || flow.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [flows, searchQuery, statusFilter])

  const selected = flows.find(f => f.id === selectedFlowId) || flows[0]
  const selectedObjective = automationObjectiveTemplates.find(template => template.key === selectedObjectiveKey)

  const handleSelectFlow = (flowId: string) => {
    setSelectedFlowId(flowId)
  }

  const toggleFlowSelection = (flowId: string) => {
    setSelectedFlowIds(prev => {
      const next = new Set(prev)
      if (next.has(flowId)) next.delete(flowId)
      else next.add(flowId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedFlowIds.size === filteredFlows.length) {
      setSelectedFlowIds(new Set())
    } else {
      setSelectedFlowIds(new Set(filteredFlows.map(f => f.id)))
    }
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: flows.length }
    flows.forEach(f => { counts[f.status] = (counts[f.status] || 0) + 1 })
    return counts
  }, [flows])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-yx-fg">Automações Inteligentes</h1>
          <p className="text-sm text-yx-fg-2">Fluxos, sequências, modelos, execuções e e-mails.</p>
        </div>
        <Button type="button" title="Criar fluxo" disabled={actionsDisabled} onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo fluxo
        </Button>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-md border bg-yx-surface p-2" aria-label="Áreas de automação">
        {sections.map(section => (
          <Button
            key={section}
            type="button"
            size="sm"
            variant={section === activeSection ? 'secondary' : 'ghost'}
            aria-pressed={section === activeSection}
            onClick={() => setActiveSection(section)}
          >
            {sectionLabels[section]}
          </Button>
        ))}
      </nav>

      {loadError && (
        <AutomationNotice
          backendUnavailable={backendUnavailable}
          description={loadError}
          onRetry={onRetry}
        />
      )}

      {workspaceContext && !workspaceContext.canConfigure && (
        <div className="rounded-md border border-yx-warn-line bg-yx-warn-soft px-3 py-2 text-sm text-yx-warn">
          Este workspace permite consultar automações, mas somente um administrador pode alterá-las.
        </div>
      )}

      <div className="grid min-h-[680px] overflow-hidden rounded-md border bg-yx-surface lg:grid-cols-[340px_1fr]">
        <aside className="border-r">
          <div className="border-b p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-yx-fg">Fluxos</h2>
              <p className="text-xs text-yx-fg-3">{flows.length} total</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-yx-fg-3" />
              <Input
                className="h-8 pl-7 text-xs"
                placeholder="Buscar fluxos..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', 'draft', 'published', 'paused', 'archived'].map(status => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={statusFilter === status ? 'secondary' : 'ghost'}
                  className="h-6 px-2 text-xs"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? 'Todos' : status}
                  {statusCounts[status] !== undefined && ` (${statusCounts[status]})`}
                </Button>
              ))}
            </div>
          </div>

          {selectedFlowIds.size > 0 && (
            <div className="flex items-center justify-between border-b bg-yx-blue-soft px-3 py-2">
              <span className="text-xs font-medium text-yx-blue">{selectedFlowIds.size} selecionado(s)</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  disabled={actionsDisabled}
                  onClick={() => onBulkToggle?.(Array.from(selectedFlowIds), true)}
                >
                  Ativar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  disabled={actionsDisabled}
                  onClick={() => onBulkToggle?.(Array.from(selectedFlowIds), false)}
                >
                  Desativar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-6 text-xs"
                  disabled={actionsDisabled}
                  onClick={() => {
                    onBulkDelete?.(Array.from(selectedFlowIds))
                    setSelectedFlowIds(new Set())
                  }}
                >
                  Excluir
                </Button>
              </div>
            </div>
          )}

          <div className="divide-y overflow-y-auto max-h-[calc(680px-180px)]">
            {filteredFlows.length === 0 && (
              <div className="p-4 text-center text-sm text-yx-fg-3">
                {flows.length === 0 ? (
                  <div className="space-y-2">
                    <p>Nenhum fluxo criado.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => setOnboardingOpen(true)}>
                      Fazer tour guiado
                    </Button>
                  </div>
                ) : 'Nenhum fluxo encontrado.'}
              </div>
            )}
            {filteredFlows.map(flow => (
              <article
                key={flow.id}
                className={`cursor-pointer space-y-2 p-3 transition-colors hover:bg-yx-surface-2 ${selected?.id === flow.id ? 'bg-yx-blue-soft border-l-2 border-l-blue-500' : ''}`}
                onClick={() => handleSelectFlow(flow.id)}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="mt-0.5 shrink-0"
                    onClick={e => { e.stopPropagation(); toggleFlowSelection(flow.id) }}
                  >
                    {selectedFlowIds.has(flow.id) ? (
                      <CheckSquare className="h-4 w-4 text-yx-blue" />
                    ) : (
                      <Square className="h-4 w-4 text-yx-fg-3" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-yx-fg truncate">{flow.name}</p>
                        <p className="text-xs text-yx-fg-3 truncate">{flow.description || 'Sem descricao'}</p>
                      </div>
                      <Badge variant={flow.status === 'published' ? 'default' : 'secondary'} className="shrink-0">{flow.status}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-yx-fg-2">
                      <span className={flow.isEnabled ? 'text-yx-ok' : 'text-yx-fg-3'}>{flow.isEnabled ? 'Ativo' : 'Inativo'}</span>
                      {flow.sectorTemplateKey && <Badge variant="outline" className="text-xs">{flow.sectorTemplateKey}</Badge>}
                      {flow.lastError && <span className="text-yx-crit truncate">{flow.lastError}</span>}
                    </div>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button type="button" size="sm" variant="outline" title="Alternar fluxo" disabled={actionsDisabled} onClick={() => onToggleFlow?.(flow.id, !flow.isEnabled)}>
                        <Power className="mr-1 h-3 w-3" />
                        {flow.isEnabled ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button type="button" size="sm" variant="outline" title="Publicar fluxo" disabled={actionsDisabled} onClick={() => { setPublishConfirmFlowId(flow.id); setPublishConfirmOpen(true) }}>
                        <Play className="mr-1 h-3 w-3" />
                        Publicar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" title="Duplicar" aria-label="Duplicar fluxo" disabled={actionsDisabled} onClick={() => onDuplicateFlow?.(flow.id)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" title="Excluir" aria-label="Excluir fluxo" disabled={actionsDisabled} onClick={() => { setDeleteConfirmFlowId(flow.id); setDeleteConfirmOpen(true) }}>
                        <Trash2 className="h-3 w-3 text-yx-crit" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {filteredFlows.length > 0 && (
            <div className="border-t p-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full text-xs"
                onClick={toggleSelectAll}
              >
                {selectedFlowIds.size === filteredFlows.length ? 'Desselecionar todos' : 'Selecionar todos'}
              </Button>
            </div>
          )}
        </aside>

        <div className="min-w-0 overflow-y-auto p-4">
          {activeSection === 'Dashboard' && (
            <Suspense fallback={<HeavyPanelFallback label="Carregando indicadores..." />}>
              <AutomationDashboard flows={flows} />
            </Suspense>
          )}
          {activeSection === 'Automacoes' && (
            <div className="space-y-4">
              <AutomationObjectivePanel
                selectedKey={selectedObjectiveKey}
                onSelect={setSelectedObjectiveKey}
                onCreateFromTemplate={onCreateFromTemplate}
                disabled={actionsDisabled}
              />
              {selected && (
                <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-yx-fg-3 uppercase">Modo de Edição:</span>
                    <div className="flex rounded border bg-yx-surface-2 p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={selected.builderMode !== 'node' ? 'secondary' : 'ghost'}
                        className="h-7 px-3 text-xs"
                        disabled={actionsDisabled}
                        onClick={() => onUpdateFlow?.(selected.id, { builderMode: 'guided' })}
                      >
                        Formulário Guiado
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={selected.builderMode === 'node' ? 'secondary' : 'ghost'}
                        className="h-7 px-3 text-xs"
                        disabled={actionsDisabled}
                        onClick={() => onUpdateFlow?.(selected.id, { builderMode: 'node' })}
                      >
                        Editor de Nós Visual
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {selected && selected.builderMode === 'node' ? (
                <Suspense fallback={<HeavyPanelFallback label="Carregando editor visual..." />}>
                  <AutomationNodeEditor
                    key={selected.id}
                    flow={selected}
                    onSaveGraph={async (graph) => {
                      if (onUpdateFlow) {
                        await onUpdateFlow(selected.id, { graph })
                      }
                    }}
                  />
                </Suspense>
              ) : (
                <AutomationGuidedBuilder
                  flow={selected}
                  selectedObjectiveLabel={selectedObjective?.label}
                  disabled={actionsDisabled}
                  onAddTrigger={(triggerType, config) => selected && onAddTrigger?.(selected.id, triggerType, config)}
                  onUpdateTrigger={(triggerId, triggerType, config) => selected && onUpdateTrigger?.(selected.id, triggerId, triggerType, config)}
                  onDeleteTrigger={triggerId => selected && onDeleteTrigger?.(selected.id, triggerId)}
                  onAddCondition={(field, operator, value) => selected && onAddCondition?.(selected.id, field, operator, value)}
                  onUpdateCondition={(conditionId, field, operator, value) => selected && onUpdateCondition?.(selected.id, conditionId, field, operator, value)}
                  onDeleteCondition={conditionId => selected && onDeleteCondition?.(selected.id, conditionId)}
                  onAddAction={(actionType, payload) => selected && onAddAction?.(selected.id, actionType, payload)}
                  onUpdateAction={(actionId, actionType, payload) => selected && onUpdateAction?.(selected.id, actionId, actionType, payload)}
                  onDeleteAction={actionId => selected && onDeleteAction?.(selected.id, actionId)}
                  onReorderActions={actions => selected && onReorderActions?.(selected.id, actions)}
                />
              )}

              <AutomationTechnicalBuilder flow={selected} />
              <AutomationSimulationPanel
                flow={selected}
                onSimulate={result => selected && onSaveSimulation?.({ ...result, flowId: selected.id })}
              />
              <AutomationDryRunToggle
                flow={selected}
                onToggle={onToggleDryRun}
              />
              <AutomationVersionPanel
                flow={selected}
                onRollback={(versionId, versionNumber) => selected && onRollbackVersion?.(selected.id, versionId, versionNumber)}
              />
              <AutomationAuditTrail flow={selected || flows[0]} />
              {selected ? <FlowDetails flow={selected} /> : (
                <section className="flex min-h-[320px] items-center justify-center rounded-md border bg-yx-surface-2 text-sm text-yx-fg-3">Nenhum fluxo configurado.</section>
              )}
              {selected && <AutomationRealtime flowId={selected.id} />}
            </div>
          )}
          {activeSection === 'Sequencias' && (
            <SequencesWorkspace
              sequences={sequences}
              loading={sequencesLoading}
              onCreateSequence={onCreateSequence}
              onDeleteSequence={onDeleteSequence}
              onToggleSequence={onToggleSequence}
              onAddStep={onAddSequenceStep}
              onDeleteStep={onDeleteSequenceStep}
            />
          )}
          {activeSection === 'Templates' && <AutomationTemplatesPanel onCreateFromTemplate={onCreateFromTemplate} />}
          {activeSection === 'Execucoes' && <AutomationExecutionsWorkspace runs={selected?.executionRuns || []} />}
          {activeSection === 'Configuracoes' && <EmailSettingsPanel />}
        </div>
      </div>

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
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Excluir fluxo"
        description="Tem certeza que deseja excluir este fluxo? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirmFlowId) {
            onDeleteFlow?.(deleteConfirmFlowId)
          }
          setDeleteConfirmOpen(false)
          setDeleteConfirmFlowId(null)
        }}
      />

      <ConfirmDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
        title="Publicar fluxo"
        description="Tem certeza que deseja publicar este fluxo? Ele será ativado e começará a executar automaticamente."
        confirmLabel="Publicar"
        onConfirm={() => {
          if (publishConfirmFlowId) {
            onPublishFlow?.(publishConfirmFlowId)
          }
          setPublishConfirmOpen(false)
          setPublishConfirmFlowId(null)
        }}
      />

      {flows.length === 0 && (
        <AutomationOnboarding
          open={onboardingOpen}
          onOpenChange={setOnboardingOpen}
          onCreateFlow={() => {
            setOnboardingOpen(false)
            setCreateDialogOpen(true)
          }}
        />
      )}
    </div>
  )
}

function AutomationObjectivePanel({
  selectedKey,
  onSelect,
  onCreateFromTemplate,
  disabled,
}: {
  selectedKey?: string
  onSelect: (key: string) => void
  onCreateFromTemplate?: (templateKey: string) => void
  disabled?: boolean
}) {
  return (
    <section className="rounded-md border bg-yx-surface-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-yx-fg">O que você deseja automatizar?</h2>
          <p className="mt-1 text-sm text-yx-fg-2">Escolha primeiro o objetivo. Depois ajuste gatilho, condições e ações no construtor.</p>
        </div>
        <Badge variant="secondary">{automationObjectiveTemplates.length} objetivos</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {automationObjectiveTemplates.map(template => (
          <article
            key={template.key}
            className={`rounded-md border bg-yx-surface p-3 ${selectedKey === template.key ? 'border-yx-fg-3 shadow-sm' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-yx-fg">{template.label}</p>
                <p className="mt-1 text-xs text-yx-fg-3">{template.channel || 'crm'} - {template.requiredModuleKeys?.join(', ')}</p>
              </div>
              {!template.portalVisible && <Badge variant="outline">Interno</Badge>}
            </div>
            <p className="mt-2 min-h-[48px] text-sm text-yx-fg-2">{template.description}</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => onSelect(template.key)}>
                Selecionar
              </Button>
              <Button type="button" size="sm" disabled={disabled} onClick={() => onCreateFromTemplate?.(template.key)}>
                Criar fluxo
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function AutomationNotice({
  backendUnavailable,
  description,
  onRetry,
}: {
  backendUnavailable?: boolean
  description: string
  onRetry?: () => void
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-yx-warn-line bg-yx-warn-soft p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 text-yx-warn" />
        <div>
          <h2 className="text-sm font-semibold text-yx-warn">
            {backendUnavailable ? 'Backend de automacoes pendente' : 'Automacoes indisponiveis neste contexto'}
          </h2>
          <p className="text-sm text-yx-warn">{description}</p>
        </div>
      </div>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </section>
  )
}

function AutomationTemplatesPanel({ onCreateFromTemplate }: { onCreateFromTemplate?: (templateKey: string) => void }) {
  return (
    <div className="space-y-4">
      <GrowthTemplateLibrary
        initialFilters={{ moduleKey: 'automations', portalVisibleOnly: true }}
        onSelectTemplate={template => onCreateFromTemplate?.(template.id)}
      />
      <section className="rounded-md border bg-yx-surface p-4 space-y-4">
        <div className="flex items-start gap-2">
          <Layers3 className="mt-0.5 h-4 w-4 text-yx-fg-2" />
          <div>
            <h2 className="text-base font-semibold text-yx-fg">Modelos setoriais</h2>
            <p className="text-sm text-yx-fg-2">Modelos setoriais prontos para uso. Clique para criar um fluxo a partir do template.</p>
          </div>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
          {['clinic', 'real_estate', 'dealer', 'workshop', 'agency'].map(templateKey => {
            const template = getSectorTemplate(templateKey)
            if (!template) return null
            return (
              <div key={templateKey} className="rounded-md border bg-yx-surface-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-yx-fg">{template.label}</p>
                  <Badge variant="outline" className="text-xs">{templateKey}</Badge>
                </div>
                <p className="text-xs text-yx-fg-2">{template.description}</p>
                <div className="text-xs text-yx-fg-3">
                  {template.triggers.length} trigger(s), {template.conditions.length} condicao(oes), {template.actions.length} acao(oes)
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => onCreateFromTemplate?.(templateKey)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Criar fluxo
                </Button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function FlowDetails({ flow }: { flow: AutomationFlow }) {
  const crmActions = flow.actions.filter(a => ['change_stage', 'assign_owner', 'create_task'].includes(a.actionType))
  const aiActions = flow.actions.filter(a => a.actionType.startsWith('ai_'))

  return (
    <div className="space-y-4">
      <section className="rounded-md border bg-yx-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-yx-fg">{flow.name}</h2>
            <p className="text-sm text-yx-fg-2">{flow.description || 'Fluxo sem descricao.'}</p>
          </div>
          <div className="flex gap-2">
            <Badge>{flow.status}</Badge>
            <Badge variant={flow.isEnabled ? 'default' : 'outline'}>{flow.isEnabled ? 'Ativo' : 'Inativo'}</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <BlockList title="Trigger" icon={<GitBranch className="h-4 w-4" />} items={flow.triggers.map(trigger => `${trigger.triggerType} ${formatPayload(trigger.config)}`)} />
        <BlockList title="Condições" icon={<Workflow className="h-4 w-4" />} items={flow.conditions.map(condition => `${condition.field} ${condition.operator} ${condition.value ?? ''}`)} />
        <BlockList title="Ações" icon={<Play className="h-4 w-4" />} items={flow.actions.sort((left, right) => left.orderIndex - right.orderIndex).map(action => `${action.orderIndex}. ${action.actionType} ${formatPayload(action.payload)}`)} />
      </div>

      {crmActions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-yx-fg">Integrações CRM</h3>
          {crmActions.map(action => (
            <CrmIntegrationPreview key={action.id} action={action} />
          ))}
        </div>
      )}

      {aiActions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-yx-fg">Ações de IA</h3>
          {aiActions.map(action => (
            <AiActionPreview key={action.id} action={action} />
          ))}
        </div>
      )}

      <AutomationExecutionsWorkspace runs={flow.executionRuns} />
    </div>
  )
}

function BlockList({ title, icon, items }: { title: string; icon: ReactNode; items: string[] }) {
  return (
    <section className="rounded-md border bg-yx-surface">
      <header className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold text-yx-fg">{icon}{title}</header>
      <div className="space-y-2 p-3 text-sm text-yx-fg-2">
        {items.length ? items.map(item => <div key={item} className="rounded-md bg-yx-surface-2 px-2 py-1">{item}</div>) : <div>Sem bloco configurado</div>}
      </div>
    </section>
  )
}

function formatPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload || {})
  if (!entries.length) return ''
  return entries.map(([key, value]) => `${key}:${String(value)}`).join(' ')
}
