import { AlertCircle, GitBranch, Layers3, Play, Plus, Power, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AutomationExecutionsWorkspace } from './AutomationExecutionsWorkspace'
import { AutomationGuidedBuilder } from './AutomationGuidedBuilder'
import { AutomationSimulationPanel } from './AutomationSimulationPanel'
import { AutomationTechnicalBuilder } from './AutomationTechnicalBuilder'
import { EmailSettingsPanel } from './EmailSettingsPanel'
import { SequencesWorkspace } from './SequencesWorkspace'
import type { AutomationFlow } from '@/types/automation'
import type { ReactNode } from 'react'

interface AutomationWorkspaceProps {
  flows: AutomationFlow[]
  onCreateFlow?: () => void
  onToggleFlow?: (flowId: string, isEnabled: boolean) => void
  onPublishFlow?: (flowId: string) => void
  loadError?: string | null
  backendUnavailable?: boolean
  onRetry?: () => void
}

const sections = ['Automacoes', 'Sequencias', 'Templates', 'Execucoes', 'Configuracoes'] as const
type AutomationSection = typeof sections[number]

export function AutomationWorkspace({
  flows,
  onCreateFlow,
  onToggleFlow,
  onPublishFlow,
  loadError,
  backendUnavailable,
  onRetry,
}: AutomationWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<AutomationSection>('Automacoes')
  const selected = flows[0]
  const actionsDisabled = Boolean(loadError || backendUnavailable)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automacoes Inteligentes</h1>
          <p className="text-sm text-gray-600">Fluxos, sequencias, templates, execucoes e emails do YUX Hub.</p>
        </div>
        <Button type="button" title="Criar fluxo" disabled={actionsDisabled} onClick={() => onCreateFlow?.()}>
          <Plus className="mr-2 h-4 w-4" />
          Novo fluxo
        </Button>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-md border bg-white p-2" aria-label="Areas de automacao">
        {sections.map(section => (
          <Button
            key={section}
            type="button"
            size="sm"
            variant={section === activeSection ? 'secondary' : 'ghost'}
            aria-pressed={section === activeSection}
            onClick={() => setActiveSection(section)}
          >
            {section}
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

      <div className="grid min-h-[680px] overflow-hidden rounded-md border bg-white lg:grid-cols-[340px_1fr]">
        <aside className="border-r">
          <div className="border-b p-3">
            <h2 className="text-sm font-semibold text-gray-900">Fluxos</h2>
            <p className="text-xs text-gray-500">{flows.length} fluxos configurados</p>
          </div>
          <div className="divide-y">
            {flows.map(flow => (
              <article key={flow.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{flow.name}</p>
                    <p className="text-xs text-gray-500">{flow.description || 'Sem descricao'}</p>
                  </div>
                  <Badge variant={flow.status === 'published' ? 'default' : 'secondary'}>{flow.status}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span>{flow.isEnabled ? 'Ativo' : 'Inativo'}</span>
                  {flow.sectorTemplateKey && <Badge variant="outline">{flow.sectorTemplateKey}</Badge>}
                  {flow.lastError && <span className="text-red-600">{flow.lastError}</span>}
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" title="Alternar fluxo" disabled={actionsDisabled} onClick={() => onToggleFlow?.(flow.id, !flow.isEnabled)}>
                    <Power className="mr-1 h-3 w-3" />
                    {flow.isEnabled ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" title="Publicar fluxo" disabled={actionsDisabled} onClick={() => onPublishFlow?.(flow.id)}>
                    <Play className="mr-1 h-3 w-3" />
                    Publicar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto p-4">
          {activeSection === 'Automacoes' && (
            <div className="space-y-4">
              <AutomationGuidedBuilder />
              <AutomationTechnicalBuilder flow={selected} />
              <AutomationSimulationPanel flow={selected} />
              {selected ? <FlowDetails flow={selected} /> : (
                <section className="flex min-h-[320px] items-center justify-center rounded-md border bg-slate-50 text-sm text-gray-500">Nenhum fluxo configurado.</section>
              )}
            </div>
          )}
          {activeSection === 'Sequencias' && <SequencesWorkspace />}
          {activeSection === 'Templates' && <AutomationTemplatesPanel />}
          {activeSection === 'Execucoes' && <AutomationExecutionsWorkspace runs={selected?.executionRuns || []} />}
          {activeSection === 'Configuracoes' && <EmailSettingsPanel />}
        </main>
      </div>
    </div>
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
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 text-amber-700" />
        <div>
          <h2 className="text-sm font-semibold text-amber-950">
            {backendUnavailable ? 'Backend de automacoes pendente' : 'Automacoes indisponiveis neste contexto'}
          </h2>
          <p className="text-sm text-amber-800">{description}</p>
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

function AutomationTemplatesPanel() {
  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex items-start gap-2">
        <Layers3 className="mt-0.5 h-4 w-4 text-slate-600" />
        <div>
          <h2 className="text-base font-semibold text-slate-950">Templates</h2>
          <p className="text-sm text-slate-600">Modelos setoriais para clinicas, imobiliarias, revendas, oficinas e agencias.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-5">
        {['clinic', 'real_estate', 'dealer', 'workshop', 'agency'].map(template => (
          <div key={template} className="rounded-md border bg-slate-50 p-3">{template}</div>
        ))}
      </div>
    </section>
  )
}

function FlowDetails({ flow }: { flow: AutomationFlow }) {
  return (
    <div className="space-y-4">
      <section className="rounded-md border bg-gray-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{flow.name}</h2>
            <p className="text-sm text-gray-600">{flow.description || 'Fluxo sem descricao.'}</p>
          </div>
          <div className="flex gap-2">
            <Badge>{flow.status}</Badge>
            <Badge variant={flow.isEnabled ? 'default' : 'outline'}>{flow.isEnabled ? 'Ativo' : 'Inativo'}</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <BlockList title="Trigger" icon={<GitBranch className="h-4 w-4" />} items={flow.triggers.map(trigger => `${trigger.triggerType} ${formatPayload(trigger.config)}`)} />
        <BlockList title="Condicoes" icon={<Workflow className="h-4 w-4" />} items={flow.conditions.map(condition => `${condition.field} ${condition.operator} ${condition.value ?? ''}`)} />
        <BlockList title="Acoes" icon={<Play className="h-4 w-4" />} items={flow.actions.sort((left, right) => left.orderIndex - right.orderIndex).map(action => `${action.orderIndex}. ${action.actionType} ${formatPayload(action.payload)}`)} />
      </div>

      <AutomationExecutionsWorkspace runs={flow.executionRuns} />
    </div>
  )
}

function BlockList({ title, icon, items }: { title: string; icon: ReactNode; items: string[] }) {
  return (
    <section className="rounded-md border bg-white">
      <header className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold text-gray-900">{icon}{title}</header>
      <div className="space-y-2 p-3 text-sm text-gray-600">
        {items.length ? items.map(item => <div key={item} className="rounded-md bg-gray-50 px-2 py-1">{item}</div>) : <div>Sem bloco configurado</div>}
      </div>
    </section>
  )
}

function formatPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload || {})
  if (!entries.length) return ''
  return entries.map(([key, value]) => `${key}:${String(value)}`).join(' ')
}
