import { Bot, GitBranch, ListChecks, Save, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AiAssistantSettings } from '@/types/aiAssistant'
import type { ReactNode } from 'react'

interface AssistantSettingsPanelProps {
  organizationId: string
  assistant?: AiAssistantSettings | null
  onSaveAssistant?: (organizationId: string) => void
}

const emptyAssistant: AiAssistantSettings = {
  id: 'new',
  organizationId: '',
  name: 'Assistente comercial',
  tone: 'consultivo',
  status: 'draft',
  summaryEnabled: true,
  classificationEnabled: true,
  objectives: [],
  requiredFields: [],
  handoffRules: [],
  safetyRules: [],
  knowledgeLinks: [],
  createdAt: '',
  updatedAt: '',
}

export function AssistantSettingsPanel({
  organizationId,
  assistant,
  onSaveAssistant,
}: AssistantSettingsPanelProps) {
  const settings = assistant || { ...emptyAssistant, organizationId }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Assistente IA</h2>
        <Button type="button" size="sm" title="Salvar assistente IA" onClick={() => onSaveAssistant?.(organizationId)}>
          <Save className="mr-1 h-3 w-3" />
          Salvar
        </Button>
      </div>
      <div className="grid gap-4 rounded-md border bg-white p-3 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-gray-600">Nome</span>
            <input className="h-9 w-full rounded-md border px-2" defaultValue={settings.name} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-gray-600">Tom</span>
            <select className="h-9 w-full rounded-md border px-2" defaultValue={settings.tone}>
              <option value="consultivo">consultivo</option>
              <option value="objetivo">objetivo</option>
              <option value="acolhedor">acolhedor</option>
              <option value="premium">premium</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-gray-600">Resumo</span>
            <select className="h-9 w-full rounded-md border px-2" defaultValue={settings.summaryEnabled ? 'enabled' : 'disabled'}>
              <option value="enabled">ativo</option>
              <option value="disabled">inativo</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-gray-600">Classificacao</span>
            <select className="h-9 w-full rounded-md border px-2" defaultValue={settings.classificationEnabled ? 'enabled' : 'disabled'}>
              <option value="enabled">ativa</option>
              <option value="disabled">inativa</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <PanelList icon={<Bot className="h-4 w-4" />} title="Objetivos" items={settings.objectives.map(objective => objective.label)} empty="Sem objetivo" />
          <PanelList icon={<ListChecks className="h-4 w-4" />} title="Campos" items={settings.requiredFields.map(field => field.label)} empty="Sem campos" />
          <PanelList icon={<GitBranch className="h-4 w-4" />} title="Handoff" items={settings.handoffRules.map(rule => rule.name)} empty="Sem regras" />
          <PanelList icon={<ShieldCheck className="h-4 w-4" />} title="Safety" items={settings.safetyRules.map(rule => rule.name)} empty="Sem regras" />
        </div>
      </div>
      <div className="rounded-md border bg-white p-3 text-sm">
        <div className="font-medium text-gray-900">Conhecimento vinculado</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {settings.knowledgeLinks.length
            ? settings.knowledgeLinks.map(link => <span key={link.id} className="rounded-md border px-2 py-1 text-xs text-gray-600">{link.title}</span>)
            : <span className="text-xs text-gray-500">Sem conhecimento vinculado</span>}
        </div>
      </div>
    </section>
  )
}

function PanelList({
  icon,
  title,
  items,
  empty,
}: {
  icon: ReactNode
  title: string
  items: string[]
  empty: string
}) {
  return (
    <div className="rounded-md border bg-gray-50 p-3">
      <div className="mb-2 flex items-center gap-2 font-medium text-gray-900">{icon}{title}</div>
      <div className="space-y-1 text-xs text-gray-600">
        {items.length ? items.map(item => <div key={item}>{item}</div>) : <div>{empty}</div>}
      </div>
    </div>
  )
}
